import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceListForm } from "@/views/WorshipListPublicView";
import { fetchListsByDate } from "@/lib/praiseData";
import { fetchServiceGroups } from "@/lib/serviceGroupsData";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/praiseData", () => ({
  fetchSuggestDays: () => Promise.resolve({ data: 7, error: null }), saveSuggestDays: vi.fn(),
  fetchListsByDate: vi.fn(), fetchRecentLists: vi.fn(), createList: vi.fn(), updateList: vi.fn(),
  addListItem: vi.fn(), removeListItem: vi.fn(), saveItemPositions: vi.fn(), createSong: vi.fn(),
}));
vi.mock("@/lib/serviceGroupsData", () => ({ fetchServiceGroups: vi.fn() }));

const tt = STRINGS.pt;
const CHURCH = "Newark, NJ";
const DATA = {
  groups: [
    { id: "g1", church: CHURCH, name: "Newark 1", leader_name: "Ana", is_active: true },
    { id: "g2", church: CHURCH, name: "Newark 2", leader_name: "Bia", is_active: true },
  ],
  workers: [{ id: "w1", group_id: "g2", name: "Caio", position: 0 }, { id: "w2", group_id: "g2", name: "Davi", position: 1 }],
  // 2026-11-02 Monday → Newark 2; 2026-11-03 Tuesday → Newark 1; Wednesday empty
  schedule: [{ church: CHURCH, slot: "mon", group_id: "g2" }, { church: CHURCH, slot: "tue", group_id: "g1" }],
};
const SAVED = { id: "l1", service_date: "2026-11-02", service_type: "noite", church: CHURCH, group_name: "Grupo Visitante", leader: null, preacher: null, entered_by: "Ana", locked: false, published_at: null, items: [] };

const renderForm = (props) => render(
  <ServiceListForm tt={tt} lang="pt" today="2026-11-02" songs={[]} songsById={new Map()} onSongCreated={() => {}} initialDate="2026-11-02" initialType="noite" initialChurch={CHURCH} {...props} />
);
const groupInput = () => screen.getByLabelText(tt.praiseGroup);

describe("ServiceListForm — responsible group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 2, 20, 0));
    fetchListsByDate.mockResolvedValue({ data: [], error: null });
    fetchServiceGroups.mockResolvedValue({ data: DATA, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it("fills the scheduled group and shows its leader and workers", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    expect(screen.getByLabelText(tt.praiseGroupLeader).value).toBe("Bia");
    expect(screen.getByText(`${tt.praiseGroupWorkers}: Caio, Davi`)).toBeTruthy();
    expect(screen.getByLabelText(tt.praiseLeader).value).toBe(""); // Dirigente is never auto-filled
  });

  it("keeps the group of a saved list", async () => {
    fetchListsByDate.mockResolvedValue({ data: [SAVED], error: null });
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Grupo Visitante"));
    expect(screen.queryByLabelText(tt.praiseGroupLeader)).toBeNull();
  });

  it("still treats the group as scheduled when typed with other case/accents", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(groupInput(), { target: { value: "newark  2" } });
    expect(screen.getByLabelText(tt.praiseGroupLeader).value).toBe("Bia");
  });

  it("hides leader and workers once another group is typed", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(groupInput(), { target: { value: "Grupo de Elizabeth" } });
    expect(screen.queryByLabelText(tt.praiseGroupLeader)).toBeNull();
    expect(screen.queryByText(/Caio/)).toBeNull();
  });

  it("replaces the auto-filled group when the date moves, and clears it on a day with no group", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(screen.getByLabelText(tt.praiseDate), { target: { value: "2026-11-03" } });
    await waitFor(() => expect(groupInput().value).toBe("Newark 1"));
    fireEvent.change(screen.getByLabelText(tt.praiseDate), { target: { value: "2026-11-04" } });
    await waitFor(() => expect(groupInput().value).toBe(""));
  });

  it("does not replace a group the person typed when the date moves", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(groupInput(), { target: { value: "Grupo de Elizabeth" } });
    fireEvent.change(screen.getByLabelText(tt.praiseDate), { target: { value: "2026-11-03" } });
    await waitFor(() => expect(fetchListsByDate).toHaveBeenLastCalledWith("2026-11-03"));
    expect(groupInput().value).toBe("Grupo de Elizabeth");
  });

  it("works as before when the groups cannot be loaded", async () => {
    fetchServiceGroups.mockRejectedValue(new Error("relation does not exist"));
    renderForm();
    await waitFor(() => expect(groupInput()).toBeTruthy());
    expect(groupInput().value).toBe("");
    expect(screen.queryByLabelText(tt.praiseGroupLeader)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
