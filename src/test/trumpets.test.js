import { describe, it, expect } from "vitest";
import {
  cityOf, profileOf, listGaIds, summaryGaIds, buildSummary, canManagePanel, toGuest, cleanGuestInput,
  totalsByGa, sumTotals, guestsCsv, dayOf, buildStats,
} from "@/lib/trumpets";

const GAS = [
  { id: "GA1", name: "GA Central", church: "Newark, NJ - EUA" },
  { id: "GA2", name: "GA Norte", church: "Newark, NJ - EUA" },
  { id: "GA3", name: "GA Kearny", church: "Kearny, NJ - EUA" },
];

describe("scope", () => {
  it("only GA leaders get lists, and only of their GAs (admin, pastor, clerk get none)", () => {
    expect(listGaIds({ roles: ["admin"] }, GAS)).toEqual([]);
    expect(listGaIds({ roles: ["pastor"] }, GAS)).toEqual([]);
    expect(listGaIds({ roles: ["clerk"], church: "Newark" }, GAS)).toEqual([]);
    expect(listGaIds({ roles: ["ga_leader"], gaIds: ["GA2", "GONE"] }, GAS)).toEqual(["GA2"]);
    expect(listGaIds({ roles: ["ga_leader", "clerk"], church: "Kearny", gaIds: ["GA1"] }, GAS)).toEqual(["GA1"]);
  });
  it("numbers: admin and pastor see every GA", () => {
    expect(summaryGaIds({ roles: ["admin"] }, GAS)).toEqual(["GA1", "GA2", "GA3"]);
    expect(summaryGaIds({ roles: ["pastor"] }, GAS)).toEqual(["GA1", "GA2", "GA3"]);
  });
  it("numbers: clerk sees the GAs of their churches; \"*\" is every church", () => {
    expect(summaryGaIds({ roles: ["clerk"], church: "Newark" }, GAS)).toEqual(["GA1", "GA2"]);
    expect(summaryGaIds({ roles: ["clerk"], church: "Newark", churches: ["Kearny"] }, GAS)).toEqual(["GA1", "GA2", "GA3"]);
    expect(summaryGaIds({ roles: ["clerk"], church: "Newark", churches: ["*"] }, GAS)).toEqual(["GA1", "GA2", "GA3"]);
  });
  it("numbers: GA leader sees their GAs; none means nothing; roles add up", () => {
    expect(summaryGaIds({ roles: ["ga_leader"], gaIds: ["GA2"] }, GAS)).toEqual(["GA2"]);
    expect(summaryGaIds({ roles: ["ga_leader"], gaIds: [] }, GAS)).toEqual([]);
    expect(summaryGaIds({ roles: ["ga_leader", "clerk"], church: "Kearny", gaIds: ["GA1"] }, GAS)).toEqual(["GA1", "GA3"]);
    expect(summaryGaIds({ roles: ["treasurer"] }, GAS)).toEqual([]);
  });
  it("profileOf reads the app user (single sysRole too)", () => {
    expect(profileOf({ sysRole: "clerk", church: "Newark" })).toEqual({ roles: ["clerk"], church: "Newark", churches: [], gaIds: [] });
  });
  it("only admin and pastor manage the panel", () => {
    expect(canManagePanel(["pastor"])).toBe(true);
    expect(canManagePanel(["clerk", "ga_leader"])).toBe(false);
  });
  it("cityOf keeps the city", () => expect(cityOf("Newark, NJ - EUA")).toBe("Newark"));
});

describe("cleanGuestInput", () => {
  it("normalizes and maps the fields", () => {
    expect(cleanGuestInput({ gaId: "GA1", name: "  Rita  ", phone: " 973 555 0101 ", email: " RITA@X.COM ", invitedByMemberId: "M001", notes: "" }))
      .toEqual({ fields: { ga_id: "GA1", name: "Rita", phone: "973 555 0101", email: "rita@x.com", invited_by_member_id: "M001", notes: null } });
  });
  it("rejects empty name, bad GA, bad member, bad phone, bad e-mail", () => {
    expect(cleanGuestInput({ gaId: "GA1", name: " " }).error).toBe("invalid_name");
    expect(cleanGuestInput({ gaId: "", name: "A" }).error).toBe("invalid_ga");
    expect(cleanGuestInput({ gaId: "GA1", name: "A", phone: "9735550101", invitedByMemberId: "x;drop" }).error).toBe("invalid_member");
    expect(cleanGuestInput({ gaId: "GA1", name: "A", phone: "abc" }).error).toBe("invalid_phone");
    expect(cleanGuestInput({ gaId: "GA1", name: "A", phone: "9735550101", email: "nope" }).error).toBe("invalid_email");
  });
  it("phone is required", () => {
    expect(cleanGuestInput({ gaId: "GA1", name: "A" }).error).toBe("invalid_phone");
    expect(cleanGuestInput({ gaId: "GA1", name: "A", phone: "  " }).error).toBe("invalid_phone");
  });
  it("empty e-mail / inviter become null", () => {
    expect(cleanGuestInput({ gaId: "GA1", name: "A", phone: "9735550101" }).fields).toMatchObject({ email: null, invited_by_member_id: null });
  });
});

describe("totals", () => {
  const guests = [
    { gaId: "GA1", attendedAt: "2026-11-28T23:00:00Z" },
    { gaId: "GA1", attendedAt: null },
    { gaId: "GA2", attendedAt: null },
  ];
  it("per GA, including a GA with no guests (0%)", () => {
    expect(totalsByGa(guests, GAS)).toEqual([
      { gaId: "GA1", name: "GA Central", invited: 2, attended: 1, pct: 50 },
      { gaId: "GA3", name: "GA Kearny", invited: 0, attended: 0, pct: 0 },
      { gaId: "GA2", name: "GA Norte", invited: 1, attended: 0, pct: 0 },
    ]);
  });
  it("overall", () => expect(sumTotals(guests)).toEqual({ invited: 3, attended: 1, pct: 33 }));
});

