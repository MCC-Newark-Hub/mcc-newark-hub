import { describe, it, expect } from "vitest";
import { waitlistToPromote, pauseModeOf, PAUSED_WAITLIST_REASON } from "@/lib/pause";

const ev = { id: "E", capacity: 5 };
const reg = (id, regNumber, extra = {}) => ({ id, regNumber, eventId: "E", createdAt: `2026-11-03T0${id.length}:00`, ...extra });

describe("waitlistToPromote", () => {
  it("moves the oldest waitlisted registrations into the free spots", () => {
    const regs = [
      reg("a", "P-001-1"), reg("b", "P-002-1"), reg("c", "P-003-1"),
      { ...reg("w1", "P-004-1", { waitlisted: true, waitlistReason: "Capacidade esgotada" }), createdAt: "2026-11-03T01:00" },
      { ...reg("w2", "P-005-1", { waitlisted: true, waitlistReason: PAUSED_WAITLIST_REASON }), createdAt: "2026-11-03T02:00" },
      { ...reg("w3", "P-006-1", { waitlisted: true, waitlistReason: PAUSED_WAITLIST_REASON }), createdAt: "2026-11-03T03:00" },
    ];
    expect(waitlistToPromote(regs, ev)).toEqual(["w1", "w2"]);
  });

  it("keeps a family together and leaves staff decisions alone", () => {
    const regs = [
      reg("a", "P-001-1"), reg("b", "P-002-1"), reg("c", "P-003-1"),
      { ...reg("f1", "P-004-1", { waitlisted: true }), createdAt: "2026-11-03T01:00" },
      { ...reg("f2", "P-004-2", { waitlisted: true }), createdAt: "2026-11-03T01:00" },
      { ...reg("f3", "P-004-3", { waitlisted: true }), createdAt: "2026-11-03T01:00" },
      { ...reg("m", "P-005-1", { waitlisted: true, waitlistReason: "manual" }), createdAt: "2026-11-03T00:00" },
      { ...reg("s", "P-006-1", { waitlisted: true, waitlistReason: "Capacidade esgotada" }), createdAt: "2026-11-03T02:00" },
    ];
    // 2 free spots: the family of 3 doesn't fit and waits; the next one fits.
    expect(waitlistToPromote(regs, ev)).toEqual(["s"]);
  });

  it("ignores cancelled registrations and other events", () => {
    const regs = [
      reg("x", "P-001-1", { cancelled: true }),
      reg("y", "P-002-1", { eventId: "OTHER" }),
      reg("w", "P-003-1", { waitlisted: true }),
    ];
    expect(waitlistToPromote(regs, ev)).toEqual(["w"]);
    expect(waitlistToPromote(regs, { id: "E", capacity: 0 })).toEqual(["w"]); // no capacity set: no limit
  });
});

describe("pauseModeOf", () => {
  it("defaults to a full pause", () => {
    expect(pauseModeOf({})).toBe("full");
    expect(pauseModeOf({ registration_pause_mode: "waitlist" })).toBe("waitlist");
  });
});
