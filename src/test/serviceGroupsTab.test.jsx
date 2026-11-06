import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";
import { fetchServiceGroups, setScheduleSlot, saveServiceGroup } from "@/lib/serviceGroupsData";

vi.mock("@/lib/serviceGroupsData", () => ({
  fetchServiceGroups: vi.fn(), saveServiceGroup: vi.fn(), deleteServiceGroup: vi.fn(), setScheduleSlot: vi.fn(),
}));
vi.mock("@/lib/auditEvent", () => ({ logAuditEvent: vi.fn(), staffActor: (u) => u }));

let ctx = {};
vi.mock("@/context/AppDataContext", () => ({ useAppDataContext: () => ctx }));

const { default: ServiceGroupsTab } = await import("@/sections/worship/ServiceGroupsTab");
const tt = STRINGS.pt;
const CHURCHES = [{ display: "Newark, NJ", is_hub: true }, { display: "New York, NY", is_hub: true }];
const DATA = {
  groups: [
    { id: "g1", church: "Newark, NJ", name: "Newark 1", leader_name: "Ana", is_active: true },
    { id: "g2", church: "Newark, NJ", name: "Newark 2", leader_name: "Bia", is_active: false },
  ],
  workers: [{ id: "w1", group_id: "g1", name: "Caio", position: 0 }],
  schedule: [{ church: "Newark, NJ", slot: "mon", group_id: "g1" }, { church: "Newark, NJ", slot: "tue", group_id: "g2" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchServiceGroups.mockResolvedValue({ data: DATA, error: null });
  setScheduleSlot.mockResolvedValue({ error: null });
});

describe("ServiceGroupsTab", () => {
  it("shows the weekly table with each slot's group and leader; inactive groups are flagged", async () => {
    ctx = { user: { sysRoles: ["admin"], church: "Newark, NJ" }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    const mon = await screen.findByTestId("sg-slot-mon");
    expect(within(mon).getByRole("combobox").value).toBe("g1");
    expect(within(mon).getByText("Ana")).toBeTruthy();
    expect(within(screen.getByTestId("sg-slot-tue")).getByText(new RegExp(tt.sgInactive))).toBeTruthy();
    expect(screen.getByText("Caio")).toBeTruthy();
  });

  it("saves a slot change for an admin", async () => {
    ctx = { user: { sysRoles: ["admin"] }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    const wed = await screen.findByTestId("sg-slot-wed");
    fireEvent.change(within(wed).getByRole("combobox"), { target: { value: "g1" } });
    await waitFor(() => expect(setScheduleSlot).toHaveBeenCalledWith("Newark, NJ", "wed", "g1"));
  });

  it("does not offer an inactive group for a slot that does not have it", async () => {
    ctx = { user: { sysRoles: ["admin"] }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    const wed = await screen.findByTestId("sg-slot-wed");
    const values = [...within(wed).getByRole("combobox").options].map((o) => o.value);
    expect(values).toEqual(["", "g1"]);
  });

  it("is read-only for a pastor", async () => {
    ctx = { user: { sysRoles: ["pastor"], church: "Newark, NJ" }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    expect(await screen.findByText(tt.sgReadOnly)).toBeTruthy();
    expect(within(screen.getByTestId("sg-slot-mon")).queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(tt.sgNewGroup)).toBeNull();
  });

  it("locks a clerk to their own church", async () => {
    ctx = { user: { sysRoles: ["clerk"], church: "New York, NY" }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    await waitFor(() => expect(fetchServiceGroups).toHaveBeenCalledWith("New York, NY"));
    expect(screen.getByLabelText(tt.sgChurch).disabled).toBe(true);
    expect(screen.getByText(tt.sgNewGroup)).toBeTruthy();
  });

  it("shows the migration hint when loading fails", async () => {
    fetchServiceGroups.mockResolvedValue({ data: { groups: [], workers: [], schedule: [] }, error: { message: "x" } });
    ctx = { user: { sysRoles: ["admin"] }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    expect(await screen.findByText(tt.sgLoadFailed)).toBeTruthy();
  });

  it("closes an open group form when the church changes", async () => {
    ctx = { user: { sysRoles: ["admin"] }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    fireEvent.click(await screen.findByText(tt.sgNewGroup));
    expect(screen.getByLabelText(tt.sgName)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(tt.sgChurch), { target: { value: "New York, NY" } });
    await waitFor(() => expect(fetchServiceGroups).toHaveBeenCalledWith("New York, NY"));
    expect(screen.queryByLabelText(tt.sgName)).toBeNull();
  });

  it("keeps the new group's id after a partial save, so the retry is an update", async () => {
    const notify = vi.fn();
    ctx = { user: { sysRoles: ["admin"] }, notify, members: [], churches: CHURCHES };
    saveServiceGroup.mockResolvedValueOnce({ data: { group: { id: "g9", church: "Newark, NJ", name: "Newark 3", is_active: true }, workers: [] }, error: { message: "workers" } });
    saveServiceGroup.mockResolvedValueOnce({ data: { group: { id: "g9", church: "Newark, NJ", name: "Newark 3", is_active: true }, workers: [] }, error: null });
    render(<ServiceGroupsTab lang="pt" />);
    fireEvent.click(await screen.findByText(tt.sgNewGroup));
    fireEvent.change(screen.getByLabelText(tt.sgName), { target: { value: "Newark 3" } });
    fireEvent.click(screen.getByText(tt.sgSave));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(tt.sgSaveFailed));
    fireEvent.click(screen.getByText(tt.sgSave));
    await waitFor(() => expect(saveServiceGroup).toHaveBeenCalledTimes(2));
    expect(saveServiceGroup.mock.calls[1][0].id).toBe("g9");
  });

  it("says the name is taken when the database refuses a duplicate", async () => {
    const notify = vi.fn();
    ctx = { user: { sysRoles: ["admin"] }, notify, members: [], churches: CHURCHES };
    saveServiceGroup.mockResolvedValueOnce({ data: null, error: { code: "duplicate_name" } });
    render(<ServiceGroupsTab lang="pt" />);
    fireEvent.click(await screen.findByText(tt.sgNewGroup));
    fireEvent.change(screen.getByLabelText(tt.sgName), { target: { value: "Newark 3" } });
    fireEvent.click(screen.getByText(tt.sgSave));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(tt.sgNameTaken));
  });
});