describe("guestsCsv", () => {
  it("escapes commas, quotes and keeps accents", () => {
    const csv = guestsCsv(
      [{ name: 'João "Jota", Jr', phone: "1", email: "", invitedByMemberId: "M1", gaId: "GA1", attendedAt: "x" }],
      { gas: GAS, members: [{ id: "M1", name: "Ana" }], labels: { name: "Nome", phone: "Telefone", email: "E-mail", invitedBy: "Convidado por", ga: "GA", attended: "Presente", yes: "Sim", no: "Não" } },
    );
    expect(csv.split("\n")).toEqual([
      '"Nome","Telefone","E-mail","Convidado por","GA","Presente"',
      '"João ""Jota"", Jr","1","","Ana","GA Central","Sim"',
    ]);
  });
});

describe("toGuest", () => {
  it("maps snake_case to camelCase", () => {
    expect(toGuest({ id: "u1", year: 2026, church: "N", ga_id: "GA1", name: "R", phone: null, email: null, invited_by_member_id: null, attended_at: null, notes: null, created_at: "c", updated_at: "u" }))
      .toEqual({ id: "u1", year: 2026, church: "N", gaId: "GA1", name: "R", phone: "", email: "", invitedByMemberId: null, attendedAt: null, notes: "", createdAt: "c", updatedAt: "u" });
  });
});

describe("dayOf / buildStats", () => {
  it("buckets by New York date, not UTC", () => {
    expect(dayOf("2026-11-10T03:30:00Z")).toBe("2026-11-09");
  });
  const rows = [
    { year: 2026, church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: "t", created_at: "2026-11-05T15:00:00Z" },
    { year: 2026, church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: null, created_at: "2026-11-07T15:00:00Z" },
    { year: 2026, church: "Kearny, NJ - EUA", ga_id: "GA3", invited_by_member_id: null, attended_at: null, created_at: "2026-11-07T16:00:00Z" },
    { year: 2025, church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: "t", created_at: "2025-11-07T16:00:00Z" },
  ];
  const s = buildStats(rows, {
    year: 2026, gas: GAS, members: [{ id: "M1", name: "Ana" }],
    goals: [{ church: "", goal: 10 }, { church: "Newark, NJ - EUA", goal: 6 }], today: "2026-11-07", days: 3,
  });
  it("totals, goal and previous year", () => {
    expect(s).toMatchObject({ year: 2026, invited: 3, attended: 1, pct: 33, goal: 10, prev: { invited: 1, attended: 1 } });
  });
  it("per church with its goal, sorted by invited", () => {
    expect(s.byChurch).toEqual([
      { church: "Newark, NJ - EUA", invited: 2, attended: 1, goal: 6 },
      { church: "Kearny, NJ - EUA", invited: 1, attended: 0, goal: null },
    ]);
  });
  it("rankings skip guests with no inviter", () => {
    expect(s.topGas).toEqual([{ gaId: "GA1", name: "GA Central", invited: 2, attended: 1 }, { gaId: "GA3", name: "GA Kearny", invited: 1, attended: 0 }]);
    expect(s.topInviters).toEqual([{ memberId: "M1", name: "Ana", invited: 2, attended: 1 }]);
  });
  it("per day ends today and includes empty days", () => {
    expect(s.perDay).toEqual([{ date: "2026-11-05", count: 1 }, { date: "2026-11-06", count: 0 }, { date: "2026-11-07", count: 2 }]);
  });
  it("no goal → null", () => {
    expect(buildStats([], { year: 2026, gas: GAS, members: [], goals: [], today: "2026-11-07", days: 1 }).goal).toBeNull();
  });
});

describe("buildSummary", () => {
  const rows = [
    { church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: "t" },
    { church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: null },
    { church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: null, attended_at: null },
    { church: "Kearny, NJ - EUA", ga_id: "GA3", invited_by_member_id: "M2", attended_at: "t" },
  ];
  const s = buildSummary(rows, { gas: GAS, members: [{ id: "M1", name: "Ana" }, { id: "M2", name: "Bia" }], goals: [{ church: "", goal: 10 }, { church: "Kearny, NJ - EUA", goal: 4 }] });
  it("totals and overall goal", () => expect(s).toMatchObject({ invited: 4, attended: 2, pct: 50, goal: 10 }));
  it("church → GA → member, sorted by invited, GAs with no guests at zero", () => {
    expect(s.churches.map((c) => [c.church, c.invited, c.goal])).toEqual([["Newark, NJ - EUA", 3, null], ["Kearny, NJ - EUA", 1, 4]]);
    const newark = s.churches[0];
    expect(newark.gas.map((g) => [g.gaId, g.invited, g.attended])).toEqual([["GA1", 3, 1], ["GA2", 0, 0]]);
    expect(newark.gas[0].members).toEqual([{ memberId: "M1", name: "Ana", invited: 2, attended: 1, pct: 50 }]);
  });
  it("no rows: zeros, no goal", () => {
    const e = buildSummary([], { gas: [GAS[0]], members: [], goals: [] });
    expect(e).toMatchObject({ invited: 0, attended: 0, pct: 0, goal: null });
    expect(e.churches[0].gas[0]).toMatchObject({ gaId: "GA1", invited: 0, members: [] });
  });
});
