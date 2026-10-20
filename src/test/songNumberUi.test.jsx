import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";

const SONGS = [
  { id: "1", code: "CL-198", title: "ELE É A MINHA ALEGRIA", category: "coletanea", status: "active" },
  { id: "2", code: "CIA-004", title: "CLAMO, Ó SENHOR", category: "cia", status: "active" },
  { id: "3", code: null, title: "A COLHEITA", category: "avulso", status: "active" },
];

const { updateSong } = vi.hoisted(() => ({ updateSong: vi.fn((id, patch) => Promise.resolve({ data: { id, ...patch }, error: null })) }));
vi.mock("@/lib/praiseData", () => ({
  fetchSongs: vi.fn(() => Promise.resolve({ data: SONGS, error: null })),
  fetchRecentLists: vi.fn(() => Promise.resolve({ data: [], error: null })),
  updateSong, deleteSong: vi.fn(), updateList: vi.fn(), deleteList: vi.fn(), createSong: vi.fn(),
}));
vi.mock("@/context/AppDataContext", () => ({ useAppDataContext: () => ({ user: { name: "Admin", sysRoles: ["admin"], teamLeads: [] }, notify: vi.fn() }) }));
vi.mock("@/views/WorshipListPublicView", () => ({ ServiceListForm: () => null }));

import PraiseListsTab from "@/sections/worship/PraiseListsTab";

const tt = STRINGS.pt;

// The pencil button of the catalogue row that shows `text` (rows are sorted by name, so never rely on position).
const editButtonOf = (text) => within(screen.getByText(text).closest(".card")).getByLabelText(tt.praiseEdit);

async function openCatalog() {
  render(<PraiseListsTab lang="pt" />);
  fireEvent.click(await screen.findByRole("button", { name: /cat[aá]logo/i }));
  await screen.findByRole("group", { name: tt.praiseCatalogFilter });
}

describe("Catálogo shows and edits only the number", () => {
  beforeEach(() => updateSong.mockClear());

  it("rows read '198 · TITLE' and never show the CL-/CIA- prefix", async () => {
    await openCatalog();
    expect(screen.getByText("198 · ELE É A MINHA ALEGRIA")).toBeTruthy();
    expect(screen.getByText("4 · CLAMO, Ó SENHOR")).toBeTruthy();
    expect(screen.getByText("A COLHEITA")).toBeTruthy();
    expect(screen.queryByText(/CL-198|CIA-004/)).toBeNull();
  });

  it("the edit form has a Number field (digits only) and saves the internal code from the category", async () => {
    await openCatalog();
    fireEvent.click(editButtonOf("198 · ELE É A MINHA ALEGRIA"));
    const input = screen.getByPlaceholderText(tt.praiseCodeHint);
    expect(input.value).toBe("198");

    fireEvent.change(input, { target: { value: "19a9" } });   // letters are dropped
    expect(input.value).toBe("199");

    fireEvent.click(screen.getByText(tt.praiseSaveChanges));
    await screen.findByText("199 · ELE É A MINHA ALEGRIA");
    expect(updateSong).toHaveBeenLastCalledWith("1", expect.objectContaining({ code: "CL-199", category: "coletanea" }));
  });

  it("the prefix follows the category, and an empty number clears the code", async () => {
    await openCatalog();
    fireEvent.click(editButtonOf("198 · ELE É A MINHA ALEGRIA"));
    fireEvent.change(screen.getByDisplayValue(tt.praiseCatColetanea), { target: { value: "cia" } });
    fireEvent.click(screen.getByText(tt.praiseSaveChanges));
    await screen.findByText(/198 · ELE/);
    expect(updateSong).toHaveBeenLastCalledWith("1", expect.objectContaining({ code: "CIA-198", category: "cia" }));

    fireEvent.click(editButtonOf("A COLHEITA"));
    fireEvent.change(screen.getByPlaceholderText(tt.praiseCodeHint), { target: { value: "" } });
    fireEvent.click(screen.getByText(tt.praiseSaveChanges));
    await screen.findByText("A COLHEITA");
    expect(updateSong).toHaveBeenLastCalledWith("3", expect.objectContaining({ code: "" }));
  });
});
