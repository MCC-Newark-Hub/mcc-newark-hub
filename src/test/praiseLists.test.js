import { describe, it, expect } from "vitest";
import {
  normalizeCode, formatCode, categoryFromCode, searchSongs, findSimilarSongs,
  isListLocked, daysBetween, recency, moveItem, renumber, songLabel, themeApplies, THEMES, songNumberLabel, listPath, themeSuggestions,
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

  it("is still open just before midnight", () => {
    expect(isListLocked(list, new Date(2026, 8, 20, 23, 59))).toBe(false);
  });

  it("locks at midnight (00:00 of the next day)", () => {
    expect(isListLocked(list, new Date(2026, 8, 21, 0, 0))).toBe(true);
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
  it("shows only the number (no CL-/CIA- prefix) and the title, or just the title for avulsos", () => {
    expect(songLabel(SONGS[0])).toBe("1 · Grandioso És Tu");
    expect(songLabel(SONGS[2])).toBe("12 · Cristo Vem");
    expect(songLabel(SONGS[3])).toBe("31 · Amazing Grace");
    expect(songLabel(SONGS[4])).toBe("Vem Espírito Santo");
    expect(songLabel(undefined)).toBe("");
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

describe("themeSuggestions", () => {
  const today = "2026-11-10";
  const song = (id, code, theme, sung, extra = {}) => ({
    id, code, title: id, category: "coletanea", theme, status: "active",
    sung_by_church: sung ? { "Newark, NJ": sung } : {}, ...extra,
  });
  const picked = song("34", "CL-034", "Clamor", { last_sung_on: "2026-11-05", times_sung: 9 });
  const songs = [
    picked,
    song("3", "CL-003", "Clamor", { last_sung_on: "2026-09-01", times_sung: 2 }),
    song("15", "CL-015", "Clamor", { last_sung_on: "2026-08-01", times_sung: 7 }),
    song("19", "CL-019", "Clamor", null),
    song("21", "CL-021", "Clamor", { last_sung_on: "2026-11-08", times_sung: 4 }), // sung 2 days ago
    song("43", "CL-043", "Clamor", null, { status: "pending" }),
    song("57", "CL-057", "Invocação e Comunhão", null),
  ];
  const opts = { church: "Newark, NJ", today };

  it("offers approved, not-recent songs of the same theme, the known ones first", () => {
    expect(themeSuggestions(songs, picked, opts).map((s) => s.id)).toEqual(["15", "3", "19"]);
  });

  it("leaves out songs already in the list", () => {
    expect(themeSuggestions(songs, picked, { ...opts, excludeIds: ["15"] }).map((s) => s.id)).toEqual(["3", "19"]);
  });

  it("offers nothing when the song was not sung in the last 7 days or has no theme", () => {
    expect(themeSuggestions(songs, picked, { ...opts, today: "2026-11-13" })).toEqual([]);
    expect(themeSuggestions(songs, { ...picked, theme: null }, opts)).toEqual([]);
    expect(themeSuggestions(songs, picked, { ...opts, church: "Philadelphia, PA" })).toEqual([]);
  });

  it("uses the configured window, and 0 turns it off", () => {
    // picked was sung 5 days ago: outside a 3-day window, inside a 14-day one (where CL-021 is recent too)
    expect(themeSuggestions(songs, picked, { ...opts, days: 3 })).toEqual([]);
    expect(themeSuggestions(songs, picked, { ...opts, days: 14 }).map((s) => s.id)).toEqual(["15", "3", "19"]);
    expect(themeSuggestions(songs, picked, { ...opts, days: 0 })).toEqual([]);
  });
});
