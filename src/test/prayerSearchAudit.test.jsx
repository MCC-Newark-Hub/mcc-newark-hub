import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import fs from "node:fs";
import { STRINGS } from "@/i18n/strings";
import { findSlotsByName } from "@/lib/prayerSlots";

const PERIOD = {
  id: "p1", title: "ORAÇÃO 24H", circular: "163-26", list_name: "Newark", start_date: "2026-10-26", end_date: "2026-10-31",
  reasons: [], reasons_en: [], is_active: true, scope_kind: "churches", scope_group_ids: [], scope_churches: ["Newark, NJ"], slot_capacity: 3,
};
let ROWS = [];
const writes = { audit: [], slotInserts: [], deletes: [] };
const chain = (table, result) => {
  const o = {
    select: () => o, eq: () => o, in: () => o, order: () => o,
    insert: (rows) => {
      if (table === "audit_log") { writes.audit.push(rows); return Promise.resolve({ error: null }); }
      writes.slotInserts.push(rows);
      const list = Array.isArray(rows) ? rows : [rows];
      return { select: () => Promise.resolve({ data: list.map((_, i) => ({ id: `new${i}` })), error: null }) };
    },
    delete: () => ({ eq: (_c, id) => ({ select: () => { writes.deletes.push(id); return Promise.resolve({ data: [{ id }], error: null }); } }) }),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return o;
};
vi.mock("@/lib/supabase", () => ({ sb: { from: (t) => chain(t, { data: t === "prayer_periods" ? [PERIOD] : ROWS, error: null }) } }));
vi.mock("@/context/AppDataContext", () => ({
  useAppDataContext: () => ({ churches: [{ id: "c1", display: "Newark, NJ", is_hub: true }], members: [{ id: "m1", name: "Jedilane Amaral", badgeName: "Lainha Amaral", church: "Newark, NJ" }] }),
}));
const memory = new Map();
vi.stubGlobal("localStorage", { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k), clear: () => memory.clear() });

import PrayerPublicView from "@/views/PrayerPublicView";

const tt = STRINGS.pt;
const renderBoard = () => render(
  <MemoryRouter initialEntries={["/24h-prayers/p1"]}>
    <Routes><Route path="/24h-prayers/:id?" element={<PrayerPublicView lang="pt" setLang={() => {}} />} /></Routes>
  </MemoryRouter>
);
const searchBox = () => screen.findByPlaceholderText(tt.prayerSearchPlaceholder);

describe("findSlotsByName", () => {
  const members = new Map([["m1", { badgeName: "Lainha Amaral" }]]);
  const slots = [
    { id: "1", slot_index: 0, member_id: "m1", member_name: "Jedilane Amaral" },
    { id: "2", slot_index: 5, member_id: null, member_name: "Maria da Silva" },
    { id: "3", slot_index: 6, member_id: null, member_name: "Marcos Silva" },
  ];
  it("finds a person by the badge name or by the full name, ignoring accents and case", () => {
    expect(findSlotsByName(slots, "lainha", members).map((s) => s.id)).toEqual(["1"]);
    expect(findSlotsByName(slots, "JEDILANE amar", members).map((s) => s.id)).toEqual(["1"]);
    expect(findSlotsByName(slots, "maría", members).map((s) => s.id)).toEqual(["2"]);
  });
  it("every typed word must match: 'silva' finds two people, 'maria silva' one", () => {
    expect(findSlotsByName(slots, "silva", members).map((s) => s.id)).toEqual(["2", "3"]);
    expect(findSlotsByName(slots, "maria silva", members).map((s) => s.id)).toEqual(["2"]);
  });
  it("needs at least two letters and returns nothing for nobody", () => {
    expect(findSlotsByName(slots, "m", members)).toEqual([]);
    expect(findSlotsByName(slots, "", members)).toEqual([]);
    expect(findSlotsByName(slots, "zzz", members)).toEqual([]);
  });
});

