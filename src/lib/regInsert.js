// Picking a registration number and saving it without ever reusing a submission number.
//
// Each device keeps counters of the highest submission per event (src/lib/regNumber.js),
// fed by the initial load, realtime and the catch-up reload. They can still be behind: a
// page left open whose realtime connection quietly dropped issued 050-057 on 2026-11-06
// when 050-058 already existed. The database refuses a reused submission number
// (migration 053, error 23505 naming reg_number); on that error we reload the event's
// numbers from the database, take the next free one and try again.
import { buildRegNumber, noteRegNumber } from "./regNumber.js";

// Next number from the counters, which are raised right away so a family submitted in one
// loop gets distinct numbers. groupSubmission: join that submission (next person) instead
// of opening a new one.
export function takeRegSlot(counters, eventId, groupSubmission) {
  const submission = groupSubmission || (counters.submissions[eventId] || 0) + 1;
  if (submission > (counters.submissions[eventId] || 0)) counters.submissions[eventId] = submission;
  const key = eventId + ":" + submission;
  const person = (counters.persons[key] || 0) + 1;
  counters.persons[key] = person;
  return { submission, person };
}

// The insert was refused because the number is taken (the unique index on reg_number or
// the per-event submission check of migration 053).
export function isRegNumberConflict(error) {
  return !!error && error.code === "23505" && /reg_number/.test((error.message || "") + " " + (error.details || ""));
}

// row: the registrations row to insert, reg_number already set (it is updated on retry).
// insert(row) → Promise<{ data, error }>
// loadNumbers(eventId) → Promise<[{ regNumber, eventId }]>: every number of the event in the database.
// onRenumber(previous, next): the number changed before a retry (to update optimistic state).
// Resolves to the last insert result plus the reg number it used.
export async function insertWithFreeRegNumber({ row, counters, event, today, groupSubmission, insert, loadNumbers, onRenumber, maxAttempts = 6 }) {
  for (let attempt = 1; ; attempt++) {
    const res = await insert(row);
    if (!isRegNumberConflict(res.error) || attempt >= maxAttempts) return { ...res, regNumber: row.reg_number };
    try {
      const taken = await loadNumbers(event.id);
      for (const r of taken || []) noteRegNumber(counters, r);
    } catch {
      // Couldn't reload: the counters still move past the number that was refused.
    }
    noteRegNumber(counters, { eventId: event.id, regNumber: row.reg_number });
    const next = takeRegSlot(counters, event.id, groupSubmission);
    const previous = row.reg_number;
    row.reg_number = buildRegNumber(event.prefix, today, next.submission, next.person);
    if (onRenumber) onRenumber(previous, row.reg_number);
  }
}
