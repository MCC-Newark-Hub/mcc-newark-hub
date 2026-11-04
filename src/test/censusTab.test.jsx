import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppDataContext } from "@/context/AppDataContext";

const list = vi.fn();
vi.mock("@/lib/censusData", () => ({ listCensus: (...a) => list(...a), upsertCensusStaff: vi.fn(), deleteCensus: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toDataURL: () => Promise.resolve("data:image/png;base64,x") } }));
vi.mock("@/lib/prayerSlots", async (orig) => ({ ...(await orig()), todayLocal: () => "2026-11-04" }));

import CensusTab from "@/sections/assistance/CensusTab";
import { periodRange } from "@/lib/census";

const churches = [{ display: "Newark, NJ" }, { display: "New York, NY" }, { display: "Philadelphia, PA" }];
const renderTab = (user) => render(
  <AppDataContext.Provider value={{ user, churches, notify: vi.fn() }}><CensusTab lang="pt" /></AppDataContext.Provider>
);

beforeEach(() => list.mockReset());

describe("periodRange", () => {
  it("covers this month, 3 and 12 months back to today", () => {
    expect(periodRange("month", "2026-11-04")).toEqual({ from: "2026-11-01", to: "2026-11-04" });
    expect(periodRange("3m", "2026-11-04")).toEqual({ from: "2026-09-01", to: "2026-11-04" });
    expect(periodRange("12m", "2026-11-04")).toEqual({ from: "2025-12-01", to: "2026-11-04" });
  });
});

describe("CensusTab", () => {
  it("a clerk with a limited scope only asks for their churches", async () => {
    list.mockResolvedValue({ data: [], error: null });
    renderTab({ name: "Sec", sysRoles: ["clerk"], churches: ["New York, NY"] });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-04", churches: ["New York, NY"] }));
    expect(await screen.findByText("Nenhum culto registrado neste período.")).toBeTruthy();
  });

  it("admin asks for everything and sees totals and the summary", async () => {
    list.mockResolvedValue({ data: [
      { id: "1", church: "Newark, NJ", service_date: "2026-11-01", service_type: "noite", members_cia: 10, members_adult: 50, visitors_cia: 0, visitors_adult: 5, notes: null, entered_by_name: "Ana" },
    ], error: null });
    renderTab({ name: "Admin", sysRoles: ["admin"] });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-04", churches: null }));
    expect((await screen.findAllByText("65")).length).toBe(3); // row overall + "Média por culto" + "Média — Noite" (one service)
    expect(screen.getByText("Cultos registrados")).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
  });
});
