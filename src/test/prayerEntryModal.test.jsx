import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";

const update = vi.fn();
let updateResult = null;
let nowInSlot = [];
vi.mock("@/lib/supabase", () => ({
  sb: { from: () => ({
    select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: nowInSlot }) }) }),
    update: (payload) => { update(payload); return { eq: () => ({ select: () => ({ single: () => Promise.resolve(updateResult(payload)) }) }) }; },
  }) },
}));

import PrayerEntryModal from "@/components/PrayerEntryModal";

const tt = STRINGS.pt;
const period = { id: "p1", slot_capacity: 2 };
const row = { id: "r1", slot_index: 12, member_id: null, member_name: "Mara N.", church: "Newark, NJ" };
// slot 14 already has 2 of 2 (full), slot 20 has 1 of 2
const slots = [
  row,
  { id: "a", slot_index: 14, member_name: "Ana", church: "Newark, NJ" }, { id: "b", slot_index: 14, member_name: "Bia", church: "Newark, NJ" },
  { id: "c", slot_index: 20, member_name: "Cida", church: "Newark, NJ" },
];
const members = [
  { id: "m1", name: "Mara Nunes", church: "Toms River, NJ" },
  { id: "m2", name: "Marcos Martins", church: "Newark, NJ" },
];
const churches = [{ id: "c1", display: "Newark, NJ", is_hub: true }, { id: "c2", display: "Toms River, NJ", is_hub: true }];

const setup = () => {
  const onSaved = vi.fn(); const onClose = vi.fn();
  render(<PrayerEntryModal row={row} period={period} slots={slots} members={members} churches={churches} lang="pt" onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
};
const slotSelect = () => screen.getByLabelText(tt.prayerEditSlot);

describe("admin: edit one person of a prayer list", () => {
  beforeEach(() => { update.mockClear(); nowInSlot = []; updateResult = (p) => ({ data: { id: "r1", ...p }, error: null }); });

  it("starts with the current name, church and time slot", () => {
    setup();
    expect(screen.getByDisplayValue("Mara N.")).toBeTruthy();
    expect(slotSelect().value).toBe("12");
    expect(screen.getByText(tt.prayerEditNotLinked)).toBeTruthy();
  });

  it("lists the time slots with their occupancy and disables the full ones (but not the current one)", () => {
    setup();
    const opts = Array.from(slotSelect().options);
    expect(opts[14].disabled).toBe(true);                                 // slot 14 (03:30-03:45): 2 of 2
    expect(opts[14].textContent).toContain("cheio");
    expect(opts[20].disabled).toBe(false);                                // 1 of 2
    expect(opts[12].disabled).toBe(false);                                // the person's own slot, counted once
    expect(opts[12].textContent).toContain("(1/2)");
  });

  it("saves a new name and a new time slot", async () => {
    const { onSaved } = setup();
    fireEvent.change(screen.getByDisplayValue("Mara N."), { target: { value: "  Mara   Nogueira " } });
    fireEvent.change(slotSelect(), { target: { value: "20" } });
    nowInSlot = [{ id: "c" }];
    fireEvent.click(screen.getByRole("button", { name: tt.prayerEditSave }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({ slot_index: 20, slot_time: "05:00", member_id: null, member_name: "Mara Nogueira", church: "Newark, NJ" });
  });

  it("picking a member from the suggestions links the person and takes the member's church", async () => {
    const { onSaved } = setup();
    fireEvent.change(screen.getByDisplayValue("Mara N."), { target: { value: "mara nu" } });
    fireEvent.click(await screen.findByRole("button", { name: /Mara Nunes/ }));
    expect(screen.getByText("Ligada ao cadastro: Mara Nunes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tt.prayerEditSave }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ member_id: "m1", member_name: "Mara Nunes", church: "Toms River, NJ", slot_index: 12 }));
  });

  it("typing a different name afterwards drops the link", async () => {
    setup();
    fireEvent.change(screen.getByDisplayValue("Mara N."), { target: { value: "mara nu" } });
    fireEvent.click(await screen.findByRole("button", { name: /Mara Nunes/ }));
    fireEvent.change(screen.getByDisplayValue("Mara Nunes"), { target: { value: "Outra Pessoa" } });
    expect(screen.getByText(tt.prayerEditNotLinked)).toBeTruthy();
  });

  it("refuses a slot that filled up in the meantime, without saving", async () => {
    setup();
    fireEvent.change(slotSelect(), { target: { value: "20" } });
    nowInSlot = [{ id: "x" }, { id: "y" }];                               // two people took it since the grid was loaded
    fireEvent.click(screen.getByRole("button", { name: tt.prayerEditSave }));
    expect((await screen.findByRole("alert")).textContent).toBe(tt.prayerEditConflict);
    expect(update).not.toHaveBeenCalled();
  });

  it("explains a conflict reported by the database and a plain failure", async () => {
    setup();
    updateResult = () => ({ data: null, error: { code: "23505" } });
    fireEvent.click(screen.getByRole("button", { name: tt.prayerEditSave }));
    expect((await screen.findByRole("alert")).textContent).toBe(tt.prayerEditConflict);
    updateResult = () => ({ data: null, error: { code: "XX000" } });
    fireEvent.click(screen.getByRole("button", { name: tt.prayerEditSave }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(tt.prayerEditFailed));
  });

  it("will not save an empty name", async () => {
    setup();
    fireEvent.change(screen.getByDisplayValue("Mara N."), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: tt.prayerEditSave }));
    expect((await screen.findByRole("alert")).textContent).toBe(tt.prayerEditNameShort);
    expect(update).not.toHaveBeenCalled();
  });

  it("has its texts in both languages", () => {
    for (const lang of ["pt", "en"]) for (const k of ["prayerEditTitle", "prayerEditAria", "prayerEditName", "prayerEditLinked", "prayerEditNotLinked", "prayerEditSlot", "prayerEditFull", "prayerEditSave", "prayerEditNameShort", "prayerEditConflict", "prayerEditFailed", "prayerEditDone"]) expect(STRINGS[lang][k]).toBeTruthy();
  });
});
