import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const query = vi.hoisted(() => ({
  rows: [
    { action: "registrations_paused", created_at: "2026-11-03T02:06:00Z" },
    { action: "registrations_resumed", created_at: "2026-11-06T17:41:00Z" },
  ],
  calls: [],
}));

vi.mock("@/lib/supabase", () => {
  const chain = (table) => {
    const q = {
      select: () => q,
      eq: (col, val) => { query.calls.push([table, col, val]); return q; },
      in: () => q,
      order: () => Promise.resolve({ data: query.rows, error: null }),
    };
    return q;
  };
  return { sb: { from: chain } };
});

import RegistrationPace from "@/views/admin/RegistrationPace";
import { LangContext, STRINGS } from "@/i18n/strings";

const reg = (ts, by = "Sistema") => ({ eventId: "E1", registeredAtTs: ts, registeredBy: by, cancelled: false });
const regs = [
  ...Array.from({ length: 6 }, (_, i) => reg(`2026-11-03T01:${String(21 + i).padStart(2, "0")}:00Z`)),
  reg("2026-11-04T19:05:00Z", "Reinaldo"),
  reg("2026-11-06T17:50:00Z"),
];
const event = { id: "E1", capacity: 200, registration_paused: false };

const renderIn = (lang) => render(
  <LangContext.Provider value={lang}><RegistrationPace regs={regs} event={event} /></LangContext.Provider>,
);

describe("RegistrationPace", () => {
  it("reads this event's pause history and shows each phase's count", async () => {
    renderIn("pt");
    const t = STRINGS.pt;
    await screen.findByText(t.pacePhase_reopened);
    expect(query.calls).toContainEqual(["audit_log", "entity_id", "E1"]);
    const rows = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(rows.map((r) => [r[0], r[4]])).toEqual([
      [t.pacePhase_opened, "6"],
      [t.pacePhase_paused, "1"],
      [t.pacePhase_reopened, "1"],
    ]);
    expect(rows[2][2]).toBe(t.paceNow);
  });

  it("labels the busiest hour and shows only the selected language", async () => {
    renderIn("en");
    await screen.findAllByText(STRINGS.en.pacePhase_reopened);
    expect(screen.getByText(/· 6$/)).toBeTruthy();
    expect(screen.getByText(STRINGS.en.paceTitle)).toBeTruthy();
    expect(screen.queryByText(STRINGS.pt.paceTitle)).toBeNull();
  });

  it("says so when the event has no registrations yet", () => {
    render(<LangContext.Provider value="pt"><RegistrationPace regs={[]} event={event} /></LangContext.Provider>);
    expect(screen.getByText(STRINGS.pt.paceEmpty)).toBeTruthy();
  });
});