describe("public board: search my name", () => {
  beforeEach(() => {
    writes.audit.length = 0; writes.slotInserts.length = 0; writes.deletes.length = 0; memory.clear();
    ROWS = [
      { id: "s1", slot_index: 0, member_id: "m1", member_name: "Jedilane Amaral", church: "Newark, NJ" },
      { id: "s2", slot_index: 12, member_id: null, member_name: "Jedilane Amaral", church: "Newark, NJ" },
      { id: "s3", slot_index: 20, member_id: null, member_name: "Outra Pessoa", church: "Newark, NJ" },
    ];
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows the person's time slots and filters the board to them", async () => {
    renderBoard();
    fireEvent.change(await searchBox(), { target: { value: "lainha" } });
    const box = await screen.findByRole("status");
    expect(within(box).getByText("Encontrei 1 horário para “lainha”:")).toBeTruthy();
    expect(within(box).getByText("00:00-00:15")).toBeTruthy();
    expect(screen.queryByText("OUTRA")).toBeNull();          // the board is filtered to the matching slots
  });

  it("finds several time slots of the same person (a person may pray in more than one)", async () => {
    renderBoard();
    fireEvent.change(await searchBox(), { target: { value: "jedilane" } });
    expect(await screen.findByText("Encontrei 2 horários para “jedilane”:")).toBeTruthy();
  });

  it("with only a first name nobody can be removed: it asks for first and last name", async () => {
    renderBoard();
    fireEvent.change(await searchBox(), { target: { value: "jedilane" } });
    await screen.findByText("Encontrei 2 horários para “jedilane”:");
    screen.getAllByRole("button", { name: /Remover o horário/ }).forEach((b) => expect(b.disabled).toBe(true));
    expect(screen.getByText(tt.prayerSearchFullNameHint)).toBeTruthy();
    expect(writes.deletes).toEqual([]);
  });

  it("removes a found slot after confirming, and writes it to the audit log", async () => {
    renderBoard();
    fireEvent.change(await searchBox(), { target: { value: "jedilane amaral" } });
    await screen.findByText("Encontrei 2 horários para “jedilane amaral”:");
    fireEvent.click(screen.getAllByRole("button", { name: /Remover o horário 03:00-03:15/ })[0]);
    await waitFor(() => expect(writes.deletes).toEqual(["s2"]));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("03:00-03:15"));
    await waitFor(() => expect(writes.audit.length).toBe(1));
    expect(writes.audit[0]).toMatchObject({
      actor_name: "jedilane amaral", actor_role: "public", action: "prayer_slot_removed", entity_type: "prayer_slot", entity_id: "s2", entity_label: "Jedilane Amaral",
      details: expect.objectContaining({ slot: "03:00-03:15", person: "Jedilane Amaral", church: "Newark, NJ", via: "public link", searched_for: "jedilane amaral", from_this_device: false, period_id: "p1" }),
    });
  });

  it("does not remove anything when the confirmation is declined", async () => {
    window.confirm.mockReturnValue(false);
    renderBoard();
    fireEvent.change(await searchBox(), { target: { value: "jedilane amaral" } });
    await screen.findByText("Encontrei 2 horários para “jedilane amaral”:");
    fireEvent.click(screen.getAllByRole("button", { name: /Remover o horário/ })[0]);
    expect(writes.deletes).toEqual([]);
    expect(writes.audit).toEqual([]);
  });

  it("says when the person is not in the list and offers to use the typed name to sign up", async () => {
    renderBoard();
    fireEvent.change(await searchBox(), { target: { value: "Zélia Nova" } });
    expect(await screen.findByText("“Zélia Nova” não está nesta lista. Para se inscrever, escolha os horários abaixo.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tt.prayerSearchUseName }));
    expect(screen.getByPlaceholderText(tt.prayerFirstAndLastName).value).toBe("Zélia Nova");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("every booking through the public link is written to the audit log", async () => {
    renderBoard();
    fireEvent.change(await screen.findByPlaceholderText(tt.prayerFirstAndLastName), { target: { value: "Maria Silva" } });
    const slots = await screen.findAllByRole("button", { pressed: false });
    fireEvent.click(slots.find((b) => b.textContent.trim().startsWith("00:30")));
    fireEvent.click(slots.find((b) => b.textContent.trim().startsWith("00:45")));
    fireEvent.click(screen.getByRole("button", { name: tt.prayerConfirm }));
    await waitFor(() => expect(writes.audit.length).toBe(2));
    expect(writes.audit.map((a) => a.details.slot).sort()).toEqual(["00:30-00:45", "00:45-01:00"]);
    expect(writes.audit[0]).toMatchObject({ actor_name: "Maria Silva", actor_role: "public", action: "prayer_slot_booked", entity_label: "Maria Silva" });
    expect(writes.audit[0].details).toMatchObject({ via: "public link", church: "Newark, NJ", list: "Newark" });
  });
});

describe("audit coverage", () => {
  const read = (p) => fs.readFileSync(p, "utf8");
  it("every prayer action written by the code has a label in the Auditoria screen", () => {
    const labels = read("src/views/admin/AuditLogTab.jsx");
    const sources = ["src/sections/schedule/OracaoTab.jsx", "src/views/PrayerPublicView.jsx"].map(read).join("\n");
    const actions = [...new Set([...sources.matchAll(/action[:=]\s*(?:"(prayer_[a-z_]+)"|[^"]*?"(prayer_[a-z_]+)")/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean))];
    expect(actions.length).toBeGreaterThanOrEqual(8);
    for (const a of actions) expect(labels, a).toContain(`${a}:`);
  });

  it("the admin actions that change a list are audited", () => {
    const src = read("src/sections/schedule/OracaoTab.jsx");
    for (const a of ["prayer_slot_added", "prayer_slot_removed", "prayer_slot_updated", "prayer_slots_imported", "prayer_slots_copied", "prayer_period_created", "prayer_period_updated", "prayer_period_activated", "prayer_period_deactivated", "prayer_period_deleted"]) {
      expect(src, a).toContain(a);
    }
  });

  it("has the search texts in both languages", () => {
    for (const lang of ["pt", "en"]) for (const k of ["prayerSearchLabel", "prayerSearchPlaceholder", "prayerSearchFoundOne", "prayerSearchFoundMany", "prayerSearchRemove", "prayerSearchRemoveAria", "prayerSearchChangeHint", "prayerSearchShowAll", "prayerSearchNotFound", "prayerSearchUseName", "prayerSearchFullNameHint", "prayerRemoveFoundConfirm"]) expect(STRINGS[lang][k]).toBeTruthy();
  });
});
