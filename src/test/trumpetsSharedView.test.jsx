import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const api = vi.hoisted(() => ({ fetchSharedList: vi.fn() }));
vi.mock("@/lib/trumpetsApi", () => api);

import TrumpetsSharedView from "@/views/TrumpetsSharedView";

const LIST = {
  year: 2026, ga: "Newark 1", church: "Newark, NJ",
  guests: [
    { name: "Adimar", invitedBy: "Jadina Xavier", attended: false },
    { name: "Amelia", invitedBy: "Tatiana Alves", attended: true },
    { name: "Chaira", invitedBy: "Tatiana Alves", attended: false },
    { name: "Zila", invitedBy: "", attended: false },
  ],
};
const renderAt = (token = "AbCdEfGhIjKlMnOpQrStUvWx") => render(
  <MemoryRouter initialEntries={[`/trombetas/${token}`]}>
    <Routes><Route path="/trombetas/:token" element={<TrumpetsSharedView lang="pt" setLang={() => {}} />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { vi.clearAllMocks(); try { localStorage.clear(); } catch { /* */ } });

describe("Trombetas shared list page", () => {
  it("shows the GA's guests grouped by who invited, with the totals", async () => {
    api.fetchSharedList.mockResolvedValue(LIST);
    renderAt();
    expect(await screen.findByRole("heading", { name: "Trombetas e Festas 2026" })).toBeTruthy();
    expect(api.fetchSharedList).toHaveBeenCalledWith("AbCdEfGhIjKlMnOpQrStUvWx");
    expect(screen.getByText("Newark 1")).toBeTruthy();
    const groups = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual(["Tatiana Alves2 convidados", "Jadina Xavier1 convidado", "Sem convidante informado1 convidado"]);
    expect(screen.getAllByText("Veio")).toHaveLength(1);
  });

  it("searches by guest or inviter and switches to A–Z with the inviter under each name", async () => {
    api.fetchSharedList.mockResolvedValue(LIST);
    renderAt();
    await screen.findByText("Adimar");
    fireEvent.change(screen.getByLabelText("Buscar convidado ou quem convidou…"), { target: { value: "jadina" } });
    expect(screen.getByText("Adimar")).toBeTruthy();
    expect(screen.queryByText("Amelia")).toBeNull();
    fireEvent.change(screen.getByLabelText("Buscar convidado ou quem convidou…"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Por nome (A–Z)" }));
    const items = within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toBe("Adimarconvidado por Jadina Xavier");
    expect(items[3]).toBe("ZilaSem convidante informado");
  });

  it("a link that was turned off says so", async () => {
    api.fetchSharedList.mockRejectedValue(new Error("link_not_found"));
    renderAt();
    expect(await screen.findByText(/Este link não está mais ativo/)).toBeTruthy();
  });
});
