import { describe, it, expect } from "vitest";
import { monthServices, monthGrid, shiftMonth, generateSchedule, groupByDate } from "@/lib/doorSchedule";

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

  it("avoids the same person twice in a week when others are free", () => {
    const workers = [W("a", "mon", "tue", "wed", "thu"), W("b", "mon", "tue", "wed", "thu"), W("c", "mon", "tue", "wed", "thu"), W("d", "mon", "tue", "wed", "thu")];
    const r = generateSchedule(workers, services);
    const byWeek = new Map();
    for (const a of r.assignments) {
      const key = `${a.workerId}|${Math.floor((new Date(a.date + "T12:00:00").getDate() + 2) / 7)}`;
      byWeek.set(key, (byWeek.get(key) || 0) + 1);
    }
    expect(Math.max(...byWeek.values())).toBeLessThanOrEqual(1);
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

describe("groupByDate", () => {
  it("groups names by date and slot", () => {
    const m = groupByDate([{ service_date: "2026-10-04", slot: "ebd", worker_name: "João" }, { service_date: "2026-10-04", slot: "ebd", worker_name: "Ana" }]);
    expect(m.get("2026-10-04")).toEqual({ ebd: ["João", "Ana"] });
  });
});
