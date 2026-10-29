import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasNumberPrefix, isValidCode, songErrorText, catalogTotals, filterCatalog, songLabel, songNumber, searchSongs, sortCatalog, formatSongTitle, upperTitle } from "@/lib/praiseLists";
import { STRINGS } from "@/i18n/strings";

const insert = vi.fn();
const update = vi.fn();
vi.mock("@/lib/supabase", () => ({
  sb: { from: () => ({
    insert: (row) => { insert(row); return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: "new" }, error: null }) }) }; },
    update: (row) => { update(row); return { eq: () => ({ select: () => Promise.resolve({ data: [{ id: "s1", ...row }], error: null }) }) }; },
  }) },
}));

import { createSong, updateSong, validateSong } from "@/lib/praiseData";

describe("number in the title", () => {
  it("detects a number prefix, however it is written", () => {
    for (const t of ["04 - Quando te prostrares", "198- Ele é a minha alegria", "7 – Clamor", "12. Hosana", "5) Aleluia", "3: Santo"]) {
      expect(hasNumberPrefix(t)).toBe(true);
    }
  });
  it("lets titles that merely contain digits through", () => {
    for (const t of ["Salmo 86", "Cantares 2", "10.000 razões", "Quinhentos graus", "", null]) {
      expect(hasNumberPrefix(t)).toBe(false);
    }
  });
});

describe("code format", () => {
  it("accepts empty or PREFIX-NNN", () => {
    for (const c of ["", "CL-001", "CIA-012", "ENG-031", "AVL-7"]) expect(isValidCode(c)).toBe(true);
  });
  it("rejects loose codes", () => {
    for (const c of ["034", "ENG", "AVL", "CL001", "CL-", "C-1"]) expect(isValidCode(c)).toBe(false);
  });
});

describe("saving songs", () => {
  beforeEach(() => { insert.mockClear(); update.mockClear(); });

  it("createSong refuses a numbered title without touching the database", async () => {
    const { error } = await createSong({ title: "04 - Quando te prostrares", category: "coletanea" });
    expect(error.code).toBe("number_in_title");
    expect(insert).not.toHaveBeenCalled();
  });

  it("createSong refuses a loose code", async () => {
    const { error } = await createSong({ title: "Teus sonhos", code: "ENG", category: "english" });
    expect(error.code).toBe("invalid_code");
    expect(insert).not.toHaveBeenCalled();
  });

  it("createSong forces English songs to language en and normalizes the code", async () => {
    const { data } = await createSong({ title: "Still", code: "eng 5", category: "english", language: "pt" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ code: "ENG-005", language: "en" }));
    expect(data.language).toBe("en");
  });

  it("updateSong lets a number be added to a song that had none, and removed again", async () => {
    await updateSong("s1", { title: "Teus Sonhos", code: "cl 12" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ code: "CL-012" }));
    await updateSong("s1", { title: "Teus Sonhos", code: "" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ code: null }));
  });

  it("updateSong refuses a numbered title and leaves status-only changes alone", async () => {
    expect((await updateSong("s1", { title: "198 - Ele é" })).error.code).toBe("number_in_title");
    expect((await updateSong("s1", { status: "active" })).error).toBeNull();
  });

  it("updateSong switching to English also sets the language", async () => {
    await updateSong("s1", { title: "Still", category: "english", language: "pt" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ language: "en" }));
  });

  it("validateSong passes a clean song", () => {
    expect(validateSong({ title: "Teus Sonhos", code: "CL-001" })).toBeNull();
  });
});

describe("error messages exist in both languages", () => {
  it.each(["pt", "en"])("%s", (lang) => {
    const tt = STRINGS[lang];
    expect(songErrorText(tt, { code: "number_in_title" })).toBe(tt.praiseTitleNoNumber);
    expect(songErrorText(tt, { code: "invalid_code" })).toBe(tt.praiseCodeInvalid);
    expect(songErrorText(tt, { code: "duplicate_code" }, "CL-001")).toContain("CL-001");
    expect(tt.praiseTitleNoNumber).toBeTruthy();
    expect(tt.praiseCodeInvalid).toBeTruthy();
  });
});

describe("catalogTotals", () => {
  it("counts the whole catalogue and each category, keeping empty ones at 0", () => {
    const songs = [
      { category: "coletanea" }, { category: "coletanea" }, { category: "cia" }, { category: "avulso" }, { category: "avulso" }, { category: "avulso" },
    ];
    expect(catalogTotals(songs)).toEqual({ total: 6, byCategory: { coletanea: 2, cia: 1, avulso: 3, english: 0 } });
  });
  it("handles an empty or missing catalogue", () => {
    expect(catalogTotals([]).total).toBe(0);
    expect(catalogTotals(undefined).byCategory.english).toBe(0);
  });
  it("has a label for the total in both languages", () => {
    expect(STRINGS.pt.praiseCatalogTotal).toBeTruthy();
    expect(STRINGS.en.praiseCatalogTotal).toBeTruthy();
  });
});

