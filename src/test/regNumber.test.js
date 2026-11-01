import { describe, it, expect } from "vitest";
import { buildRegNumber, parseRegNumber, regCounters, noteRegNumber, regDateLabel, cleanPrefix } from "../lib/regNumber.js";
import { nextEventId } from "../lib/eventId.js";

describe("buildRegNumber", () => {
  it("is PREFIX-MMDD-NNN-P", () => {
    expect(buildRegNumber("PA202612", "2026-11-01", 1, 1)).toBe("PA202612-1101-001-1");
    expect(buildRegNumber("PA202612", "2026-11-01", 1, 2)).toBe("PA202612-1101-001-2");
    expect(buildRegNumber("PA202612", "2026-12-03", 42, 10)).toBe("PA202612-1203-042-10");
  });
});

describe("parseRegNumber", () => {
  it("reads the current format", () => {
    expect(parseRegNumber("PA202612-1101-001-2")).toEqual({ prefix: "PA202612", submission: 1, person: 2 });
  });

  it("ignores old-format and malformed numbers", () => {
    expect(parseRegNumber("PA001-20260903-0313")).toBeNull();
    expect(parseRegNumber("INVALID")).toBeNull();
    expect(parseRegNumber(null)).toBeNull();
  });
});

describe("regCounters / noteRegNumber", () => {
  const regs = [
    { eventId: "EVT003", regNumber: "PA202612-1101-001-1" },
    { eventId: "EVT003", regNumber: "PA202612-1101-001-2" },
    { eventId: "EVT003", regNumber: "PA202612-1102-002-1" },
    { eventId: "EVT002", regNumber: "PA001-20260903-0313" },
  ];

  it("counts submissions per event and persons per submission", () => {
    const c = regCounters(regs);
    expect(c.submissions).toEqual({ EVT003: 2 });
    expect(c.persons).toEqual({ "EVT003:1": 2, "EVT003:2": 1 });
  });

  it("a new event starts at submission 1 (old-format regs don't count)", () => {
    expect(regCounters(regs).submissions.EVT002).toBeUndefined();
  });

  it("only raises counters", () => {
    const c = regCounters(regs);
    noteRegNumber(c, { eventId: "EVT003", regNumber: "PA202612-1101-001-1" });
    noteRegNumber(c, { eventId: "EVT003", regNumber: "PA202612-1103-005-3" });
    expect(c.submissions.EVT003).toBe(5);
    expect(c.persons["EVT003:1"]).toBe(2);
    expect(c.persons["EVT003:5"]).toBe(3);
  });
});

describe("regDateLabel", () => {
  it("uses registered_at", () => {
    expect(regDateLabel({ registeredAt: "2026-11-01", regNumber: "PA202612-1101-001-1" })).toBe("01/11/2026");
  });

  it("falls back to the date inside an old-format number", () => {
    expect(regDateLabel({ regNumber: "MCC-20260613-0001" })).toBe("13/06/2026");
  });

  it("is empty when there is nothing to read", () => {
    expect(regDateLabel({ regNumber: "INVALID" })).toBe("");
    expect(regDateLabel(null)).toBe("");
  });
});

describe("cleanPrefix", () => {
  it("keeps upper-case letters and digits only (no separator)", () => {
    expect(cleanPrefix("pa-2026 12")).toBe("PA202612");
  });
});

describe("nextEventId", () => {
  it("goes one past the highest id, not the list length", () => {
    expect(nextEventId([{ id: "EVT002" }])).toBe("EVT003");
    expect(nextEventId([])).toBe("EVT001");
  });
});
