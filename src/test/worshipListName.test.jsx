import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceListForm } from "@/views/WorshipListPublicView";
import { fetchListsByDate, updateList } from "@/lib/praiseData";
import fs from "node:fs";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/praiseData", () => ({
  fetchListsByDate: vi.fn(), fetchRecentLists: vi.fn(), createList: vi.fn(), updateList: vi.fn(),
  addListItem: vi.fn(), removeListItem: vi.fn(), saveItemPositions: vi.fn(), createSong: vi.fn(),
}));
const audit = vi.fn();
vi.mock("@/lib/auditEvent", async (orig) => ({ ...(await orig()), logAuditEvent: (e) => audit(e) }));

const memory = new Map();
vi.stubGlobal("localStorage", { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k), clear: () => memory.clear() });

const tt = STRINGS.pt;
const SONG = { id: "s1", code: "CL-004", title: "QUANDO TE PROSTRARES", category: "coletanea", status: "active" };
// João saved the list and left the group / leader / preacher empty; published, not finalized
const SAVED = {
  id: "l1", service_date: "2026-10-25", service_type: "noite", church: "Newark, NJ", group_name: null, leader: null, preacher: null,
  entered_by: "Joao", locked: false, published_at: "2026-10-25T23:24:15Z", items: [{ id: "i1", song_id: "s1", position: 0 }],
};

const renderForm = () => render(
  <ServiceListForm tt={tt} lang="pt" today="2026-10-25" songs={[SONG]} songsById={new Map([[SONG.id, SONG]])} onSongCreated={() => {}} initialDate="2026-10-25" initialType="noite" />
);

describe("a list that is already saved can be completed by someone else", () => {
  beforeEach(() => {
    vi.clearAllMocks(); memory.clear();
    // the evening of the service: the list auto-locks at midnight, so a real clock would lock it once the date passes
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 25, 20, 0));
    fetchListsByDate.mockResolvedValue({ data: [SAVED], error: null });
    updateList.mockImplementation(async (id, fields) => ({ data: { ...SAVED, ...fields }, error: null }));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the name field on a saved list too, labelled as the person editing", async () => {
    renderForm();
    expect(await screen.findByLabelText(tt.praiseEditedBy)).toBeTruthy();
    expect(screen.queryByLabelText(tt.praiseEnteredBy)).toBeNull();
  });

  it("without a name it explains and takes you to the field instead of saving", async () => {
    renderForm();
    const input = await screen.findByLabelText(tt.praiseEditedBy);
    fireEvent.change(await screen.findByLabelText(tt.praiseGroup), { target: { value: "Newark 5" } });
    fireEvent.click(screen.getByRole("button", { name: tt.praiseSave }));
    expect(await screen.findByText(tt.praiseNameRequired)).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(updateList).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: tt.praiseSave }).disabled).toBe(false);   // the button is not left stuck on "saving"
  });

  it("with a name, saves the group, leader and preacher and records who changed what", async () => {
    renderForm();
    fireEvent.change(await screen.findByLabelText(tt.praiseEditedBy), { target: { value: "Leonard" } });
    fireEvent.change(screen.getByLabelText(tt.praiseGroup), { target: { value: "Newark 5" } });
    fireEvent.change(screen.getByLabelText(tt.praiseLeader), { target: { value: "Marcone" } });
    fireEvent.change(screen.getByLabelText(tt.praisePreacher), { target: { value: "Pr Jairo" } });
    fireEvent.click(screen.getByRole("button", { name: tt.praiseSave }));
    await waitFor(() => expect(updateList).toHaveBeenCalledWith("l1", { church: "Newark, NJ", group_name: "Newark 5", leader: "Marcone", preacher: "Pr Jairo" }));
    await waitFor(() => expect(audit).toHaveBeenCalled());
    expect(audit.mock.calls[0][0]).toMatchObject({
      actor: { name: "Leonard", role: "public" }, action: "worship_list_updated", entityType: "worship_list", entityId: "l1",
      details: { group_name: { from: null, to: "Newark 5" }, leader: { from: null, to: "Marcone" }, preacher: { from: null, to: "Pr Jairo" }, via: "public link" },
    });
  });

  it("does not log an edit when nothing changed", async () => {
    renderForm();
    fireEvent.change(await screen.findByLabelText(tt.praiseEditedBy), { target: { value: "Leonard" } });
    fireEvent.click(screen.getByRole("button", { name: tt.praiseSave }));
    await waitFor(() => expect(updateList).toHaveBeenCalled());
    expect(audit).not.toHaveBeenCalled();
  });

  it("has the new label in both languages", () => {
    expect(STRINGS.pt.praiseEditedBy).toBeTruthy();
    expect(STRINGS.en.praiseEditedBy).toBeTruthy();
  });
});

describe("audit coverage of the praise lists and songs", () => {
  const ACTIONS = [
    "worship_list_created", "worship_list_updated", "worship_list_song_added", "worship_list_song_removed", "worship_list_reordered",
    "worship_list_published", "worship_list_finalized", "worship_list_reopened", "worship_list_deleted",
    "praise_song_created", "praise_song_updated", "praise_song_approved", "praise_song_deleted",
  ];
  it("each action is written by the code and has a label in the Auditoria screen", () => {
    const labels = fs.readFileSync("src/views/admin/AuditLogTab.jsx", "utf8");
    const code = ["src/views/WorshipListPublicView.jsx", "src/sections/worship/PraiseListsTab.jsx", "src/lib/praiseData.js"].map((f) => fs.readFileSync(f, "utf8")).join("\n");
    for (const a of ACTIONS) {
      expect(code, `${a} is never written`).toContain(`"${a}"`);
      expect(labels, `${a} has no label`).toContain(`${a}:`);
    }
  });
});
