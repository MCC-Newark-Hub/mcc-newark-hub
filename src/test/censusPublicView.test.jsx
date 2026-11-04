import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const signedIn = () => {
  localStorage.setItem("mcc_census_church", "Newark, NJ");
  localStorage.setItem("mcc_census_member", JSON.stringify({ id: "M1", name: "João Silva", church: "Newark, NJ" }));
};

beforeEach(() => {
  localStorage.clear();
  search.mockReset(); fetchOne.mockReset(); save.mockReset();
  fetchOne.mockResolvedValue({ data: null, error: null });
  // Wednesday 2026-11-04, 19:00 on the device; only Date is faked so promises and waitFor keep working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 4, 19, 0));
});
afterEach(() => vi.useRealTimers());

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

  it("has a PT/EN switch like the other public pages", () => {
    const setLang = vi.fn();
    render(
      <AppDataContext.Provider value={{ churches }}>
        <MemoryRouter><CensusPublicView lang="pt" setLang={setLang} /></MemoryRouter>
      </AppDataContext.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(setLang).toHaveBeenCalledWith("en");
  });

  it("just after midnight records last night's service by default (Sunday Noite saved at 00:15 Monday)", async () => {
    vi.setSystemTime(new Date(2026, 10, 9, 0, 15)); // Monday 00:15
    signedIn();
    save.mockResolvedValue({ data: { id: "r1" }, error: null });
    renderPage();
    const date = await screen.findByLabelText("Data");
    expect(date.value).toBe("2026-11-08");
    expect([...screen.getByLabelText("Culto").options].map((o) => o.value)).toEqual(["ebd", "noite"]); // Sunday's services
    fireEvent.change(screen.getByLabelText("Membros · Jovens e Adultos"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-11-08", type: "noite" })));
  });

  it("keeps the typed numbers when the clock passes midnight while typing", async () => {
    vi.setSystemTime(new Date(2026, 10, 8, 23, 59));
    signedIn();
    save.mockResolvedValue({ data: { id: "r1" }, error: null });
    renderPage();
    fireEvent.change(await screen.findByLabelText("Membros · Jovens e Adultos"), { target: { value: "30" } });
    vi.setSystemTime(new Date(2026, 10, 9, 0, 1));
    fireEvent.change(screen.getByLabelText("Visitantes · CIAs"), { target: { value: "2" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText("Membros · Jovens e Adultos").value).toBe("30");
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-11-08" })));
  });

  it("warns instead of overwriting when someone else saved the same service meanwhile", async () => {
    signedIn();
    fetchOne.mockResolvedValueOnce({ data: null, error: null }); // what the page opened with
    fetchOne.mockResolvedValue({ data: { id: "r1", members_adult: 50, members_cia: 0, visitors_cia: 0, visitors_adult: 0, notes: "", entered_by_name: "Ana", updated_at: "t2" }, error: null });
    save.mockResolvedValue({ data: { id: "r1" }, error: null });
    renderPage();
    fireEvent.change(await screen.findByLabelText("Membros · Jovens e Adultos"), { target: { value: "45" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText(/Ana acabou de registrar este culto \(total 50\)/)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Membros · Jovens e Adultos").value).toBe("45"); // what I typed stays
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ counts: expect.objectContaining({ members_adult: 45 }) })));
  });
});
