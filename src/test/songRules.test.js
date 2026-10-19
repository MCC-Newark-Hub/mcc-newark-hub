import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasNumberPrefix, isValidCode, songErrorText, catalogTotals, filterCatalog, songListLabel } from "@/lib/praiseLists";
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

describe("songListLabel", () => {
  it("shows only the number, without the prefix", () => {
    expect(songListLabel({ code: "CL-198", title: "Ele É a Minha Alegria" })).toBe("198 · Ele É a Minha Alegria");
    expect(songListLabel({ code: "CIA-004", title: "Clamo, Ó Senhor" })).toBe("4 · Clamo, Ó Senhor");
    expect(songListLabel({ code: "ENG-031", title: "Still" })).toBe("31 · Still");
  });
  it("shows just the title when the song has no number", () => {
    expect(songListLabel({ code: null, title: "Em Caminhos de Dor" })).toBe("Em Caminhos de Dor");
  });
  it("is empty for a song that is not loaded, so callers can show a placeholder", () => {
    expect(songListLabel(undefined)).toBe("");
  });
});
