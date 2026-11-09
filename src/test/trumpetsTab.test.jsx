import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppDataContext } from "@/context/AppDataContext";

const api = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
  getEdition: vi.fn(),
  saveEdition: vi.fn(async () => {}),
  listGuests: vi.fn(),
  createGuest: vi.fn(),
  updateGuest: vi.fn(),
  setAttended: vi.fn(),
  deleteGuest: vi.fn(),
  listGoals: vi.fn(async () => []),
  saveGoal: vi.fn(async () => {}),
}));
vi.mock("@/lib/trumpetsApi", () => api);
vi.mock("@/lib/exportElement", () => ({ exportImage: vi.fn(async () => {}) }));

import TrumpetsTab from "@/sections/assistance/TrumpetsTab";

const gas = [
  { id: "GA1", name: "GA Central", church: "Newark, NJ - EUA" },
  { id: "GA2", name: "GA Norte", church: "Newark, NJ - EUA" },
];
const members = [{ id: "M1", name: "Ana", church: "Newark, NJ - EUA" }];
const SUMMARY = {
  invited: 3, attended: 1, pct: 33, goal: 10,
  churches: [{
    church: "Newark, NJ - EUA", invited: 3, attended: 1, pct: 33, goal: null,
    gas: [
      { gaId: "GA1", name: "GA Central", invited: 2, attended: 1, pct: 50, members: [{ memberId: "M1", name: "Ana", invited: 2, attended: 1, pct: 50 }] },
      { gaId: "GA2", name: "GA Norte", invited: 1, attended: 0, pct: 0, members: [] },
    ],
  }],
};
const rita = { id: "g1", year: 2026, church: "Newark, NJ - EUA", gaId: "GA1", name: "Rita", phone: "9735550101", email: "", invitedByMemberId: "M1", attendedAt: null, notes: "" };

const renderAs = (user) => render(
  <MemoryRouter>
    <AppDataContext.Provider value={{ user, gas, members, notify: vi.fn() }}><TrumpetsTab lang="pt" /></AppDataContext.Provider>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSummary.mockResolvedValue(SUMMARY);
  api.getEdition.mockResolvedValue({ reasons: "# Pela salvação\nFamílias", reasonsEn: "" });
  api.listGuests.mockResolvedValue([rita]);
  api.listGoals.mockResolvedValue([]);
});

