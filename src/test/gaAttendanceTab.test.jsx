import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDataContext } from "@/context/AppDataContext";

const fetchA = vi.fn();
const saveA = vi.fn();
const listA = vi.fn();
vi.mock("@/lib/gaAttendanceData", () => ({
  fetchAttendance: (...a) => fetchA(...a), saveAttendance: (...a) => saveA(...a),
  listAttendance: (...a) => listA(...a), deleteAttendance: vi.fn(),
}));
vi.mock("@/lib/auditEvent", () => ({ logAuditEvent: vi.fn(), staffActor: (u) => ({ name: u?.name, id: u?.id, role: "ga_leader" }) }));
vi.mock("@/lib/prayerSlots", async (orig) => ({ ...(await orig()), todayLocal: () => "2026-11-01" })); // a Sunday

import GaAttendanceTab from "@/sections/assistance/GaAttendanceTab";

const members = [
  { id: "a", name: "Ana", gaId: "g1" }, { id: "b", name: "Bruno", gaId: "g1" }, { id: "c", name: "Carla", gaId: "g2" },
];
const gas = [{ id: "g1", name: "Newark 1", church: "Newark, NJ" }, { id: "g2", name: "Newark 2", church: "Newark, NJ" }];
const notify = vi.fn();
const renderTab = (user) => render(
  <AppDataContext.Provider value={{ user, members, gas, notify }}><GaAttendanceTab lang="pt" /></AppDataContext.Provider>
);
const leader = { id: 5, name: "Leonard", sysRoles: ["ga_leader"], gaIds: ["g1"] };

beforeEach(() => {
  fetchA.mockReset().mockResolvedValue({ data: null, error: null });
  saveA.mockReset();
  listA.mockReset().mockResolvedValue({ data: [], error: null });
  notify.mockReset();
});

describe("GaAttendanceTab — Chamada", () => {
  it("a leader with no groups gets a friendly message and no query", () => {
    renderTab({ ...leader, gaIds: [] });
    expect(screen.getByText("Nenhum grupo de assistência ligado à sua conta. Fale com a secretaria.")).toBeTruthy();
    expect(fetchA).not.toHaveBeenCalled();
  });

  it("shows only the leader's group, loads today's first service and marks members", async () => {
    renderTab(leader);
    await waitFor(() => expect(fetchA).toHaveBeenCalledWith("g1", "2026-11-01", "ebd"));
    expect(await screen.findByLabelText("Ana")).toBeTruthy();
    expect(screen.queryByText("Carla")).toBeNull();
    expect(screen.queryByLabelText("Grupo")).toBeNull(); // one group: no picker
    fireEvent.click(screen.getByLabelText("Ana"));
    expect(screen.getByText("1 de 2 presentes · 0 visitante(s)")).toBeTruthy();
  });

  it("saves present members, visitors and who recorded it", async () => {
    saveA.mockResolvedValue({ data: { id: "r1", service_date: "2026-11-01", service_type: "ebd", entered_by_name: "Leonard", updated_at: "2026-11-01T15:00:00Z", roster_ids: ["a", "b"], present_ids: ["b"], visitors: ["José"] }, error: null });
    renderTab(leader);
    fireEvent.click(await screen.findByLabelText("Bruno"));
    fireEvent.change(screen.getByPlaceholderText("Nome do visitante"), { target: { value: "José" } });
    fireEvent.click(screen.getByText("Adicionar"));
    fireEvent.click(screen.getByText("Salvar chamada"));
    await waitFor(() => expect(saveA).toHaveBeenCalled());
    expect(saveA.mock.calls[0][0]).toMatchObject({
      ga_id: "g1", church: "Newark, NJ", service_date: "2026-11-01", service_type: "ebd",
      roster_ids: ["a", "b"], present_ids: ["b"], visitors: ["José"], entered_by_user_id: 5, entered_by_name: "Leonard",
    });
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Chamada salva."));
  });

  it("a failed save keeps what was marked", async () => {
    saveA.mockResolvedValue({ data: null, error: "boom" });
    renderTab(leader);
    fireEvent.click(await screen.findByLabelText("Ana"));
    fireEvent.click(screen.getByText("Salvar chamada"));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("Não foi possível salvar")));
    expect(screen.getByLabelText("Ana").checked).toBe(true);
  });

  it("an existing attendance opens filled in, keeping a member who left", async () => {
    fetchA.mockResolvedValue({ data: { id: "r1", service_date: "2026-11-01", service_type: "ebd", roster_ids: ["a", "c"], present_ids: ["c"], visitors: [], notes: "", entered_by_name: "Leonard", updated_at: "2026-11-01T15:00:00Z" }, error: null });
    renderTab(leader);
    expect(await screen.findByText(/Lançada por Leonard em 01\/11\/2026/)).toBeTruthy();
    expect(screen.getByLabelText("Carla").checked).toBe(true);
    expect(screen.getByLabelText("Bruno").checked).toBe(false); // joined since: listed, unmarked
  });

  it("moving the date to a weekday falls back to Noite; a date out of the window disables saving", async () => {
    renderTab(leader);
    await screen.findByLabelText("Ana");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-28" } }); // Wednesday
    await waitFor(() => expect(fetchA).toHaveBeenLastCalledWith("g1", "2026-10-28", "noite"));
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-01" } });
    expect(await screen.findByText("A chamada pode ser feita para hoje ou até 14 dias atrás.")).toBeTruthy();
    expect(screen.getByText("Salvar chamada").closest("button").disabled).toBe(true);
  });

  it("admin picks among every group", async () => {
    renderTab({ id: 1, name: "Admin", sysRoles: ["admin"] });
    fireEvent.change(await screen.findByLabelText("Grupo"), { target: { value: "g2" } });
    await waitFor(() => expect(fetchA).toHaveBeenLastCalledWith("g2", "2026-11-01", "ebd"));
    expect(await screen.findByLabelText("Carla")).toBeTruthy();
  });
});
