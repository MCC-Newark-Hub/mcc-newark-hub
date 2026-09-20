import { describe, it, expect } from "vitest";
import {
  normalizeCode, formatCode, categoryFromCode, searchSongs, findSimilarSongs,
  isListLocked, daysBetween, recency, moveItem, renumber, songLabel, themeApplies, THEMES, songNumberLabel, listPath,
} from "@/lib/praiseLists";

const SONGS = [
  { id: "1", code: "CL-001", title: "Grandioso És Tu", category: "coletanea" },
  { id: "2", code: "CL-012", title: "Clamor ao Senhor", category: "coletanea" },
  { id: "3", code: "CIA-012", title: "Cristo Vem", category: "cia" },
  { id: "4", code: "ENG-031", title: "Amazing Grace", category: "english" },
  { id: "5", code: null, title: "Vem Espírito Santo", category: "avulso" },
];

describe("praiseLists codes", () => {
  it("normalizes codes typed loosely", () => {
    expect(normalizeCode("cl 1")).toBe("CL-001");
    expect(normalizeCode("CL-1")).toBe("CL-001");
    expect(normalizeCode("cia012")).toBe("CIA-012");
    expect(normalizeCode("eng-31")).toBe("ENG-031");
  });

  it("leaves non-code text alone (uppercased)", () => {
    expect(normalizeCode("  grandioso ")).toBe("GRANDIOSO");
  });

  it("formats codes from category + number", () => {
    expect(formatCode("coletanea", 1)).toBe("CL-001");
    expect(formatCode("english", 31)).toBe("ENG-031");
    expect(formatCode("avulso", "")).toBe("");
  });

  it("finds the category from a code prefix", () => {
    expect(categoryFromCode("cia-012")).toBe("cia");
    expect(categoryFromCode("ENG-031")).toBe("english");
    expect(categoryFromCode("XX-001")).toBeNull();
  });

  it("themes only apply to coletânea and CIA", () => {
    expect(themeApplies("coletanea")).toBe(true);
    expect(themeApplies("cia")).toBe(true);
    expect(themeApplies("avulso")).toBe(false);
    expect(THEMES).toHaveLength(12);
  });
});

describe("searchSongs", () => {
  it("ranks an exact code first, whatever the formatting", () => {
    expect(searchSongs(SONGS, "cl 12")[0].id).toBe("2");
    expect(searchSongs(SONGS, "cia-012")[0].id).toBe("3");
  });

  it("matches titles ignoring accents and case", () => {
    expect(searchSongs(SONGS, "espirito")[0].id).toBe("5");
    expect(searchSongs(SONGS, "GRANDIOSO")[0].id).toBe("1");
  });

  it("returns nothing for an empty query", () => {
    expect(searchSongs(SONGS, "  ")).toEqual([]);
  });

  it("keeps CL-012 and CIA-012 apart", () => {
    const ids = searchSongs(SONGS, "012").map((s) => s.id);
    expect(ids).not.toContain("1");
  });
});

describe("findSimilarSongs", () => {
  it("flags an existing title typed again", () => {
    expect(findSimilarSongs("grandioso es tu", SONGS).map((s) => s.id)).toContain("1");
  });

  it("does not flag unrelated titles", () => {
    expect(findSimilarSongs("Aleluia Glorioso", SONGS)).toEqual([]);
  });
});

describe("isListLocked", () => {
  const list = { service_date: "2026-09-20", locked: false };

  it("is open during the service day", () => {
    expect(isListLocked(list, new Date(2026, 8, 20, 22, 0))).toBe(false);
  });

  it("is still open before 06:00 the next morning", () => {
    expect(isListLocked(list, new Date(2026, 8, 21, 5, 59))).toBe(false);
  });

  it("locks at 06:00 the next day", () => {
    expect(isListLocked(list, new Date(2026, 8, 21, 6, 0))).toBe(true);
  });

  it("a manual lock wins", () => {
    expect(isListLocked({ ...list, locked: true }, new Date(2026, 8, 20, 10, 0))).toBe(true);
  });
});

describe("recency", () => {
  it("counts days between dates", () => {
    expect(daysBetween("2026-09-10", "2026-09-20")).toBe(10);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("returns days for songs sung within the window", () => {
    expect(recency("2026-09-10", "2026-09-20")).toEqual({ days: 10, date: "2026-09-10" });
  });

  it("returns null when never sung or too old", () => {
    expect(recency(null, "2026-09-20")).toBeNull();
    expect(recency("2026-01-10", "2026-09-20")).toBeNull();
  });
});

describe("list ordering", () => {
  const items = [{ id: "a", position: 0 }, { id: "b", position: 1 }, { id: "c", position: 2 }];

  it("moves and renumbers", () => {
    const out = moveItem(items, 0, 2);
    expect(out.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(out.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("ignores out-of-range moves", () => {
    expect(moveItem(items, 0, 5).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("renumbers after a removal", () => {
    expect(renumber([items[0], items[2]]).map((i) => i.position)).toEqual([0, 1]);
  });
});

describe("songLabel", () => {
  it("shows code and title, or only the title for avulsos", () => {
    expect(songLabel(SONGS[0])).toBe("CL-001 · Grandioso És Tu");
    expect(songLabel(SONGS[4])).toBe("Vem Espírito Santo");
  });
});

describe("songNumberLabel / listPath", () => {
  it("shows only the number, or the category tag when the song has none", () => {
    expect(songNumberLabel({ code: "CL-004", category: "coletanea" })).toBe("4");
    expect(songNumberLabel({ code: "CIA-012", category: "cia" })).toBe("12");
    expect(songNumberLabel({ code: "ENG-031", category: "english" })).toBe("31");
    expect(songNumberLabel({ code: "CL-709", category: "coletanea" })).toBe("709");
    expect(songNumberLabel({ code: null, category: "avulso" })).toBe("AVL");
    expect(songNumberLabel({ code: null, category: "english" })).toBe("ENG");
    expect(songNumberLabel(null)).toBe("");
  });

  it("builds the public path of a list", () => {
    expect(listPath("abc")).toBe("/culto-profetico/abc");
  });
});
