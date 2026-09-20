import { describe, it, expect } from "vitest";
import { SLOT_COUNT, slotTime, slotRange, todayLocal, formatDate, formatPeriodRange, formatCircular, parseReasons, pickPeriod, buildShareText, nextPeriodId } from "@/lib/prayerSlots";

describe("prayerSlots", () => {
  it("has 96 fifteen-minute slots", () => {
    expect(SLOT_COUNT).toBe(96);
  });

  it("formats slot start times in 24h", () => {
    expect(slotTime(0)).toBe("00:00");
    expect(slotTime(1)).toBe("00:15");
    expect(slotTime(48)).toBe("12:00");
    expect(slotTime(95)).toBe("23:45");
  });

  it("formats ranges, wrapping the last slot to midnight", () => {
    expect(slotRange(0)).toBe("00:00-00:15");
    expect(slotRange(47)).toBe("11:45-12:00");
    expect(slotRange(94)).toBe("23:30-23:45");
    expect(slotRange(95)).toBe("23:45-00:00");
  });

  it("returns today as YYYY-MM-DD", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats dates per language without timezone shifts", () => {
    expect(formatDate("2025-10-27")).toBe("27/10/2025");
    expect(formatDate("2025-10-27", "en")).toBe("10/27/2025");
    expect(formatDate("")).toBe("");
    expect(formatDate(null)).toBe("");
  });
});

describe("pickPeriod", () => {
  const past = { id: "past", start_date: "2025-10-27", end_date: "2025-11-01" };
  const now = { id: "now", start_date: "2026-09-18", end_date: "2026-09-25" };
  const soon = { id: "soon", start_date: "2026-10-05", end_date: "2026-10-10" };
  const later = { id: "later", start_date: "2026-11-01", end_date: "2026-11-05" };

  it("returns null when there are no periods", () => {
    expect(pickPeriod([], "2026-09-20")).toBeNull();
    expect(pickPeriod(null, "2026-09-20")).toBeNull();
  });

  it("prefers the period running today", () => {
    expect(pickPeriod([past, soon, now], "2026-09-20").id).toBe("now");
    expect(pickPeriod([now], "2026-09-25").id).toBe("now"); // last day counts
  });

  it("falls back to the nearest upcoming one", () => {
    expect(pickPeriod([past, later, soon], "2026-09-30").id).toBe("soon");
  });

  it("falls back to the most recently finished one", () => {
    const older = { id: "older", start_date: "2025-01-01", end_date: "2025-01-05" };
    expect(pickPeriod([older, past], "2026-09-30").id).toBe("past");
  });
});

describe("period formatting", () => {
  const period = { title: "X", start_date: "2026-09-21", end_date: "2026-09-27" };

  it("formats the range as in the circular", () => {
    expect(formatPeriodRange(period)).toBe("De 00:00 de 21/09/2026 até 00:00 de 27/09/2026");
    expect(formatPeriodRange(period, "en")).toBe("From 12 AM on 09/21/2026 until 12 AM on 09/27/2026");
  });

  it("formats the circular number and ignores blanks", () => {
    expect(formatCircular("150/26")).toBe("Circular Nº 150/26");
    expect(formatCircular("  150/26 ", "en")).toBe("Circular No. 150/26");
    expect(formatCircular("")).toBe("");
    expect(formatCircular(null)).toBe("");
  });

  it("parses one intention per line, dropping blanks and bullets", () => {
    expect(parseReasons("Eleições\n\n  - Pátria  \n• Paz")).toEqual(["Eleições", "Pátria", "Paz"]);
    expect(parseReasons("")).toEqual([]);
    expect(parseReasons(null)).toEqual([]);
  });
});

describe("buildShareText", () => {
  const period = {
    title: "ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA",
    circular: "150/26",
    start_date: "2026-09-21",
    end_date: "2026-09-27",
    reasons: ["Pelas eleições", "Pela pátria"],
  };
  const slots = [
    { slot_index: 1, member_name: "Leonard" },
    { slot_index: 2, member_name: "Tatiana" },
  ];

  it("builds the board in the agreed layout", () => {
    const lines = buildShareText(period, slots).split("\n");
    expect(lines.slice(0, 9)).toEqual([
      "ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA",
      "Circular Nº 150/26",
      "De 00:00 de 21/09/2026 até 00:00 de 27/09/2026",
      "",
      "Motivos de Oração:",
      "- Pelas eleições",
      "- Pela pátria",
      "",
      "Períodos",
    ]);
    expect(lines[9]).toBe("00:00-00:15 - LIVRE");
    expect(lines[10]).toBe("00:15-00:30 - LEONARD");
    expect(lines[11]).toBe("00:30-00:45 - TATIANA");
    expect(lines[12]).toBe("00:45-01:00 - LIVRE");
    expect(lines[lines.length - 1]).toBe("23:45-00:00 - LIVRE");
    expect(lines).toHaveLength(9 + SLOT_COUNT);
  });

  it("omits the circular and the intentions when there are none", () => {
    const lines = buildShareText({ ...period, circular: null, reasons: [] }, slots).split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA",
      "De 00:00 de 21/09/2026 até 00:00 de 27/09/2026",
      "",
      "Períodos",
    ]);
    expect(lines).toHaveLength(4 + SLOT_COUNT);
  });

  it("translates the labels for English", () => {
    const lines = buildShareText(period, slots, "en").split("\n");
    expect(lines[1]).toBe("Circular No. 150/26");
    expect(lines[2]).toBe("From 12 AM on 09/21/2026 until 12 AM on 09/27/2026");
    expect(lines[4]).toBe("Prayer intentions:");
    expect(lines).toContain("00:00-00:15 - FREE");
  });
});

describe("nextPeriodId", () => {
  it("starts at 001", () => {
    expect(nextPeriodId([])).toBe("oracao24h-001");
    expect(nextPeriodId(null)).toBe("oracao24h-001");
  });

  it("continues after the highest existing code, ignoring gaps and foreign ids", () => {
    expect(nextPeriodId([{ id: "oracao24h-001" }, { id: "oracao24h-002" }])).toBe("oracao24h-003");
    expect(nextPeriodId([{ id: "oracao24h-002" }, { id: "oracao24h-007" }, { id: "other" }])).toBe("oracao24h-008");
    expect(nextPeriodId([{ id: "oracao24h-099" }])).toBe("oracao24h-100");
  });
});
