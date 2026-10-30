import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { STRINGS, fill } from "@/i18n/strings";
import * as data from "@/lib/praiseData";

vi.mock("@/lib/praiseData", () => ({
  fetchSongs: vi.fn(), fetchRecentLists: vi.fn(), fetchListsByDate: vi.fn(), fetchListFor: vi.fn(),
  createList: vi.fn(), updateList: vi.fn(), deleteList: vi.fn(), addListItem: vi.fn(), removeListItem: vi.fn(), saveItemPositions: vi.fn(),
  createSong: vi.fn(), updateSong: vi.fn(), deleteSong: vi.fn(), mergeSongs: vi.fn(), mergeLists: vi.fn(),
}));
const audit = vi.fn();
vi.mock("@/lib/auditEvent", async (orig) => ({ ...(await orig()), logAuditEvent: (e) => audit(e) }));
const notify = vi.fn();
vi.mock("@/context/AppDataContext", () => ({ useAppDataContext: () => ({ user: { name: "Admin", sysRoles: ["admin"], teamLeads: [] }, notify, churches: [] }) }));

const memory = new Map();
vi.stubGlobal("localStorage", { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k), clear: () => memory.clear() });

import { ServiceListForm } from "@/views/WorshipListPublicView";
import PraiseListsTab from "@/sections/worship/PraiseListsTab";

const tt = STRINGS.pt;
const S45 = { id: "s45", code: "CL-045", title: "LOUVOR QUARENTA E CINCO", category: "coletanea", status: "active", sung_by_church: {} };
const S46 = { id: "s46", code: "CL-046", title: "LOUVOR QUARENTA E SEIS", category: "coletanea", status: "active", sung_by_church: {} };
const byId = new Map([S45, S46].map((s) => [s.id, s]));
const typeOptions = () => [...screen.getByLabelText(tt.praiseServiceType).options].map((o) => o.value);
const form = (props) => render(<ServiceListForm tt={tt} lang="pt" today="2026-10-26" songs={[S45, S46]} songsById={byId} onSongCreated={() => {}} {...props} />);

beforeEach(() => {
  vi.clearAllMocks(); memory.clear();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 26, 19, 0)); // Monday evening
  data.fetchListsByDate.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.useRealTimers());

