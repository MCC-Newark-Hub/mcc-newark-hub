import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { STRINGS } from "@/i18n/strings";

const PERIOD = {
  id: "p1", title: "ORAÇÃO 24H", circular: "163-26", list_name: "Newark", start_date: "2026-10-26", end_date: "2026-10-31",
  reasons: [], reasons_en: [], is_active: true, scope_kind: "churches", scope_group_ids: [], scope_churches: ["Newark, NJ"], slot_capacity: 3,
};
const insert = vi.fn((rows) => ({ select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: `new${i}` })), error: null }) }));
const chain = (result) => {
  const o = { select: () => o, eq: () => o, in: () => o, order: () => o, insert: (rows) => insert(rows), then: (res, rej) => Promise.resolve(result).then(res, rej) };
  return o;
};
vi.mock("@/lib/supabase", () => ({ sb: { from: (t) => chain({ data: t === "prayer_periods" ? [PERIOD] : [], error: null }) } }));
vi.mock("@/context/AppDataContext", () => ({ useAppDataContext: () => ({ churches: [{ id: "c1", display: "Newark, NJ", is_hub: true }] }) }));

import PrayerPublicView from "@/views/PrayerPublicView";

const tt = STRINGS.pt;

// An in-memory localStorage (the test runtime's own one is not available).
const memory = new Map();
vi.stubGlobal("localStorage", {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
});

const renderBoard = () => render(
  <MemoryRouter initialEntries={["/24h-prayers/p1"]}>
    <Routes><Route path="/24h-prayers/:id?" element={<PrayerPublicView lang="pt" setLang={() => {}} />} /></Routes>
  </MemoryRouter>
);

describe("public prayer board: the form starts clean after a booking", () => {
  beforeEach(() => { insert.mockClear(); localStorage.clear(); });

  it("clears the name after confirming, so the next person can type", async () => {
    renderBoard();
    const input = await screen.findByPlaceholderText(tt.prayerFirstAndLastName);
    fireEvent.change(input, { target: { value: "Maria Silva" } });
    expect(input.value).toBe("Maria Silva");

    const slots = await screen.findAllByRole("button", { pressed: false });
    fireEvent.click(slots.find((b) => /00:00/.test(b.textContent)));
    fireEvent.click(screen.getByRole("button", { name: tt.prayerConfirm }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0][0]).toMatchObject({ member_name: "Maria Silva", church: "Newark, NJ", slot_index: 0 });
    await waitFor(() => expect(screen.getByPlaceholderText(tt.prayerFirstAndLastName).value).toBe(""));
  });

  it("no longer remembers the name on the device, and removes what an older version saved", async () => {
    localStorage.setItem("mcc_prayer_profile", JSON.stringify({ name: "Antigo", church: "Newark, NJ" }));
    renderBoard();
    const input = await screen.findByPlaceholderText(tt.prayerFirstAndLastName);
    expect(input.value).toBe("");                               // not pre-filled from the old profile

    fireEvent.change(input, { target: { value: "Maria Silva" } });
    const slots = await screen.findAllByRole("button", { pressed: false });
    fireEvent.click(slots.find((b) => /00:15/.test(b.textContent)));
    fireEvent.click(screen.getByRole("button", { name: tt.prayerConfirm }));
    await waitFor(() => expect(insert).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem("mcc_prayer_profile")).toBeNull());
    expect(JSON.parse(localStorage.getItem("mcc_prayer_mine"))).toEqual(["new0"]);   // her slots are still listed as hers
  });
});
