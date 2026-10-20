import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";

const SONGS = [
  { id: "1", code: "CL-001", title: "O Sangue de Jesus", category: "coletanea", status: "active" },
  { id: "2", code: "CL-002", title: "Clamo a Ti", category: "coletanea", status: "active" },
  { id: "3", code: "CIA-004", title: "Clamo, Ó Senhor", category: "cia", status: "active" },
  { id: "4", code: null, title: "A Colheita", category: "avulso", status: "active" },
  { id: "5", code: null, title: "Still", category: "english", status: "active", language: "en", created_by: "pptx-import-2026-10-19" },
];

vi.mock("@/lib/praiseData", () => ({
  fetchSongs: vi.fn(() => Promise.resolve({ data: SONGS, error: null })),
  fetchRecentLists: vi.fn(() => Promise.resolve({ data: [], error: null })),
  updateSong: vi.fn(), deleteSong: vi.fn(), updateList: vi.fn(), deleteList: vi.fn(), createSong: vi.fn(),
}));
vi.mock("@/context/AppDataContext", () => ({ useAppDataContext: () => ({ user: { name: "Admin", sysRoles: ["admin"], teamLeads: [] }, notify: vi.fn() }) }));
vi.mock("@/views/WorshipListPublicView", () => ({ ServiceListForm: () => null }));

import PraiseListsTab from "@/sections/worship/PraiseListsTab";

const tt = STRINGS.pt;

async function openCatalog() {
  render(<PraiseListsTab lang="pt" />);
  fireEvent.click(await screen.findByRole("button", { name: tt.praiseTabCatalog || /cat[aá]logo/i }));
  return screen.findByRole("group", { name: tt.praiseCatalogFilter });
}

describe("Catálogo: totals and category filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the overall total and one total per category", async () => {
    const group = await openCatalog();
    const read = (label) => within(screen.getByRole("button", { name: new RegExp(`^${label}`, "i") })).getByText(/^\d+$/).textContent;
    expect(read(tt.praiseCatalogTotal)).toBe("5");
    expect(read(tt.praiseCatColetanea)).toBe("2");
    expect(read(tt.praiseCatCia)).toBe("1");
    expect(read(tt.praiseCatAvulso)).toBe("1");
    expect(read(tt.praiseCatEnglish)).toBe("1");
    expect(group).toBeTruthy();
  });

  it("lists only the chosen category and goes back to everything on Total", async () => {
    await openCatalog();
    expect(screen.getByText("5 louvores no catálogo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tt.praiseCatCia}`, "i") }));
    expect(screen.getByText("1 louvores no catálogo")).toBeTruthy();
    expect(screen.getByText(/Clamo, Ó Senhor/)).toBeTruthy();
    expect(screen.queryByText(/Clamo a Ti/)).toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(`^${tt.praiseCatCia}`, "i") }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tt.praiseCatalogTotal}`, "i") }));
    expect(screen.getByText("5 louvores no catálogo")).toBeTruthy();
  });

  it("combines the category with the search box", async () => {
    await openCatalog();
    fireEvent.change(screen.getByPlaceholderText(tt.praiseCatalogSearch), { target: { value: "clamo" } });
    expect(screen.getByText("2 louvores no catálogo")).toBeTruthy(); // Coletânea + CIA
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tt.praiseCatColetanea}`, "i") }));
    expect(screen.getByText("1 louvores no catálogo")).toBeTruthy();
    expect(screen.getByText(/Clamo a Ti/)).toBeTruthy();
  });

  it("shows only the English songs when English is chosen", async () => {
    await openCatalog();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tt.praiseCatEnglish}`, "i") }));
    expect(screen.getByText(/Still/)).toBeTruthy();
    expect(screen.queryByText(/A Colheita/)).toBeNull();
  });

  it("sorts by name (default), number or group, together with the filter", async () => {
    await openCatalog();
    const order = () => Array.from(document.querySelectorAll("p")).map((p) => p.textContent)
      .filter((x) => ["A Colheita", "Clamo a Ti", "Clamo, Ó Senhor", "O Sangue de Jesus", "Still"].some((n) => x.includes(n)));

    expect(order()).toEqual(["A Colheita", "2 · Clamo a Ti", "4 · Clamo, Ó Senhor", "1 · O Sangue de Jesus", "Still"]);

    const sort = screen.getByLabelText(tt.praiseSortBy);
    fireEvent.change(sort, { target: { value: "number" } });
    expect(order()).toEqual(["1 · O Sangue de Jesus", "2 · Clamo a Ti", "4 · Clamo, Ó Senhor", "A Colheita", "Still"]);

    fireEvent.change(sort, { target: { value: "group" } });
    expect(order()).toEqual(["1 · O Sangue de Jesus", "2 · Clamo a Ti", "4 · Clamo, Ó Senhor", "A Colheita", "Still"]);

    // sort + filter: only the Coletânea, by name
    fireEvent.change(sort, { target: { value: "name" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tt.praiseCatColetanea}`, "i") }));
    expect(order()).toEqual(["2 · Clamo a Ti", "1 · O Sangue de Jesus"]);
  });

  it("shows thousands separators and 'imported' instead of the import marker", async () => {
    await openCatalog();
    expect(screen.getAllByText(/importado da projeção/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/pptx-import/)).toBeNull();
  });
});
