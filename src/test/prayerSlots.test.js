import { describe, it, expect } from "vitest";
import { SLOT_COUNT, slotTime, slotRange, todayLocal, formatDate, formatPeriodRange, formatCircular, parseReasons, pickPeriod, buildShareText, nextPeriodId, splitChurches, churchCity, churchBadge, pickActivePeriods, splitName, periodText, parseInlineMarkdown, markdownToWhatsApp, slugify, periodSlug, pickByParam, slotCapacity, groupBySlot, slotStats } from "@/lib/prayerSlots";

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

  it("names the list when the period has one", () => {
    const lines = buildShareText({ ...period, list_name: "Newark" }, slots).split("\n");
    expect(lines.slice(0, 3)).toEqual(["ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA", "Lista: Newark", "Circular Nº 150/26"]);
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

describe("splitChurches", () => {
  const dir = [
    { display: "Philadelphia, PA", is_hub: true },
    { display: "Newark, NJ", is_hub: true },
    { display: "Provo, UT", is_hub: false },
    { display: "Abington, MA", is_hub: false },
    { display: "New York, NY", is_hub: true },
    { display: "Toms River, NJ", is_hub: true },
    { display: "Outra / Não Listada", is_hub: false },
    { display: "Abington, MA", is_hub: false },
  ];

  it("puts the hubs first in the agreed order and the rest (sorted, deduped) under Outra", () => {
    const { hubs, others } = splitChurches(dir);
    expect(hubs).toEqual(["Newark, NJ", "Toms River, NJ", "New York, NY", "Philadelphia, PA"]);
    expect(others).toEqual(["Abington, MA", "Provo, UT"]);
  });

  it("drops the directory's own Outra placeholder", () => {
    expect(splitChurches(dir).others.some((d) => /outra/i.test(d))).toBe(false);
  });

  it("falls back to the four hubs when the directory has no hub flags (not loaded yet)", () => {
    const { hubs, others } = splitChurches([{ display: "Newark, NJ" }, { display: "Framingham, MA" }]);
    expect(hubs).toEqual(["Newark, NJ", "Toms River, NJ", "New York, NY", "Philadelphia, PA"]);
    expect(others).toEqual(["Framingham, MA"]);
    expect(splitChurches(undefined).hubs).toHaveLength(4);
  });
});

describe("churchCity", () => {
  it("keeps only the city", () => {
    expect(churchCity("Toms River, NJ")).toBe("Toms River");
    expect(churchCity("Provo")).toBe("Provo");
    expect(churchCity(null)).toBe("");
  });
});

describe("churchBadge", () => {
  it("shows the city and keeps the full name for the tooltip", () => {
    const b = churchBadge("Toms River, NJ");
    expect(b.label).toBe("Toms River");
    expect(b.full).toBe("Toms River, NJ");
  });

  it("gives the four hub churches distinct fixed colors", () => {
    const colors = ["Newark, NJ", "Toms River, NJ", "New York, NY", "Philadelphia, PA"].map((c) => churchBadge(c).bg);
    expect(new Set(colors).size).toBe(4);
  });

  it("is stable for other churches, including typed ones", () => {
    expect(churchBadge("Provo, UT").bg).toBe(churchBadge("Provo, UT").bg);
    expect(churchBadge("Cidade Inventada, XX").label).toBe("Cidade Inventada");
  });

  it("returns nothing when there is no church", () => {
    expect(churchBadge("")).toBeNull();
    expect(churchBadge(null)).toBeNull();
  });
});

describe("pickActivePeriods", () => {
  const mk = (id, start, end) => ({ id, start_date: start, end_date: end });

  it("shows every active list of the running period, in code order", () => {
    const list = [mk("oracao24h-003", "2026-09-21", "2026-09-27"), mk("oracao24h-001", "2026-09-21", "2026-09-27"), mk("oracao24h-002", "2026-09-21", "2026-09-27")];
    expect(pickActivePeriods(list, "2026-09-22").map((p) => p.id)).toEqual(["oracao24h-001", "oracao24h-002", "oracao24h-003"]);
  });

  it("includes upcoming ones and hides finished ones while something is live", () => {
    const list = [mk("old", "2025-10-27", "2025-11-01"), mk("now", "2026-09-21", "2026-09-27"), mk("next", "2026-11-01", "2026-11-07")];
    expect(pickActivePeriods(list, "2026-09-22").map((p) => p.id)).toEqual(["now", "next"]);
  });

  it("shows each list name once: the one running now, else the next upcoming", () => {
    const list = [
      { id: "oracao24h-001", list_name: "Newark", start_date: "2026-09-21", end_date: "2026-09-27" },
      { id: "oracao24h-002", list_name: "Philadelphia", start_date: "2026-09-21", end_date: "2026-09-27" },
      { id: "oracao24h-010", list_name: "Newark", start_date: "2026-11-01", end_date: "2026-11-07" },
    ];
    expect(pickActivePeriods(list, "2026-09-22").map((p) => p.id)).toEqual(["oracao24h-001", "oracao24h-002"]);
    expect(pickActivePeriods(list, "2026-09-28").map((p) => p.id)).toEqual(["oracao24h-010"]); // 001/002 ended
  });

  it("falls back to the most recently finished lists when nothing is live", () => {
    const list = [mk("a", "2025-01-01", "2025-01-05"), mk("b", "2025-10-27", "2025-11-01"), mk("c", "2025-10-27", "2025-11-01")];
    expect(pickActivePeriods(list, "2026-09-22").map((p) => p.id)).toEqual(["b", "c"]);
    expect(pickActivePeriods([], "2026-09-22")).toEqual([]);
  });
});

describe("splitName", () => {
  it("splits the first name from the rest", () => {
    expect(splitName("Leonard Alves")).toEqual({ first: "Leonard", rest: "Alves" });
    expect(splitName("  Wilian de Oliveira Silvano ")).toEqual({ first: "Wilian", rest: "de Oliveira Silvano" });
    expect(splitName("Pr Nairon")).toEqual({ first: "Pr", rest: "Nairon" });
  });

  it("handles a single name and empty input", () => {
    expect(splitName("Mara")).toEqual({ first: "Mara", rest: "" });
    expect(splitName("")).toEqual({ first: "", rest: "" });
    expect(splitName(null)).toEqual({ first: "", rest: "" });
  });
});

describe("periodText", () => {
  const p = { title: "TÍTULO", title_en: "TITLE", reasons: ["um", "dois"], reasons_en: ["one", "two"] };

  it("returns Portuguese by default", () => {
    expect(periodText(p)).toEqual({ title: "TÍTULO", reasons: ["um", "dois"] });
  });

  it("returns the English version when there is one", () => {
    expect(periodText(p, "en")).toEqual({ title: "TITLE", reasons: ["one", "two"] });
  });

  it("falls back to Portuguese when the English text is missing or blank", () => {
    expect(periodText({ title: "T", reasons: ["a"] }, "en")).toEqual({ title: "T", reasons: ["a"] });
    expect(periodText({ title: "T", title_en: "  ", reasons: ["a"], reasons_en: [""] }, "en")).toEqual({ title: "T", reasons: ["a"] });
  });
});

describe("inline markdown", () => {
  it("parses bold, italic and links, leaving plain text alone", () => {
    expect(parseInlineMarkdown("Pelas **eleições** e a *pátria* [saiba mais](https://icm.org/x)")).toEqual([
      { type: "text", text: "Pelas " },
      { type: "bold", text: "eleições" },
      { type: "text", text: " e a " },
      { type: "italic", text: "pátria" },
      { type: "text", text: " " },
      { type: "link", text: "saiba mais", href: "https://icm.org/x" },
    ]);
    expect(parseInlineMarkdown("_itálico_ simples")[0]).toEqual({ type: "italic", text: "itálico" });
    expect(parseInlineMarkdown("sem formatação")).toEqual([{ type: "text", text: "sem formatação" }]);
  });

  it("never turns unsafe links into links", () => {
    const t = parseInlineMarkdown("[x](javascript:alert(1)) e <b>html</b>");
    expect(t.every((x) => x.type === "text")).toBe(true);
  });

  it("does not treat a lone asterisk or snake_case as formatting", () => {
    expect(parseInlineMarkdown("5 * 3 = 15")).toEqual([{ type: "text", text: "5 * 3 = 15" }]);
    expect(parseInlineMarkdown("um_dois_tres")).toEqual([{ type: "text", text: "um_dois_tres" }]);
  });

  it("converts to WhatsApp syntax for the copied list", () => {
    expect(markdownToWhatsApp("Pelas **eleições** e a *pátria* [site](https://a.b)")).toBe("Pelas *eleições* e a _pátria_ site (https://a.b)");
  });

  it("uses the English text and WhatsApp syntax in the copied board", () => {
    const period = { title: "PT", title_en: "EN TITLE", circular: "1/26", start_date: "2026-09-21", end_date: "2026-09-27", reasons: ["**um**"], reasons_en: ["**one**"] };
    const lines = buildShareText(period, [], "en").split("\n");
    expect(lines[0]).toBe("EN TITLE");
    expect(lines).toContain("- *one*");
    expect(buildShareText(period, [], "pt").split("\n")).toContain("- *um*");
  });
});

describe("friendly links", () => {
  it("slugifies list names", () => {
    expect(slugify("Newark")).toBe("newark");
    expect(slugify("Costa Oeste")).toBe("costa-oeste");
    expect(slugify("  São Paulo / Campinas ")).toBe("sao-paulo-campinas");
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
  });

  it("uses the list name for the link, else the code", () => {
    expect(periodSlug({ id: "oracao24h-001", list_name: "Newark" })).toBe("newark");
    expect(periodSlug({ id: "oracao24h-004", list_name: "" })).toBe("oracao24h-004");
    expect(periodSlug({ id: "oracao24h-005" })).toBe("oracao24h-005");
  });

  const list = [
    { id: "oracao24h-001", list_name: "Newark", start_date: "2026-09-21", end_date: "2026-09-27" },
    { id: "oracao24h-002", list_name: "Philadelphia", start_date: "2026-09-21", end_date: "2026-09-27" },
    { id: "oracao24h-010", list_name: "Newark", start_date: "2026-11-01", end_date: "2026-11-07" },
  ];

  it("finds a list by name (any case) or by code", () => {
    expect(pickByParam(list, "philadelphia").map((x) => x.id)).toEqual(["oracao24h-002"]);
    expect(pickByParam(list, "PHILADELPHIA").map((x) => x.id)).toEqual(["oracao24h-002"]);
    expect(pickByParam(list, "oracao24h-002").map((x) => x.id)).toEqual(["oracao24h-002"]);
  });

  it("prefers the most recent list when two share a name", () => {
    expect(pickByParam(list, "newark").map((x) => x.id)).toEqual(["oracao24h-010"]);
  });

  it("keeps the name link on the list running today and moves on to the next one when it ends", () => {
    expect(pickByParam(list, "newark", "2026-09-22").map((x) => x.id)).toEqual(["oracao24h-001"]); // running now
    expect(pickByParam(list, "newark", "2026-09-27").map((x) => x.id)).toEqual(["oracao24h-001"]); // last day still counts
    expect(pickByParam(list, "newark", "2026-09-28").map((x) => x.id)).toEqual(["oracao24h-010"]); // next circular takes over
    expect(pickByParam(list, "newark", "2026-11-03").map((x) => x.id)).toEqual(["oracao24h-010"]);
  });

  it("falls back to the most recently finished list when nothing is running or upcoming", () => {
    expect(pickByParam(list, "newark", "2027-03-01").map((x) => x.id)).toEqual(["oracao24h-010"]);
    const old = [{ id: "a", list_name: "Newark", start_date: "2026-09-21", end_date: "2026-09-27" }, { id: "b", list_name: "Newark", start_date: "2026-01-05", end_date: "2026-01-10" }];
    expect(pickByParam(old, "newark", "2026-12-01").map((x) => x.id)).toEqual(["a"]);
  });

  it("still finds a list by its code", () => {
    expect(pickByParam(list, "oracao24h-001").map((x) => x.id)).toEqual(["oracao24h-001"]);
  });

  it("returns nothing for an unknown or empty link", () => {
    expect(pickByParam(list, "texas")).toEqual([]);
    expect(pickByParam(list, "")).toEqual([]);
    expect(pickByParam(list, undefined)).toEqual([]);
  });
});

describe("slot capacity", () => {
  it("defaults to 1 and accepts valid integers", () => {
    expect(slotCapacity({})).toBe(1);
    expect(slotCapacity(null)).toBe(1);
    expect(slotCapacity({ slot_capacity: 3 })).toBe(3);
    expect(slotCapacity({ slot_capacity: 0 })).toBe(1);
    expect(slotCapacity({ slot_capacity: "x" })).toBe(1);
  });
  it("groups people by slot and counts covered / full slots", () => {
    const slots = [
      { slot_index: 0, member_name: "Ana" }, { slot_index: 0, member_name: "Bea" },
      { slot_index: 1, member_name: "Cris" },
    ];
    expect([...groupBySlot(slots).keys()]).toEqual([0, 1]);
    expect(slotStats(slots, 2)).toEqual({ covered: 2, people: 3, full: 1 });
    expect(slotStats(slots, 1)).toEqual({ covered: 2, people: 3, full: 2 });
  });
  it("WhatsApp text lists every person of a slot", () => {
    const text = buildShareText({ title: "T", start_date: "2026-09-21", end_date: "2026-09-27", reasons: [] }, [
      { slot_index: 0, member_name: "Ana" }, { slot_index: 0, member_name: "Bea" },
    ]);
    expect(text).toContain("00:00-00:15 - ANA / BEA");
    expect(text).toContain("00:15-00:30 - LIVRE");
  });
});
