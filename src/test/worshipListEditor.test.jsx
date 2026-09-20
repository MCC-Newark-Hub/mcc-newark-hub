import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceListForm } from "@/views/WorshipListPublicView";
import { fetchListsByDate } from "@/lib/praiseData";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/praiseData", () => ({
  fetchListsByDate: vi.fn(), fetchRecentLists: vi.fn(), createList: vi.fn(), updateList: vi.fn(),
  addListItem: vi.fn(), removeListItem: vi.fn(), saveItemPositions: vi.fn(), createSong: vi.fn(),
}));

const tt = STRINGS.pt;
const SONG = { id: "s1", code: "CL-004", title: "Quando te prostrares", category: "coletanea", status: "active" };
// Published, hence locked, and created on another device.
const LOCKED = {
  id: "l1", service_date: "2026-08-02", service_type: "noite", church: "Newark, NJ", group_name: null, leader: null, preacher: null,
  entered_by: "Ana", locked: true, published_at: "2026-08-02T23:00:00Z", items: [{ id: "i1", song_id: "s1", position: 0 }],
};

const renderForm = (props) => render(
  <ServiceListForm tt={tt} lang="pt" today="2026-08-02" songs={[SONG]} songsById={new Map([[SONG.id, SONG]])} onSongCreated={() => {}} initialDate="2026-08-02" initialType="noite" {...props} />
);

describe("ServiceListForm", () => {
  beforeEach(() => { vi.clearAllMocks(); fetchListsByDate.mockResolvedValue({ data: [LOCKED], error: null }); });

  it("is read-only for a regular person when the list is published", async () => {
    renderForm();
    expect(await screen.findByText(tt.praiseLocked)).toBeTruthy();
    expect(screen.queryByPlaceholderText(tt.praiseSearchPlaceholder)).toBeNull();
    expect(screen.queryByText(tt.praiseSave)).toBeNull();
  });

  it("lets an admin edit the same published list", async () => {
    renderForm({ admin: true, defaultName: "Leo" });
    expect(await screen.findByPlaceholderText(tt.praiseSearchPlaceholder)).toBeTruthy();
    expect(screen.getByText(tt.praiseSave)).toBeTruthy();
    expect(screen.queryByText(tt.praiseLocked)).toBeNull();
  });
});