describe("Trombetas e Festas tab", () => {
  it("shows the motivos to everyone", async () => {
    renderAs({ name: "Sec", sysRoles: ["clerk"], church: "Newark" });
    expect(await screen.findByText("Pela salvação")).toBeTruthy();
    expect(screen.getByText("Famílias")).toBeTruthy();
  });

  it("clerk drills church → GA → member with numbers only, never the list", async () => {
    renderAs({ name: "Sec", sysRoles: ["clerk"], church: "Newark" });
    const children = await screen.findByTestId("tf-children");
    expect(screen.getByTestId("tf-level").textContent).toMatch(/Newark/);
    fireEvent.click(within(children).getByRole("button", { name: /GA Central/ }));
    expect(screen.getByTestId("tf-level").textContent).toMatch(/GA Central/);
    fireEvent.click(within(screen.getByTestId("tf-children")).getByRole("button", { name: /Ana/ }));
    expect(screen.getByTestId("tf-level").textContent).toMatch(/Ana/);
    expect(screen.getByTestId("tf-level-numbers").textContent).toMatch(/2/);
    fireEvent.click(screen.getByRole("button", { name: "Newark" }));
    expect(within(screen.getByTestId("tf-children")).getByRole("button", { name: /GA Norte/ })).toBeTruthy();
    expect(api.listGuests).not.toHaveBeenCalled();
    expect(screen.queryByText("Rita")).toBeNull();
  });

  it("pastor starts at all churches, edits the motivos and the goal, opens the panel, and never sees the list", async () => {
    renderAs({ name: "Pr", sysRoles: ["pastor"] });
    const children = await screen.findByTestId("tf-children");
    expect(within(children).getByRole("button", { name: /Newark/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir painel/ }).getAttribute("href")).toMatch(/^\/assistance\/trombetas\/painel\/\d{4}$/);
    fireEvent.click(screen.getByRole("button", { name: /Editar motivos/ }));
    fireEvent.change(screen.getByLabelText("Motivos (PT)"), { target: { value: "Orar" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar motivos" }));
    await waitFor(() => expect(api.saveEdition).toHaveBeenCalledWith(expect.any(Number), { reasons: "Orar", reasonsEn: "" }));
    fireEvent.change(screen.getByLabelText("Meta geral"), { target: { value: "80" } });
    fireEvent.blur(screen.getByLabelText("Meta geral"));
    await waitFor(() => expect(api.saveGoal).toHaveBeenCalledWith(expect.any(Number), "", 80));
    expect(api.listGuests).not.toHaveBeenCalled();
  });

  it("GA leader lands on their GA, sees the list and can export the image for the group", async () => {
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    expect(await screen.findByText("Rita")).toBeTruthy();
    expect(screen.getByTestId("tf-level").textContent).toMatch(/GA Central/);
    expect(screen.getByRole("button", { name: /Imagem para o grupo/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Abrir painel/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar motivos/ })).toBeNull();
  });

  it("a GA leader with no GA gets the empty state and no API calls for lists", async () => {
    api.fetchSummary.mockResolvedValue({ invited: 0, attended: 0, pct: 0, goal: null, churches: [] });
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: [] });
    expect(await screen.findByText(/Nenhum GA está ligado/)).toBeTruthy();
    expect(api.listGuests).not.toHaveBeenCalled();
  });

  it("GA leader toggles attendance optimistically", async () => {
    api.setAttended.mockResolvedValue({ ...rita, attendedAt: "t" });
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    await screen.findByText("Rita");
    fireEvent.click(screen.getByLabelText("Presente: Rita"));
    expect(screen.getByLabelText("Presente: Rita").checked).toBe(true);
    await waitFor(() => expect(api.setAttended).toHaveBeenCalledWith("g1", true));
  });

  it("GA leader adds a guest: phone is required, the modal keeps the values on error", async () => {
    api.createGuest.mockRejectedValueOnce(new Error("forbidden")).mockResolvedValueOnce({ ...rita, id: "g3", name: "Nova" });
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    await screen.findByText("Rita");
    fireEvent.click(screen.getByRole("button", { name: /Convidado/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Informe o telefone.")).toBeTruthy();
    expect(api.createGuest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Telefone inválido.")).toBeTruthy();
    expect(api.createGuest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "9735550199" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Você não tem acesso a este GA.")).toBeTruthy();
    expect(screen.getByLabelText("Nome").value).toBe("Nova");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Nova")).toBeTruthy();
    expect(api.createGuest).toHaveBeenLastCalledWith(expect.any(Number), expect.objectContaining({ gaId: "GA1", name: "Nova", phone: "9735550199" }));
  });

  it("GA leader edit is checked before it closes: an invalid phone keeps the modal and saves nothing", async () => {
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    fireEvent.click(await screen.findByRole("button", { name: "Rita" }));
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Telefone inválido.")).toBeTruthy();
    expect(api.updateGuest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("E-mail (opcional)"), { target: { value: "nope" } });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "9735550199" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("E-mail inválido.")).toBeTruthy();
    expect(api.updateGuest).not.toHaveBeenCalled();
  });

  it("a late motivos answer for the previous year never replaces the current year's", async () => {
    let lateResolve;
    api.getEdition.mockImplementation((y) => (y === new Date().getFullYear()
      ? new Promise((r) => { lateResolve = () => r({ reasons: "# Ano atual atrasado", reasonsEn: "" }); })
      : Promise.resolve({ reasons: "# Ano anterior", reasonsEn: "" })));
    renderAs({ name: "Pr", sysRoles: ["pastor"] });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: String(new Date().getFullYear() - 1) } });
    expect(await screen.findByText("Ano anterior")).toBeTruthy();
    lateResolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Ano atual atrasado")).toBeNull();
    expect(screen.getByText("Ano anterior")).toBeTruthy();
  });
});
