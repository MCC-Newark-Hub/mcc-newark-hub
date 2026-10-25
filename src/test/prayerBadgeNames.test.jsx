import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { displayName, buildShareText } from "@/lib/prayerSlots";

const PERIOD = {
  id: "p1", title: "ORAÇÃO 24H", circular: "163-26", list_name: "Newark", start_date: "2026-10-26", end_date: "2026-10-31",
  reasons: [], reasons_en: [], is_active: true, scope_kind: "churches", scope_group_ids: [], scope_churches: ["Newark, NJ"], slot_capacity: 3,
};
const ROWS = [
  { id: "s1", slot_index: 0, member_id: "m1", member_name: "Jedilane Amaral", church: "Newark, NJ" },
  { id: "s2", slot_index: 1, member_id: null, member_name: "Visitante Silva", church: "Newark, NJ" },
  { id: "s3", slot_index: 2, member_id: "m2", member_name: "Maria Souza", church: "Newark, NJ" },
];
const MEMBERS = [
  { id: "m1", name: "Jedilane Amaral", badgeName: "Lainha Amaral", church: "Newark, NJ" },
  { id: "m2", name: "Maria Souza", badgeName: "", church: "Newark, NJ" },
];
const chain = (result) => {
  const o = { select: () => o, eq: () => o, in: () => o, order: () => o, then: (res, rej) => Promise.resolve(result).then(res, rej) };
  return o;
};
vi.mock("@/lib/supabase", () => ({ sb: { from: (t) => chain({ data: t === "prayer_periods" ? [PERIOD] : ROWS, error: null }) } }));
vi.mock("@/context/AppDataContext", () => ({ useAppDataContext: () => ({ churches: [{ id: "c1", display: "Newark, NJ", is_hub: true }], members: MEMBERS }) }));

import PrayerPublicView from "@/views/PrayerPublicView";

const memberById = new Map(MEMBERS.map((m) => [m.id, m]));

describe("displayName: badge name instead of the full name", () => {
  it("uses the badge name of a linked member", () => {
    expect(displayName(ROWS[0], memberById)).toBe("Lainha Amaral");
  });
  it("falls back to the typed name when there is no link, no badge name, or no member data", () => {
    expect(displayName(ROWS[1], memberById)).toBe("Visitante Silva");   // not linked to the directory
    expect(displayName(ROWS[2], memberById)).toBe("Maria Souza");        // linked, but the member has no badge name
    expect(displayName(ROWS[0], undefined)).toBe("Jedilane Amaral");
    expect(displayName(ROWS[0], new Map())).toBe("Jedilane Amaral");
    expect(displayName(undefined, memberById)).toBe("");
  });
});

describe("the WhatsApp copy", () => {
  it("lists the people by the name given by nameOf (badge name), and by the full name otherwise", () => {
    const withBadge = buildShareText(PERIOD, ROWS, "pt", (r) => displayName(r, memberById));
    expect(withBadge).toContain("00:00-00:15 - LAINHA AMARAL");
    expect(withBadge).not.toContain("JEDILANE");
    expect(buildShareText(PERIOD, ROWS, "pt")).toContain("00:00-00:15 - JEDILANE AMARAL");
  });
});

describe("the public board", () => {
  it("shows the badge name of linked people and the typed name of the others", async () => {
    render(
      <MemoryRouter initialEntries={["/24h-prayers/p1"]}>
        <Routes><Route path="/24h-prayers/:id?" element={<PrayerPublicView lang="pt" setLang={() => {}} />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("Lainha")).toBeTruthy();
    expect(screen.queryByText("Jedilane")).toBeNull();
    expect(screen.getByText("Visitante")).toBeTruthy();
    expect(screen.getByText("Maria")).toBeTruthy();
  });
});