describe("filterCatalog", () => {
  const songs = [
    { title: "Clamo a Ti", code: "CL-003", category: "coletanea", theme: "Clamor" },
    { title: "Clamo, Ó Senhor", code: "CIA-004", category: "cia", theme: null },
    { title: "Clamor de Ana", code: null, category: "avulso", theme: null },
    { title: "Shout to the Lord", code: null, category: "english", theme: null },
  ];
  it("returns everything with no filter", () => {
    expect(filterCatalog(songs, "", "all")).toHaveLength(4);
    expect(filterCatalog(songs)).toHaveLength(4);
  });
  it("filters by one category", () => {
    expect(filterCatalog(songs, "", "cia").map((s) => s.code)).toEqual(["CIA-004"]);
    expect(filterCatalog(songs, "", "english")).toHaveLength(1);
    expect(filterCatalog(songs, "", "avulso")).toHaveLength(1);
    expect(filterCatalog(songs, "", "coletanea")).toHaveLength(1);
  });
  it("combines category and search, ignoring accents and case", () => {
    expect(filterCatalog(songs, "clamo", "all")).toHaveLength(3);
    expect(filterCatalog(songs, "CLAMO", "cia")).toHaveLength(1);
    expect(filterCatalog(songs, "o senhor", "coletanea")).toHaveLength(0);
    expect(filterCatalog(songs, "cl-003", "all")).toHaveLength(1);
    expect(filterCatalog(songs, "clamor", "all")).toHaveLength(2); // title "Clamor de Ana" + theme "Clamor"
  });
  it("has the filter label in both languages", () => {
    expect(STRINGS.pt.praiseCatalogFilter).toBeTruthy();
    expect(STRINGS.en.praiseCatalogFilter).toBeTruthy();
  });
});

describe("numbers without the internal prefix", () => {
  it("songNumber strips the prefix and the zero padding", () => {
    expect(songNumber({ code: "CL-198" })).toBe("198");
    expect(songNumber({ code: "CIA-004" })).toBe("4");
    expect(songNumber({ code: "ENG-031" })).toBe("31");
    expect(songNumber({ code: null })).toBe("");
    expect(songNumber(undefined)).toBe("");
  });
  it("songLabel shows only the number and the title, or just the title when there is no number", () => {
    expect(songLabel({ code: "CL-198", title: "ELE É A MINHA ALEGRIA" })).toBe("198 · ELE É A MINHA ALEGRIA");
    expect(songLabel({ code: "CIA-004", title: "CLAMO, Ó SENHOR" })).toBe("4 · CLAMO, Ó SENHOR");
    expect(songLabel({ code: null, title: "EM CAMINHOS DE DOR" })).toBe("EM CAMINHOS DE DOR");
    expect(songLabel(undefined)).toBe("");
  });
  it("a plain number finds that number in every category, exact matches first", () => {
    const songs = [
      { id: "1", code: "CL-004", title: "QUANDO TE PROSTRARES", category: "coletanea" },
      { id: "2", code: "CIA-004", title: "CLAMO, Ó SENHOR", category: "cia" },
      { id: "3", code: "CL-041", title: "OUTRO", category: "coletanea" },
      { id: "4", code: null, title: "SEM NUMERO", category: "avulso" },
    ];
    expect(searchSongs(songs, "4").map((x) => x.id).slice(0, 2).sort()).toEqual(["1", "2"]);
    expect(searchSongs(songs, "004").map((x) => x.id).slice(0, 2).sort()).toEqual(["1", "2"]);
    expect(searchSongs(songs, "41").map((x) => x.id)).toEqual(["3"]);
    expect(searchSongs(songs, "cl 4").map((x) => x.id)[0]).toBe("1");
  });
});

describe("titles are always UPPERCASE", () => {
  it("formatSongTitle uppercases accents, trims and squeezes spaces", () => {
    expect(formatSongTitle("  Quão grande   é o meu Deus ")).toBe("QUÃO GRANDE É O MEU DEUS");
    expect(formatSongTitle("Ó, vem derramar (Salmo 23)")).toBe("Ó, VEM DERRAMAR (SALMO 23)");
    expect(formatSongTitle(null)).toBe("");
  });
  it("upperTitle keeps the user's spaces while typing", () => {
    expect(upperTitle("teus ")).toBe("TEUS ");
  });
  it("createSong saves the title in uppercase whatever was typed", async () => {
    await createSong({ title: "Teus Sonhos", category: "avulso" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ title: "TEUS SONHOS" }));
  });
  it("updateSong saves the title in uppercase too", async () => {
    await updateSong("s1", { title: "supremo Deus (digno de louvor)" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ title: "SUPREMO DEUS (DIGNO DE LOUVOR)" }));
  });
});

describe("sortCatalog", () => {
  const songs = [
    { title: "ÓTIMO", code: "CL-002", category: "coletanea" },
    { title: "BELO", code: "CIA-001", category: "cia" },
    { title: "ÁGUAS", code: null, category: "avulso" },
    { title: "STILL", code: null, category: "english" },
    { title: "CLAMOR", code: "CL-010", category: "coletanea" },
    { title: "AMOR", code: "ENG-003", category: "english" },
  ];
  const titles = (arr) => arr.map((s) => s.title);

  it("by name: A-Z, ignoring accents", () => {
    expect(titles(sortCatalog(songs, "name"))).toEqual(["ÁGUAS", "AMOR", "BELO", "CLAMOR", "ÓTIMO", "STILL"]);
  });
  it("by number: 1, 2, 3, 10 across groups, songs without a number last", () => {
    expect(titles(sortCatalog(songs, "number"))).toEqual(["BELO", "ÓTIMO", "AMOR", "CLAMOR", "ÁGUAS", "STILL"]);
  });
  it("by group: Coletânea, CIA, Avulso, English — then by number and name", () => {
    expect(titles(sortCatalog(songs, "group"))).toEqual(["ÓTIMO", "CLAMOR", "BELO", "ÁGUAS", "AMOR", "STILL"]);
  });
  it("does not change the list it was given, and falls back to name for an unknown key", () => {
    const copy = [...songs];
    sortCatalog(songs, "number");
    expect(songs).toEqual(copy);
    expect(titles(sortCatalog(songs, "nonsense"))[0]).toBe("ÁGUAS");
    expect(sortCatalog(undefined)).toEqual([]);
  });
});
