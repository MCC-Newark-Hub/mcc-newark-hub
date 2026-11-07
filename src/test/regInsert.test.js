import { describe, it, expect } from "vitest";
import { buildRegNumber, parseRegNumber, regCounters } from "../lib/regNumber.js";
import { insertWithFreeRegNumber, isRegNumberConflict, takeRegSlot } from "../lib/regInsert.js";

const EVENT = { id: "EVT003", prefix: "PA202612" };

// A fake registrations table that applies the rule of migration 053: a submission number
// is unique per event whatever the day; person 1 opens a submission, 2+ join one.
function fakeDb(existing) {
  const rows = existing.map((n) => ({ event_id: EVENT.id, reg_number: n }));
  return {
    rows,
    async insert(row) {
      const p = parseRegNumber(row.reg_number);
      const clash = rows.some((r) => {
        const q = parseRegNumber(r.reg_number);
        return r.event_id === row.event_id && q && q.submission === p.submission && (p.person === 1 || q.person === p.person);
      });
      if (clash) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "registrations_submission_key": reg_number ${row.reg_number}` } };
      rows.push({ ...row });
      return { data: { ...row }, error: null };
    },
    async loadNumbers(eventId) {
      return rows.filter((r) => r.event_id === eventId).map((r) => ({ eventId, regNumber: r.reg_number }));
    },
  };
}

function rowFor(counters, today, groupSubmission) {
  const slot = takeRegSlot(counters, EVENT.id, groupSubmission);
  return { event_id: EVENT.id, reg_number: buildRegNumber(EVENT.prefix, today, slot.submission, slot.person) };
}

describe("takeRegSlot", () => {
  it("opens the next submission, person 1", () => {
    const c = regCounters([{ eventId: EVENT.id, regNumber: "PA202612-1105-049-1" }]);
    expect(takeRegSlot(c, EVENT.id)).toEqual({ submission: 50, person: 1 });
    expect(takeRegSlot(c, EVENT.id)).toEqual({ submission: 51, person: 1 });
  });

  it("joins a submission with the next person", () => {
    const c = regCounters([{ eventId: EVENT.id, regNumber: "PA202612-1105-054-1" }]);
    expect(takeRegSlot(c, EVENT.id, 54)).toEqual({ submission: 54, person: 2 });
    expect(takeRegSlot(c, EVENT.id, 54)).toEqual({ submission: 54, person: 3 });
  });
});

describe("isRegNumberConflict", () => {
  it("is the reg_number conflict, not the one-active-registration-per-member index", () => {
    expect(isRegNumberConflict({ code: "23505", message: 'duplicate key value violates unique constraint "registrations_reg_number_key"', details: "Key (reg_number)=(X) already exists." })).toBe(true);
    expect(isRegNumberConflict({ code: "23505", message: 'duplicate key value violates unique constraint "registrations_active_member_event_uidx"' })).toBe(false);
    expect(isRegNumberConflict(null)).toBe(false);
  });
});

describe("insertWithFreeRegNumber", () => {
  // 2026-11-06: a team leader's page had counters from before the evening of 11-05
  // (last submission 049) while 050-058 were already in the database.
  const taken = ["PA202612-1105-049-1", ...[50, 51, 52, 53, 54, 55, 56, 57].map((n) => buildRegNumber("PA202612", "2026-11-05", n, 1)), "PA202612-1106-058-1"];

  it("a stale device never reuses a submission number from an earlier day", async () => {
    const db = fakeDb(taken);
    const counters = regCounters([{ eventId: EVENT.id, regNumber: "PA202612-1105-049-1" }]);
    const renumbered = [];
    // The team leader's batch: several people in one synchronous loop, saved in parallel.
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        insertWithFreeRegNumber({
          row: rowFor(counters, "2026-11-06"),
          counters, event: EVENT, today: "2026-11-06",
          insert: db.insert, loadNumbers: db.loadNumbers,
          onRenumber: (prev, next) => renumbered.push([prev, next]),
        }),
      ),
    );
    expect(results.every((r) => !r.error)).toBe(true);
    const subs = results.map((r) => parseRegNumber(r.regNumber).submission).sort((a, b) => a - b);
    expect(subs).toEqual([59, 60, 61]);
    expect(renumbered.length).toBe(3);
    // Every submission number in the table is used by one submission only.
    const opened = db.rows.map((r) => parseRegNumber(r.reg_number)).filter((p) => p.person === 1).map((p) => p.submission);
    expect(new Set(opened).size).toBe(opened.length);
  });

  it("someone joining a submission takes the next free person number", async () => {
    const db = fakeDb(["PA202612-1105-054-1", "PA202612-1106-054-2"]);
    const counters = regCounters([{ eventId: EVENT.id, regNumber: "PA202612-1105-054-1" }]); // hasn't seen -2
    const res = await insertWithFreeRegNumber({
      row: rowFor(counters, "2026-11-07", 54),
      counters, event: EVENT, today: "2026-11-07", groupSubmission: 54,
      insert: db.insert, loadNumbers: db.loadNumbers,
    });
    expect(res.error).toBeNull();
    expect(res.regNumber).toBe("PA202612-1107-054-3");
  });

  it("an up-to-date device saves on the first try", async () => {
    const db = fakeDb(taken);
    const counters = regCounters(await db.loadNumbers(EVENT.id));
    const res = await insertWithFreeRegNumber({
      row: rowFor(counters, "2026-11-07"),
      counters, event: EVENT, today: "2026-11-07",
      insert: db.insert, loadNumbers: db.loadNumbers,
      onRenumber: () => { throw new Error("should not renumber"); },
    });
    expect(res.regNumber).toBe("PA202612-1107-059-1");
  });

  it("other errors are returned as they are, without retrying", async () => {
    let calls = 0;
    const err = { code: "23505", message: 'duplicate key value violates unique constraint "registrations_active_member_event_uidx"' };
    const counters = regCounters([]);
    const res = await insertWithFreeRegNumber({
      row: rowFor(counters, "2026-11-07"),
      counters, event: EVENT, today: "2026-11-07",
      insert: async () => { calls++; return { data: null, error: err }; },
      loadNumbers: async () => [],
    });
    expect(calls).toBe(1);
    expect(res.error).toBe(err);
  });

  it("gives up after maxAttempts", async () => {
    let calls = 0;
    const counters = regCounters([]);
    const res = await insertWithFreeRegNumber({
      row: rowFor(counters, "2026-11-07"),
      counters, event: EVENT, today: "2026-11-07", maxAttempts: 3,
      insert: async () => { calls++; return { data: null, error: { code: "23505", message: "reg_number taken" } }; },
      loadNumbers: async () => [],
    });
    expect(calls).toBe(3);
    expect(isRegNumberConflict(res.error)).toBe(true);
  });
});
