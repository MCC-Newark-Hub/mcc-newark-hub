import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const api = vi.hoisted(() => ({ fetchSharedList: vi.fn() }));
vi.mock("@/lib/trumpetsApi", () => api);

import TrumpetsSharedView from "@/views/TrumpetsSharedView";

const LIST = {
  year: 2026, ga: "Newark 1", church: "Newark, NJ",
  guests: [
    { name: "Adimar", invitedBy: "Jadina Xavier", status: "invited" },
    { name: "Amelia", invitedBy: "Tatiana Alves", status: "in_person" },
    { name: "Chaira", invitedBy: "Tatiana Alves", status: "youtube" },
    { name: "Zila", invitedBy: "", status: "confirmed" },
  ],
};
const renderAt = (token = "AbCdEfGhIjKlMnOpQrStUvWx") => render(
  <MemoryRouter initialEntries={[`/trombetas/${token}`]}>
    <Routes><Route path="/trombetas/:token" element={<TrumpetsSharedView lang="pt" setLang={() => {}} />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { vi.clearAllMocks(); try { localStorage.clear(); } catch { /* */ } });

describe("Trombetas shared list page", () => {
  it("opens A–Z with the inviter and a status badge under each name, and the totals by status", async () => {
    api.fetchSharedList.mockResolvedValue(LIST);
    renderAt();
    expect(await screen.findByRole("heading", { name: "Trombetas e Festas 2026" })).toBeTruthy();
    expect(api.fetchSharedList).toHaveBeenCalledWith("AbCdEfGhIjKlMnOpQrStUvWx");
    expect(screen.getByText("Newark 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Por nome (A–Z)" }).getAttribute("aria-pressed")).toBe("true");
    const items = within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Adimarconvidado por Jadina Xavier",
      "Ameliaconvidado por Tatiana AlvesPresencial",
      "Chairaconvidado por Tatiana AlvesYouTube",
      "ZilaSem convidante informadoConfirmado",
    ]);
    expect([...document.querySelectorAll(".tsv-stat")].map((x) => x.textContent)).toEqual(["4convidados", "1confirmados", "1presencial", "1online"]);
  });

  it("groups by who invited and searches by guest or inviter", async () => {
    api.fetchSharedList.mockResolvedValue(LIST);
    renderAt();
    await screen.findByText("Adimar");
    fireEvent.click(screen.getByRole("button", { name: "Por quem convidou" }));
    const groups = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual(["Tatiana Alves2 convidados", "Jadina Xavier1 convidado", "Sem convidante informado1 convidado"]);
    fireEvent.change(screen.getByLabelText("Buscar convidado ou quem convidou…"), { target: { value: "jadina" } });
    expect(screen.getByText("Adimar")).toBeTruthy();
    expect(screen.queryByText("Amelia")).toBeNull();
  });

  it("a link that was turned off says so", async () => {
    api.fetchSharedList.mockRejectedValue(new Error("link_not_found"));
    renderAt();
    expect(await screen.findByText(/Este link não está mais ativo/)).toBeTruthy();
  });
});
