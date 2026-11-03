import { describe, it, expect } from "vitest";
import { summarizeStats, daysUntil, shortChurch, TOP_CHURCHES } from "@/lib/publicStats";

const base = { event_id: "EVT003", name: "Seminário", capacity: 150, active: 0, waitlist: 0, by_category: {}, by_church: {} };
const s = (over, today = "2026-11-02") => summarizeStats({ ...base, ...over }, today);

describe("summarizeStats", () => {
  it("fills the bar and counts the spots left before the waitlist", () => {
    expect(s({ active: 87 })).toMatchObject({ pct: 58, left: 63, stage: "open", full: false });
    expect(s({ active: 105 }).stage).toBe("filling");
    expect(s({ active: 140 })).toMatchObject({ stage: "almost", left: 10 });
  });

  it("is full at capacity and never shows negative spots", () => {
    expect(s({ active: 150, waitlist: 4 })).toMatchObject({ stage: "full", full: true, left: 0, pct: 100, waitlist: 4 });
    expect(s({ active: 160 })).toMatchObject({ left: 0, pct: 100 });
  });

  it("counts the days to the registration deadline and closes after it", () => {
    expect(s({ registration_deadline: "2026-11-14" })).toMatchObject({ daysToDeadline: 12, closed: false });
    expect(s({ registration_deadline: "2026-11-02" })).toMatchObject({ daysToDeadline: 0, closed: false });
    expect(s({ registration_deadline: "2026-11-01" }).closed).toBe(true);
    expect(s({ paused: true }).closed).toBe(true);
    expect(s({ locked: true }).closed).toBe(true);
    expect(s({}).daysToDeadline).toBeNull();
  });

  it("lists categories in the app's order with their waitlist", () => {
    const r = s({ by_category: { Adulto: 70, "0-3": 5, Jovem: 12 }, waitlist_by_category: { Adulto: 3 } });
    expect(r.categories.map((c) => c.key)).toEqual(["0-3", "Criança", "Intermediário", "Adolescente", "Jovem", "Adulto"]);
    expect(r.categories.at(-1)).toEqual({ key: "Adulto", count: 70, waitlist: 3 });
  });

  it("shows the biggest churches and sums the rest as others", () => {
    const by_church = Object.fromEntries(Array.from({ length: TOP_CHURCHES + 2 }, (_, i) => [`Church ${i}, NJ`, 20 - i]));
    by_church[""] = 1;
    const r = s({ by_church });
    expect(r.churches).toHaveLength(TOP_CHURCHES + 1);
    expect(r.churches[0]).toEqual({ name: "Church 0, NJ", count: 20 });
    expect(r.churches.at(-1)).toEqual({ name: "", count: 12 + 11 + 1, other: true });
  });

  it("carries no names or money", () => {
    const r = s({ active: 10, fee: 25, paid: 3 });
    expect(Object.keys(r)).not.toContain("fee");
    expect(Object.keys(r)).not.toContain("paid");
  });
});

describe("helpers", () => {
  it("daysUntil and shortChurch", () => {
    expect(daysUntil("2026-12-05", "2026-11-02")).toBe(33);
    expect(shortChurch("Newark, NJ")).toBe("Newark");
  });
});