describe("public form: one list per service", () => {
  it("offers only Noite on a weekday and EBD + Noite on Sunday (no Outro)", async () => {
    form({ initialDate: "2026-10-26" });
    await waitFor(() => expect(typeOptions()).toEqual(["noite"]));
    fireEvent.change(screen.getByLabelText(tt.praiseDate), { target: { value: "2026-10-25" } });
    await waitFor(() => expect(typeOptions()).toEqual(["ebd", "noite"]));
  });

  it("opens the list of the chosen church, not another church's list of the same service", async () => {
    data.fetchListsByDate.mockResolvedValue({ data: [
      { id: "ny", service_date: "2026-10-26", service_type: "noite", church: "New York, NY", group_name: "Grupo NY", entered_by: "Ana", items: [] },
      { id: "nk", service_date: "2026-10-26", service_type: "noite", church: "Newark, NJ", group_name: "Anderson", entered_by: "Joao", items: [{ id: "i1", song_id: "s45", position: 0 }] },
    ], error: null });
    form({ initialDate: "2026-10-26", initialChurch: "Newark, NJ" });
    expect(await screen.findByDisplayValue("Anderson")).toBeTruthy();
    expect(screen.queryByDisplayValue("Grupo NY")).toBeNull();
  });

  it("when someone saved the same service a moment earlier, opens their list and adds the songs typed here", async () => {
    memory.set("mcc_worship_church", JSON.stringify("Newark, NJ"));
    data.createList.mockResolvedValue({ data: null, error: { code: "list_exists" } });
    const theirs = { id: "theirs", service_date: "2026-10-26", service_type: "noite", church: "Newark, NJ", group_name: null, leader: null, preacher: null, entered_by: "Joao", locked: false, items: [{ id: "t1", song_id: "s45", position: 0 }] };
    data.fetchListFor.mockResolvedValue({ data: theirs, error: null });
    data.addListItem.mockImplementation(async (listId, songId, position) => ({ data: { id: `new-${songId}`, song_id: songId, position }, error: null }));
    data.updateList.mockImplementation(async (id, fields) => ({ data: { ...theirs, ...fields }, error: null }));
    form({ initialDate: "2026-10-26" });

    const search = await screen.findByPlaceholderText(tt.praiseSearchPlaceholder);
    for (const n of ["45", "46"]) {
      fireEvent.change(search, { target: { value: n } });
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${n} · LOUVOR`) }));
    }
    fireEvent.change(screen.getByLabelText(tt.praiseGroup), { target: { value: "Anderson" } });
    fireEvent.change(screen.getByLabelText(tt.praiseEnteredBy), { target: { value: "Jevlert" } });
    fireEvent.click(screen.getByRole("button", { name: tt.praiseSave }));

    expect(await screen.findByText(fill(tt.praiseListExistsJoined, { name: "Joao" }))).toBeTruthy();
    expect(data.fetchListFor).toHaveBeenCalledWith("2026-10-26", "noite", "Newark, NJ");
    expect(data.addListItem).toHaveBeenCalledTimes(1); // only 46: 45 was already on their list
    expect(data.addListItem).toHaveBeenCalledWith("theirs", "s46", 1);
    expect(data.updateList).toHaveBeenCalledWith("theirs", { group_name: "Anderson" }); // the detail their list lacked
    expect(audit.mock.calls.map(([e]) => e.action)).toContain("worship_list_joined_existing");
  });
});

describe("admin: merging duplicates", () => {
  const COPY = { id: "copy", code: null, title: "OUR LIPS SHALL GLORIFY", category: "english", status: "pending", times_sung: 1, sung_by_church: {} };
  const RIGHT = { id: "right", code: null, title: "OUR LIPS SHALL GLORIFY", category: "english", status: "pending", times_sung: 1, created_by: "Joao", sung_by_church: {} };
  const LISTS = [
    { id: "lj", service_date: "2026-10-26", service_type: "noite", church: "Newark, NJ", entered_by: "Joao", group_name: null, created_at: "1", items: [{ id: "a", song_id: "right", position: 0 }] },
    { id: "lv", service_date: "2026-10-26", service_type: "noite", church: "Newark, NJ", entered_by: "Jevlert", group_name: "Anderson", created_at: "2", items: [{ id: "b", song_id: "copy", position: 0 }] },
  ];
  beforeEach(() => {
    data.fetchSongs.mockResolvedValue({ data: [COPY, RIGHT], error: null });
    data.fetchRecentLists.mockResolvedValue({ data: LISTS, error: null });
  });

  it("merges a duplicate song into the right one and logs it", async () => {
    data.mergeSongs.mockResolvedValue({ data: { moved: 1, already_there: 0, from: { id: "copy" } }, error: null });
    render(<PraiseListsTab lang="pt" />);
    const merges = await screen.findAllByRole("button", { name: new RegExp(tt.praiseMerge) });
    fireEvent.click(merges[0]); // the first pending row (COPY)
    const dialog = screen.getByRole("dialog", { name: tt.praiseMergeSongTitle });
    fireEvent.click(within(dialog).getByRole("button", { name: /OUR LIPS SHALL GLORIFY/ })); // the suggested similar title
    expect(within(dialog).getByText(fill(tt.praiseMergeSongPreview, { n: 1, song: "OUR LIPS SHALL GLORIFY" }))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(tt.praiseMergeSongConfirm) }));
    await waitFor(() => expect(data.mergeSongs).toHaveBeenCalledWith("copy", "right"));
    await waitFor(() => expect(audit.mock.calls.map(([e]) => e.action)).toContain("praise_song_merged"));
  });

  it("warns about duplicate lists and merges them into the chosen one", async () => {
    data.mergeLists.mockResolvedValue({ data: { songs_added: 1, dropped: { id: "lv" } }, error: null });
    render(<PraiseListsTab lang="pt" />);
    fireEvent.click(await screen.findByRole("button", { name: tt.praiseAdminLists }));
    expect(await screen.findByText(fill(tt.praiseDuplicateListsBanner, { n: 1 }))).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(tt.praiseMergeLists) })[0]);
    const dialog = screen.getByRole("dialog", { name: tt.praiseMergeListsTitle });
    expect(within(dialog).getByText(fill(tt.praiseMergeListDeletes, { name: "Jevlert" }))).toBeTruthy(); // Joao's (first) stays by default
    expect(within(dialog).getByText(/Anderson/, { selector: "p" })).toBeTruthy(); // the group it gains
    fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(`^${tt.praiseMergeListsConfirm}`) }));
    await waitFor(() => expect(data.mergeLists).toHaveBeenCalledWith("lj", "lv"));
    await waitFor(() => expect(audit.mock.calls.map(([e]) => e.action)).toContain("worship_list_merged"));
  });
});
