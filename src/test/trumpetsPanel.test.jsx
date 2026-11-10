import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppDataContext } from "@/context/AppDataContext";

const { fetchStats, getEdition } = vi.hoisted(() => ({ fetchStats: vi.fn(), getEdition: vi.fn() }));
vi.mock("@/lib/trumpetsApi", () => ({ fetchStats, getEdition }));

import TrumpetsPanelView from "@/views/TrumpetsPanelView";

const STATS = {
  year: 2026, invited: 120, attended: 30, pct: 25, goal: 200, prev: { invited: 100, attended: 40 },
  byChurch: [{ church: "Newark, NJ - EUA", invited: 90, attended: 20, goal: 150 }, { church: "Kearny, NJ - EUA", invited: 30, attended: 10, goal: null }],
  topGas: [{ gaId: "GA1", name: "GA Central", invited: 50, attended: 10 }],
  topInviters: [{ memberId: "M1", name: "Ana Souza", invited: 12, attended: 3 }],
  perDay: [{ date: "2026-11-06", count: 4 }, { date: "2026-11-07", count: 9 }],
};

const renderAs = (user, path = "/assistance/trombetas/painel/2026") => render(
  <MemoryRouter initialEntries={[path]}>
    <AppDataContext.Provider value={{ user }}>
      <Routes><Route path="/assistance/trombetas/painel/:year?" element={<TrumpetsPanelView lang="pt" />} /></Routes>
    </AppDataContext.Provider>
  </MemoryRouter>,
);

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); fetchStats.mockReset(); fetchStats.mockResolvedValue(STATS); getEdition.mockReset(); getEdition.mockResolvedValue({ reasons: "# Pela salvação\nFamílias", reasonsEn: "" }); });
afterEach(() => vi.useRealTimers());

describe("T&F panel", () => {
  it("is closed to clerks and GA leaders without calling the API", () => {
    renderAs({ sysRoles: ["clerk"] });
    expect(screen.getByText("O painel é só para pastores e administradores.")).toBeTruthy();
    expect(fetchStats).not.toHaveBeenCalled();
  });

  it("shows totals, goal, year over year, rankings and per day for a pastor", async () => {
    renderAs({ sysRoles: ["pastor"] });
    expect(await screen.findByText("Trombetas e Festas 2026")).toBeTruthy();
    expect(screen.getByTestId("tf-invited").textContent).toBe("120");
    expect(screen.getByText("Meta: 200")).toBeTruthy();
    expect(screen.getByTestId("tf-yoy-invited").textContent).toBe("+20 (+20%)");
    expect(screen.getByTestId("tf-yoy-attended").textContent).toBe("−10 (−25%)");
    expect(screen.getByText("Newark")).toBeTruthy();
    expect(screen.getByText("GA Central")).toBeTruthy();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.getAllByTestId("tf-day")).toHaveLength(2);
    expect(fetchStats).toHaveBeenCalledWith(2026);
    expect(screen.getByText("Pela salvação")).toBeTruthy();
  });

  it("refreshes every 20 seconds", async () => {
    renderAs({ sysRoles: ["admin"] });
    await screen.findByText("Trombetas e Festas 2026");
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(fetchStats).toHaveBeenCalledTimes(2);
  });

  it("uses the current year without a param", async () => {
    renderAs({ sysRoles: ["admin"] }, "/assistance/trombetas/painel");
    await screen.findByTestId("tf-invited");
    expect(fetchStats).toHaveBeenCalledWith(new Date().getFullYear());
  });

  it("keeps the last numbers and says so when a refresh fails", async () => {
    renderAs({ sysRoles: ["admin"] });
    await screen.findByTestId("tf-invited");
    fetchStats.mockRejectedValueOnce(new Error("http_500"));
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(screen.getByTestId("tf-invited").textContent).toBe("120");
  });
});
