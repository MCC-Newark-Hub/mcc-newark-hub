import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppDataContext } from "@/context/AppDataContext";

const search = vi.fn(), fetchOne = vi.fn(), save = vi.fn();
vi.mock("@/lib/censusData", () => ({
  searchCensusMembers: (...a) => search(...a), fetchCensus: (...a) => fetchOne(...a), saveCensusPublic: (...a) => save(...a),
}));
vi.mock("@/lib/auditEvent", () => ({ logAuditEvent: vi.fn(), publicActor: (n) => ({ name: n }), deviceInfo: () => "test" }));
vi.mock("@/lib/prayerSlots", async (orig) => ({ ...(await orig()), todayLocal: () => "2026-11-04" }));

import CensusPublicView from "@/views/CensusPublicView";

const churches = [{ display: "Newark, NJ", is_hub: true }, { display: "New York, NY", is_hub: true }];
const renderPage = (lang = "pt") => render(
  <AppDataContext.Provider value={{ churches }}>
    <MemoryRouter><CensusPublicView lang={lang} setLang={() => {}} /></MemoryRouter>
  </AppDataContext.Provider>
);

// This Node + jsdom setup has no usable localStorage: a small in-memory one stands in.
const store = new Map();
vi.stubGlobal("localStorage", {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
});

beforeEach(() => {
  localStorage.clear();
  search.mockReset(); fetchOne.mockReset(); save.mockReset();
  fetchOne.mockResolvedValue({ data: null, error: null });
});

describe("Census public page", () => {
  it("asks for church and name before the counts", () => {
    renderPage();
    expect(screen.getByText("Frequência de Culto")).toBeTruthy();
    expect(screen.getByText("Escolha a igreja e o seu nome para continuar.")).toBeTruthy();
    expect(screen.queryByText("Total geral")).toBeNull();
  });

  it("searches names only from 3 letters, then saves clean counts with live totals", async () => {
    search.mockResolvedValue({ data: [{ id: "M1", name: "João Silva" }], error: null });
    save.mockResolvedValue({ data: { id: "r1" }, error: null });
    renderPage();
    fireEvent.change(screen.getByLabelText("Igreja"), { target: { value: "Newark, NJ" } });
    const name = screen.getByLabelText("Seu nome");
    fireEvent.change(name, { target: { value: "jo" } });
    fireEvent.change(name, { target: { value: "joa" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("Newark, NJ", "joa"));
    fireEvent.click(await screen.findByText("João Silva"));

    fireEvent.change(screen.getByLabelText("Membros · Jovens e Adultos"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Visitantes · CIAs"), { target: { value: "3" } }); // a number field never holds "3x"; garbage is covered by cleanCount's tests
    expect(screen.getByTestId("census-overall").textContent).toBe("43");

    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(save).toHaveBeenCalledWith({
      church: "Newark, NJ", date: "2026-11-04", type: "noite", memberId: "M1",
      counts: { members_cia: 0, members_adult: 40, visitors_cia: 3, visitors_adult: 0 }, notes: "",
    }));
    expect(await screen.findByText("Frequência salva. Obrigado!")).toBeTruthy();
  });

  it("loads the service another person already recorded", async () => {
    localStorage.setItem("mcc_census_church", "Newark, NJ");
    localStorage.setItem("mcc_census_member", JSON.stringify({ id: "M1", name: "João Silva", church: "Newark, NJ" }));
    fetchOne.mockResolvedValue({ data: { id: "r1", members_adult: 55, members_cia: 0, visitors_cia: 0, visitors_adult: 0, notes: "", entered_by_name: "Ana" }, error: null });
    renderPage();
    expect(await screen.findByText("Já registrado por Ana — você está atualizando.")).toBeTruthy();
    expect(screen.getByLabelText("Membros · Jovens e Adultos").value).toBe("55");
  });

  it("explains a refused date", async () => {
    localStorage.setItem("mcc_census_church", "Newark, NJ");
    localStorage.setItem("mcc_census_member", JSON.stringify({ id: "M1", name: "João Silva", church: "Newark, NJ" }));
    save.mockResolvedValue({ data: null, error: "date" });
    renderPage();
    fireEvent.click(await screen.findByText("Salvar"));
    expect(await screen.findByText(/só é possível registrar o culto de hoje/)).toBeTruthy();
  });

  it("is in English too", () => {
    renderPage("en");
    expect(screen.getByText("Service Attendance")).toBeTruthy();
  });
});
