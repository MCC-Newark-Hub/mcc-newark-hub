import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceListForm } from "@/views/WorshipListPublicView";
import { fetchListsByDate, updateList } from "@/lib/praiseData";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/praiseData", () => ({
  fetchListsByDate: vi.fn(), fetchRecentLists: vi.fn(), createList: vi.fn(), updateList: vi.fn(),
  addListItem: vi.fn(), removeListItem: vi.fn(), saveItemPositions: vi.fn(), createSong: vi.fn(),
}));

const tt = STRINGS.pt;
const SONG = { id: "s1", code: "CL-004", title: "Quando te prostrares", category: "coletanea", status: "active" };
const BASE = {
  id: "l1", service_date: "2026-08-02", service_type: "noite", church: "Newark, NJ", group_name: null, leader: null, preacher: null,
  entered_by: "Ana", items: [{ id: "i1", song_id: "s1", position: 0 }],
};
// Finalized (locked): published or not, nobody but an admin can touch it any more.
const LOCKED = { ...BASE, locked: true, published_at: "2026-08-02T23:00:00Z" };
// Published but not yet finalized: the link is already out, but the list — and who led/preached — can still change.
const PUBLISHED_OPEN = { ...BASE, locked: false, published_at: "2026-08-02T23:00:00Z" };
// Not published at all yet.
const DRAFT = { ...BASE, locked: false, published_at: null };

const renderForm = (props) => render(
  <ServiceListForm tt={tt} lang="pt" today="2026-08-02" songs={[SONG]} songsById={new Map([[SONG.id, SONG]])} onSongCreated={() => {}} initialDate="2026-08-02" initialType="noite" {...props} />
);

describe("ServiceListForm", () => {
  // isListLocked() reads the real clock (auto-lock at 06:00 the day after the service) — freeze it
  // mid-service on the fixtures' date so "not locked" fixtures stay editable regardless of today's date.
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 7, 2, 20, 0)); });
  afterEach(() => vi.useRealTimers());

  it("is read-only for a regular person once the list is finalized", async () => {
    fetchListsByDate.mockResolvedValue({ data: [LOCKED], error: null });
    renderForm();
    expect(await screen.findByText(tt.praiseLocked)).toBeTruthy();
    expect(screen.queryByPlaceholderText(tt.praiseSearchPlaceholder)).toBeNull();
    expect(screen.queryByText(tt.praiseSave)).toBeNull();
  });

  it("lets an admin edit the same finalized list", async () => {
    fetchListsByDate.mockResolvedValue({ data: [LOCKED], error: null });
    renderForm({ admin: true, defaultName: "Leo" });
    expect(await screen.findByPlaceholderText(tt.praiseSearchPlaceholder)).toBeTruthy();
    expect(screen.getByText(tt.praiseSave)).toBeTruthy();
    expect(screen.queryByText(tt.praiseLocked)).toBeNull();
  });

  it("stays editable for anyone with the link once published — only Finalizar locks it", async () => {
    fetchListsByDate.mockResolvedValue({ data: [PUBLISHED_OPEN], error: null });
    renderForm();
    expect(await screen.findByPlaceholderText(tt.praiseSearchPlaceholder)).toBeTruthy();
    expect(screen.getByText(tt.praiseSave)).toBeTruthy();
    expect(screen.getByText(tt.praiseFinalize)).toBeTruthy();
    expect(screen.queryByText(tt.praisePublish)).toBeNull(); // already published — nothing left to publish
    expect(screen.queryByText(tt.praiseLocked)).toBeNull();
  });

  it("offers both Publicar link and Finalizar for a saved, unpublished list with songs", async () => {
    fetchListsByDate.mockResolvedValue({ data: [DRAFT], error: null });
    renderForm();
    expect(await screen.findByText(tt.praisePublish)).toBeTruthy();
    expect(screen.getByText(tt.praiseFinalize)).toBeTruthy();
  });

  it("Finalizar locks the list without touching published_at", async () => {
    fetchListsByDate.mockResolvedValue({ data: [PUBLISHED_OPEN], error: null });
    updateList.mockResolvedValue({ data: { locked: true }, error: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm();
    fireEvent.click(await screen.findByText(tt.praiseFinalize));
    await waitFor(() => expect(updateList).toHaveBeenCalledWith("l1", { locked: true }));
    expect(await screen.findByText(tt.praiseFinalized)).toBeTruthy();
  });
});
