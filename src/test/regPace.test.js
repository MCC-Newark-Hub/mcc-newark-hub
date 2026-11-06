import { describe, it, expect } from "vitest";
import { paceTimeline, paceMarks, pauseSpans, phaseStats, hourlyBuckets, peakHours } from "@/lib/regPace";

const at = (s) => Date.parse(s);
const reg = (ts, by = "Sistema", extra = {}) => ({ eventId: "E1", registeredAtTs: ts, registeredBy: by, cancelled: false, ...extra });

const regs = [
  reg("2026-11-03T01:21:00Z"),
  reg("2026-11-03T01:25:00Z"),
  reg("2026-11-03T01:40:00Z", "Ana"),
  reg("2026-11-04T19:05:00Z", "Reinaldo"),
  reg("2026-11-06T17:50:00Z"),
  reg("2026-11-03T01:30:00Z", "Sistema", { cancelled: true }),
  reg("2026-11-03T01:30:00Z", "Sistema", { eventId: "E2" }),
];
const log = [
  { action: "registrations_paused", created_at: "2026-11-03T02:06:00Z" },
  { action: "registrations_resumed", created_at: "2026-11-06T17:41:00Z" },
];
const now = at("2026-11-06T18:20:00Z");

describe("paceTimeline", () => {
  it("keeps this event's active registrations in order with a running total", () => {
    const tl = paceTimeline(regs, "E1");
    expect(tl.map((p) => p.total)).toEqual([1, 2, 3, 4, 5]);
    expect(tl.filter((p) => p.viaPublic)).toHaveLength(3);
  });
});

describe("phases", () => {
  const tl = paceTimeline(regs, "E1");
  const marks = paceMarks(tl, log);

  it("opens at the first registration, then pause and reopen", () => {
    expect(marks.map((m) => m.kind)).toEqual(["opened", "paused", "reopened"]);
  });

  it("counts each phase and its rate", () => {
    const s = phaseStats(tl, marks, now);
    expect(s.map((p) => p.count)).toEqual([3, 1, 1]);
    expect(s[0].perHour).toBeCloseTo(3 / 0.75);
    expect(s[2].ongoing).toBe(true);
  });

  it("shades the pause up to the reopening, or to now while paused", () => {
    expect(pauseSpans(marks, now)).toEqual([[at("2026-11-03T02:06:00Z"), at("2026-11-06T17:41:00Z")]]);
    expect(pauseSpans(marks.slice(0, 2), now)).toEqual([[at("2026-11-03T02:06:00Z"), now]]);
  });
});

describe("hourly", () => {
  const tl = paceTimeline(regs, "E1");
  const b = hourlyBuckets(tl, now);

  it("has one bucket per hour from the first registration to now, empty hours included", () => {
    expect(b[0].t).toBe(at("2026-11-03T01:00:00Z"));
    expect(b[b.length - 1].t).toBe(at("2026-11-06T18:00:00Z"));
    expect(b.length).toBe(90);
    expect(b[0]).toMatchObject({ viaPublic: 2, viaStaff: 1, total: 3 });
  });

  it("picks the busiest hours", () => {
    expect(peakHours(b, 2).map((p) => p.total)).toEqual([3, 1]);
    expect(peakHours([], 3)).toEqual([]);
  });
});
