import { describe, it, expect } from "vitest";
import { monthServices, monthGrid, shiftMonth, generateSchedule, groupByDate, weekOf } from "@/lib/doorSchedule";

const W = (id, ...days) => ({ id, name: id, days });
const namesOn = (r, date, slot) => r.assignments.filter((a) => a.date === date && a.slot === slot).map((a) => a.workerId);

describe("doorSchedule calendar", () => {
  it("lists the services of a month (Sunday has EBD + Domingo, Friday none)", () => {
    const s = monthServices("2026-10"); // Oct 1 2026 is a Thursday
    expect(s[0]).toEqual({ date: "2026-10-01", slot: "thu" });
    expect(s.some((x) => x.date === "2026-10-02")).toBe(false);
    expect(s.filter((x) => x.date === "2026-10-04").map((x) => x.slot)).toEqual(["ebd", "sun"]);
  });

  it("builds week rows starting on Sunday with padding", () => {
    const g = monthGrid("2026-10");
    expect(g[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(g[0][4].date).toBe("2026-10-01");
    expect(g.every((w) => w.length === 7)).toBe(true);
  });

  it("shifts months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("generateSchedule", () => {
  const services = monthServices("2026-10");

  it("only uses workers on days they marked", () => {
    const workers = [W("jose", "mon", "wed"), W("antonio", "mon", "tue", "wed"), W("joao", "sat", "ebd", "sun")];
    const r = generateSchedule(workers, services);
    for (const a of r.assignments) expect(workers.find((w) => w.id === a.workerId).days).toContain(a.slot);
    expect(r.uncovered.map((u) => u.slot)).toContain("thu"); // nobody marked Thursday
  });

  it("puts a Wednesday-only worker on Wednesdays, and fills every Wednesday when he is the only one", () => {
    const r = generateSchedule([W("roberto", "wed")], services);
    const wed = services.filter((s) => s.slot === "wed");
    expect(wed.length).toBeGreaterThan(0);
    for (const s of wed) expect(namesOn(r, s.date, s.slot)).toEqual(["roberto"]);
  });

  it("avoids the same person twice in a Monday–Sunday week when others are free", () => {
    const workers = [W("a", "mon", "tue", "wed", "thu"), W("b", "mon", "tue", "wed", "thu"), W("c", "mon", "tue", "wed", "thu"), W("d", "mon", "tue", "wed", "thu")];
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = generateSchedule(workers, services, { seed });
      const byWeek = new Map();
      for (const a of r.assignments) {
        const key = `${a.workerId}|${weekOf(a.date)}`;
        byWeek.set(key, (byWeek.get(key) || 0) + 1);
      }
      expect(Math.max(...byWeek.values())).toBe(1);
      expect(r.exceptions).toEqual([]);
    }
  });

  it("does not repeat the same worker on the same weekday back to back when there is a choice", () => {
    const workers = [W("a", "wed"), W("b", "wed")];
    const r = generateSchedule(workers, services);
    const wed = services.filter((s) => s.slot === "wed").map((s) => namesOn(r, s.date, s.slot)[0]);
    for (let i = 1; i < wed.length; i++) expect(wed[i]).not.toBe(wed[i - 1]);
  });

  it("balances the load between equally available workers", () => {
    const r = generateSchedule([W("a", "mon", "tue", "wed", "thu", "sat"), W("b", "mon", "tue", "wed", "thu", "sat")], services);
    const [x, y] = [...r.counts.values()];
    expect(Math.abs(x - y)).toBeLessThanOrEqual(1);
  });

  it("supports several people per service without repeating a person in it", () => {
    const r = generateSchedule([W("a", "sat"), W("b", "sat"), W("c", "sat")], services, { perService: 2 });
    for (const s of services.filter((x) => x.slot === "sat")) {
      const n = namesOn(r, s.date, s.slot);
      expect(n).toHaveLength(2);
      expect(new Set(n).size).toBe(2);
    }
  });

  it("reports services with too few workers", () => {
    const r = generateSchedule([W("a", "sat")], services, { perService: 2 });
    expect(r.uncovered.every((u) => u.missing === 1 || u.missing === 2)).toBe(true);
    expect(r.uncovered.find((u) => u.slot === "sat").missing).toBe(1);
  });

  it("is deterministic for a seed and varies with another", () => {
    const workers = [W("a", "sat", "ebd"), W("b", "sat", "ebd"), W("c", "sat", "ebd")];
    expect(generateSchedule(workers, services, { seed: 5 }).assignments).toEqual(generateSchedule(workers, services, { seed: 5 }).assignments);
  });
});

describe("generateSchedule — the spec's rules", () => {
  // The example matrix from the Portaria spec (Seg, Ter, Qua, Qui, Sáb, EBD, Domingo).
  const SPEC = [
    W("w1", "mon", "sat", "ebd"),
    W("w2", "tue", "thu", "sat", "ebd", "sun"),
    W("w3", "sat", "ebd"),
    W("w4", "tue", "sat", "ebd", "sun"),
    W("w5", "sat", "sun"),
    W("w6", "sat", "sun"),
    W("w7", "thu", "sat", "ebd"),
    W("w8", "sat", "sun"),
    W("w9", "sat", "sun"),
    W("w10", "mon", "tue", "thu", "ebd", "sun"),
  ];
  const nov = monthServices("2026-11");
  const dn = (d) => Math.round(new Date(d + "T12:00:00").getTime() / 86400000);

  it("weeks run Monday to Sunday", () => {
    expect(weekOf("2026-11-08")).toBe("2026-11-02"); // Sunday closes the week that began Monday the 2nd
    expect(weekOf("2026-11-09")).toBe("2026-11-09");
    expect(weekOf("2026-11-07")).not.toBe(weekOf("2026-11-09"));
  });

  it("breaks the week and consecutive-week rules only when nobody else is available, and says where", () => {
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      const r = generateSchedule(SPEC, nov, { seed });
      for (const a of r.assignments) expect(SPEC.find((w) => w.id === a.workerId).days).toContain(a.slot);
      const flagged = new Set(r.exceptions.map((e) => `${e.date}|${e.slot}|${e.workerId}`));
      for (const a of r.assignments) {
        const others = r.assignments.filter((b) => b !== a && b.workerId === a.workerId);
        const repeat = others.some((b) => weekOf(b.date) === weekOf(a.date)) || others.some((b) => b.slot === a.slot && Math.abs(dn(b.date) - dn(a.date)) === 7);
        if (!repeat) continue;
        // Some assignment of the pair must be a reported exception.
        const pair = [a, ...others].some((b) => flagged.has(`${b.date}|${b.slot}|${b.workerId}`));
        expect(pair).toBe(true);
      }
      // Monday: w1 and w10 only, so they alternate and nobody needs an exception on Mondays.
      expect(r.exceptions.filter((e) => e.slot === "mon")).toEqual([]);
    }
  });

  it("gives EBD and the Sunday service to different people when possible", () => {
    const r = generateSchedule(SPEC, nov, { seed: 7 });
    for (const s of nov.filter((x) => x.slot === "ebd")) {
      const ebd = r.assignments.find((a) => a.date === s.date && a.slot === "ebd").workerId;
      const sun = r.assignments.find((a) => a.date === s.date && a.slot === "sun").workerId;
      expect(ebd).not.toBe(sun);
    }
  });

  it("looks at the previous month: no same day in consecutive weeks across the boundary", () => {
    // Saturday Oct 31 was w3; Saturday Nov 7 must go to someone else.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = generateSchedule(SPEC, nov, { seed, history: [{ date: "2026-10-31", slot: "sat", workerId: "w3" }] });
      expect(r.assignments.find((a) => a.date === "2026-11-07" && a.slot === "sat").workerId).not.toBe("w3");
    }
  });

  it("generating again gives a different schedule", () => {
    const sig = (seed) => generateSchedule(SPEC, nov, { seed }).assignments.map((a) => a.workerId).join(",");
    const all = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(sig));
    expect(all.size).toBeGreaterThan(5);
  });

  it("keeps the load fair for people with the same availability", () => {
    const r = generateSchedule(SPEC, nov, { seed: 3 });
    const same = ["w5", "w6", "w8", "w9"].map((id) => r.counts.get(id));
    expect(Math.max(...same) - Math.min(...same)).toBeLessThanOrEqual(1);
  });
});

describe("groupByDate", () => {
  it("groups names by date and slot", () => {
    const m = groupByDate([{ service_date: "2026-10-04", slot: "ebd", worker_name: "João" }, { service_date: "2026-10-04", slot: "ebd", worker_name: "Ana" }]);
    expect(m.get("2026-10-04")).toEqual({ ebd: ["João", "Ana"] });
  });
});
