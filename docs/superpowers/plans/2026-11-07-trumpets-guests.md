# Trombetas e Festas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yearly guest lists for *Trombetas e Festas* per GA (name, phone, e-mail, who invited, attended), church totals, and a pastor/admin-only big-screen panel with goals, year-over-year, rankings and guests per day.

**Architecture:** Two server-only tables (`trumpet_guests`, `trumpet_goals`) reached only through one Vercel function, `api/trumpet-guests.js`, which resolves the caller's scope (admin/pastor: all; clerk: their churches; GA leader: their GAs). All rules and aggregation live in one pure module, `src/lib/trumpets.js`, imported by both the server and the browser. The UI is a new tab in `/assistance` plus a full-screen panel route inside `AuthGate`.

**Tech Stack:** React 18 + React Router v6, Vite, Vitest + Testing Library, Vercel serverless (Node, `fetch` to PostgREST with the service role), Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-11-07-trumpets-guests-design.md`

## Global Constraints

- All code, comments and docs in English; every UI string has PT and EN (`src/i18n/strings.js`).
- Tables are server-only: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon, authenticated`, `GRANT ALL ... TO service_role` (same as `member_contacts`, migration 039).
- Never send phone or e-mail to `audit_log` (browser-readable). Never put a guest's name there either: `entity_label` is the GA name.
- Files imported by `api/` must not use the `@/` alias (Vercel does not resolve it): `src/lib/trumpets.js` imports only with relative paths.
- Attendance is once per edition: `attended_at` null = did not come.
- Phone / e-mail validated with `normalizePhone` / `isValidPhone` / `normalizeEmail` / `isValidEmail` from `src/lib/contact.js`.
- Panel and goal editing: admin and pastor only. Panel polls every 20 s.
- Every write verified with `Prefer: return=representation`; no row back → `404 not_found`.
- Follow `FRONTEND_SYSTEM_GUIDELINES.md` (tokens like `var(--card)`, `var(--muted)`, `.btn` classes); stacked cards under 640 px.
- Every change goes into `CHANGELOG.md` `[Unreleased]` in the same branch.

## Review Focus

1. **A GA leader whose `ga_ids` is empty** — must see an empty state, and the API must return `[]` (not every guest via an empty `in.()` filter).
2. **More than 1000 guests in a year** — PostgREST caps responses at 1000 rows; lists and stats must page (`fetchAll`).
3. **Admin using "Ver como" a GA leader** — the server sees the admin, so the tab must still filter rows by the *viewed* user's scope (`gaIdsInScope(profileOf(user), gas)`).
4. **A guest moved to a GA outside the caller's scope** — `update` with a new `gaId` the caller doesn't own → 403, and `church` is rewritten from the new GA.
5. **Guests created around midnight** — the per-day chart buckets by `America/New_York` date, not UTC.

Each line has a test in the owning task (Tasks 2, 3, 6).

---

## Task 0: Branch

- [ ] **Step 1: Create a branch from `main`** (the current branch `fix/role-sync` has unrelated uncommitted work — don't build on it)

Use the `superpowers:using-git-worktrees` skill to create a worktree on a new branch `feat/trumpets` from `main`, then `npm install` inside it and run `npm run test` once to confirm a green baseline.

---

## Task 1: Migration 052

**Files:**
- Create: `migrations/052_trumpet_guests.sql`
- Modify: `CLAUDE.md` (Supabase Tables list)

**Interfaces:**
- Produces: tables `trumpet_guests` (columns below) and `trumpet_goals (year int, church text, goal int, PK (year, church))`.

- [ ] **Step 1: Check the live id types**

Run in the Supabase SQL editor (or the Supabase MCP `execute_sql`, read-only):

```sql
SELECT table_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'id' AND table_name IN ('assistance_groups', 'members');
```

Expected: `text` for both (the app uses ids like `GA001`, `M001`). If either is `uuid`, use `uuid` for the matching FK column below.

- [ ] **Step 2: Write the migration**

```sql
-- Trombetas e Festas: the guests each GA invites every year, and the goals shown on the panel.
-- Guests are non-members' personal data, so both tables are server-only (like member_contacts, 039):
-- the browser reaches them only through api/trumpet-guests.js, which checks the caller's scope.

CREATE TABLE IF NOT EXISTS trumpet_guests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year                 int  NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  church               text NOT NULL,
  ga_id                text NOT NULL REFERENCES assistance_groups(id) ON DELETE RESTRICT,
  name                 text NOT NULL CHECK (length(trim(name)) > 0),
  phone                text,
  email                text,
  invited_by_member_id text REFERENCES members(id) ON DELETE SET NULL,
  attended_at          timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           text
);
CREATE INDEX IF NOT EXISTS trumpet_guests_year_ga ON trumpet_guests (year, ga_id);

-- church = '' is the overall goal of the year.
CREATE TABLE IF NOT EXISTS trumpet_goals (
  year       int  NOT NULL,
  church     text NOT NULL DEFAULT '',
  goal       int  NOT NULL CHECK (goal > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (year, church)
);

ALTER TABLE trumpet_guests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trumpet_guests FROM anon, authenticated;
GRANT ALL PRIVILEGES ON trumpet_guests TO service_role;

ALTER TABLE trumpet_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trumpet_goals FROM anon, authenticated;
GRANT ALL PRIVILEGES ON trumpet_goals TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Update CLAUDE.md**

In the "Supabase Tables" paragraph, replace the closing `` `member_contacts`, `contact_change_requests` (the last two are server-only on purpose: RLS on, no browser grants; see migrations 039 and 051) `` with:

```
`member_contacts`, `contact_change_requests`, `trumpet_guests`, `trumpet_goals` (the last four are server-only on purpose: RLS on, no browser grants; see migrations 039, 051 and 052)
```

- [ ] **Step 4: Commit** (the migration is applied in Task 9, after review)

```bash
git add migrations/052_trumpet_guests.sql CLAUDE.md
git commit -m "Trombetas e Festas: server-only guest and goal tables (migration 052)"
```

---

## Task 2: Pure rules — `src/lib/trumpets.js`

**Files:**
- Create: `src/lib/trumpets.js`
- Test: `src/test/trumpets.test.js`

**Interfaces:**
- Produces (all exported):
  - `cityOf(church: string): string`
  - `profileOf(user): { roles: string[], church: string, churches: string[], gaIds: string[] }` (camelCase app user)
  - `gaIdsInScope(profile, gas: {id, church}[]): string[]`
  - `canManagePanel(roles: string[]): boolean` (admin or pastor)
  - `toGuest(row): { id, year, church, gaId, name, phone, email, invitedByMemberId, attendedAt, notes, createdAt, updatedAt }`
  - `cleanGuestInput(body): { error: "invalid_name"|"invalid_ga"|"invalid_member"|"invalid_phone"|"invalid_email" } | { fields: { ga_id, name, phone, email, invited_by_member_id, notes } }`
  - `totalsByGa(guests, gas): { gaId, name, invited, attended, pct }[]` (only GAs passed in; sorted by name)
  - `sumTotals(guests): { invited, attended, pct }`
  - `guestsCsv(guests, { gas, members, labels }): string`
  - `dayOf(ts: string): "YYYY-MM-DD"` (America/New_York)
  - `buildStats(rows, { year, gas, members, goals, today, days = 60 }): Stats` where `rows` are raw snake_case rows of `year` and `year - 1`, and

```
Stats = { year, invited, attended, pct, goal, prev: { invited, attended },
          byChurch: [{ church, invited, attended, goal }],   // sorted by invited desc
          topGas: [{ gaId, name, invited, attended }],        // top 10
          topInviters: [{ memberId, name, invited, attended }],// top 10, null inviter excluded
          perDay: [{ date, count }] }                         // `days` entries ending on `today`
```

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import {
  cityOf, profileOf, gaIdsInScope, canManagePanel, toGuest, cleanGuestInput,
  totalsByGa, sumTotals, guestsCsv, dayOf, buildStats,
} from "@/lib/trumpets";

const GAS = [
  { id: "GA1", name: "GA Central", church: "Newark, NJ - EUA" },
  { id: "GA2", name: "GA Norte", church: "Newark, NJ - EUA" },
  { id: "GA3", name: "GA Kearny", church: "Kearny, NJ - EUA" },
];

describe("scope", () => {
  it("admin and pastor see every GA", () => {
    expect(gaIdsInScope({ roles: ["admin"] }, GAS)).toEqual(["GA1", "GA2", "GA3"]);
    expect(gaIdsInScope({ roles: ["pastor"] }, GAS)).toEqual(["GA1", "GA2", "GA3"]);
  });
  it("clerk sees the GAs of their church and extra churches, matched by city", () => {
    expect(gaIdsInScope({ roles: ["clerk"], church: "Newark" }, GAS)).toEqual(["GA1", "GA2"]);
    expect(gaIdsInScope({ roles: ["clerk"], church: "Newark", churches: ["Kearny, NJ"] }, GAS)).toEqual(["GA1", "GA2", "GA3"]);
  });
  it("GA leader sees only their GAs; no GAs means nothing", () => {
    expect(gaIdsInScope({ roles: ["ga_leader"], gaIds: ["GA2"] }, GAS)).toEqual(["GA2"]);
    expect(gaIdsInScope({ roles: ["ga_leader"], gaIds: [] }, GAS)).toEqual([]);
  });
  it("several roles get the union", () => {
    expect(gaIdsInScope({ roles: ["ga_leader", "clerk"], church: "Kearny", gaIds: ["GA1"] }, GAS)).toEqual(["GA1", "GA3"]);
  });
  it("other roles see nothing", () => {
    expect(gaIdsInScope({ roles: ["treasurer"] }, GAS)).toEqual([]);
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
    expect(cleanGuestInput({ gaId: "GA1", name: "A", invitedByMemberId: "x;drop" }).error).toBe("invalid_member");
    expect(cleanGuestInput({ gaId: "GA1", name: "A", phone: "abc" }).error).toBe("invalid_phone");
    expect(cleanGuestInput({ gaId: "GA1", name: "A", email: "nope" }).error).toBe("invalid_email");
  });
  it("empty phone / e-mail / inviter become null", () => {
    expect(cleanGuestInput({ gaId: "GA1", name: "A" }).fields).toMatchObject({ phone: null, email: null, invited_by_member_id: null });
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/trumpets.test.js`
Expected: FAIL — `Failed to resolve import "@/lib/trumpets"`.

- [ ] **Step 3: Implement**

```js
// Trombetas e Festas: who sees which guests, input rules and every number on the tab and the panel.
// Pure (no Supabase) and imported by api/trumpet-guests.js too — relative imports only, no "@/".
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "./contact.js";

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const TOP = 10;
const pctOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const byPt = (a, b) => String(a).localeCompare(String(b), "pt");

export const cityOf = (church) => String(church || "").split(",")[0].trim();

export function profileOf(user) {
  return {
    roles: user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean),
    church: user?.church || "",
    churches: user?.churches || [],
    gaIds: user?.gaIds || [],
  };
}

export const canManagePanel = (roles = []) => roles.includes("admin") || roles.includes("pastor");

// GA ids the profile may see and edit. admin / pastor: all; clerk: GAs of their church(es) by city;
// ga_leader: their own GAs. Union across roles, in the order of `gas`.
export function gaIdsInScope(profile, gas = []) {
  const roles = profile?.roles || [];
  if (canManagePanel(roles)) return gas.map((g) => g.id);
  const ids = new Set();
  if (roles.includes("clerk")) {
    const cities = [profile.church, ...(profile.churches || [])].map(cityOf).filter(Boolean).map((c) => c.toLowerCase());
    for (const g of gas) if (cities.includes(cityOf(g.church).toLowerCase())) ids.add(g.id);
  }
  if (roles.includes("ga_leader")) for (const id of profile.gaIds || []) ids.add(id);
  return gas.map((g) => g.id).filter((id) => ids.has(id));
}

export function toGuest(r) {
  return {
    id: r.id,
    year: r.year,
    church: r.church,
    gaId: r.ga_id,
    name: r.name,
    phone: r.phone || "",
    email: r.email || "",
    invitedByMemberId: r.invited_by_member_id || null,
    attendedAt: r.attended_at || null,
    notes: r.notes || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function cleanGuestInput(body = {}) {
  const name = String(body.name || "").trim();
  if (!name || name.length > 120) return { error: "invalid_name" };
  const gaId = String(body.gaId || "");
  if (!ID.test(gaId)) return { error: "invalid_ga" };
  const inviter = body.invitedByMemberId ? String(body.invitedByMemberId) : "";
  if (inviter && !ID.test(inviter)) return { error: "invalid_member" };
  const phone = normalizePhone(body.phone);
  if (phone && !isValidPhone(phone)) return { error: "invalid_phone" };
  const email = normalizeEmail(body.email);
  if (email && !isValidEmail(email)) return { error: "invalid_email" };
  const notes = String(body.notes || "").trim().slice(0, 500);
  return { fields: { ga_id: gaId, name, phone: phone || null, email: email || null, invited_by_member_id: inviter || null, notes: notes || null } };
}

export function sumTotals(guests = []) {
  const invited = guests.length;
  const attended = guests.filter((g) => g.attendedAt).length;
  return { invited, attended, pct: pctOf(attended, invited) };
}

export function totalsByGa(guests = [], gas = []) {
  return gas
    .map((g) => ({ gaId: g.id, name: g.name, ...sumTotals(guests.filter((x) => x.gaId === g.id)) }))
    .sort((a, b) => byPt(a.name, b.name));
}

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function guestsCsv(guests = [], { gas = [], members = [], labels }) {
  const gaName = Object.fromEntries(gas.map((g) => [g.id, g.name]));
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const head = [labels.name, labels.phone, labels.email, labels.invitedBy, labels.ga, labels.attended];
  const lines = guests.map((g) => [g.name, g.phone, g.email, memberName[g.invitedByMemberId] || "", gaName[g.gaId] || g.gaId, g.attendedAt ? labels.yes : labels.no]);
  return [head, ...lines].map((cols) => cols.map(q).join(",")).join("\n");
}

export const dayOf = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function lastDays(today, days) {
  const end = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10));
}

function rank(rows, keyOf, labelOf) {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const e = m.get(k) || { invited: 0, attended: 0 };
    e.invited += 1;
    if (r.attended_at) e.attended += 1;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([k, e]) => ({ k, label: labelOf(k), ...e }))
    .sort((a, b) => b.invited - a.invited || byPt(a.label, b.label));
}

export function buildStats(rows = [], { year, gas = [], members = [], goals = [], today, days = 60 }) {
  const cur = rows.filter((r) => r.year === year);
  const prev = rows.filter((r) => r.year === year - 1);
  const attended = cur.filter((r) => r.attended_at).length;
  const goalOf = (church) => goals.find((g) => g.church === church)?.goal ?? null;
  const gaName = Object.fromEntries(gas.map((g) => [g.id, g.name]));
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const counts = {};
  for (const r of cur) {
    const d = dayOf(r.created_at);
    counts[d] = (counts[d] || 0) + 1;
  }
  return {
    year,
    invited: cur.length,
    attended,
    pct: pctOf(attended, cur.length),
    goal: goalOf(""),
    prev: { invited: prev.length, attended: prev.filter((r) => r.attended_at).length },
    byChurch: rank(cur, (r) => r.church, (k) => k).map((e) => ({ church: e.k, invited: e.invited, attended: e.attended, goal: goalOf(e.k) })),
    topGas: rank(cur, (r) => r.ga_id, (k) => gaName[k] || k).slice(0, TOP).map((e) => ({ gaId: e.k, name: e.label, invited: e.invited, attended: e.attended })),
    topInviters: rank(cur, (r) => r.invited_by_member_id, (k) => memberName[k] || k).slice(0, TOP).map((e) => ({ memberId: e.k, name: e.label, invited: e.invited, attended: e.attended })),
    perDay: lastDays(today, days).map((date) => ({ date, count: counts[date] || 0 })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/trumpets.test.js`
Expected: PASS (all). If `isValidPhone("973 555 0101")` is false, read `src/lib/contact.js:28` and pick a phone the rule accepts in both tests — don't change the rule.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trumpets.js src/test/trumpets.test.js
git commit -m "Trombetas e Festas: scope, input, totals, CSV and panel stats (pure)"
```

---

## Task 3: API — list / create / update / attend / delete

**Files:**
- Create: `api/trumpet-guests.js`
- Test: `src/test/trumpetGuestsApi.test.js`

**Interfaces:**
- Consumes: `gaIdsInScope`, `canManagePanel`, `toGuest`, `cleanGuestInput`, `buildStats` (Task 2); `restClient`, `currentUser` (`api/_lib/auth.js`).
- Produces: `POST /api/trumpet-guests` with actions:
  - `list { year }` → `{ guests: Guest[] }`
  - `create { year, gaId, name, phone?, email?, invitedByMemberId?, notes? }` → `{ guest }`
  - `update { id, gaId, name, phone?, email?, invitedByMemberId?, notes? }` → `{ guest }`
  - `attend { id, attended }` → `{ guest }`
  - `delete { id }` → `{ ok: true }`
  - errors: `401 not_signed_in`, `400 invalid_year|invalid_id|invalid_*`, `403 forbidden`, `404 not_found`, `500 unexpected_error`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../api/trumpet-guests.js";
import { signToken } from "../../api/_lib/auth.js";

const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", SESSION_SECRET: "secret" };
const USERS = {
  1: { id: 1, name: "Admin", sys_role: "admin", sys_roles: ["admin"], church: "", churches: [], ga_ids: [] },
  2: { id: 2, name: "Líder", sys_role: "ga_leader", sys_roles: ["ga_leader"], church: "Newark", churches: [], ga_ids: ["GA1"] },
  3: { id: 3, name: "Sem GA", sys_role: "ga_leader", sys_roles: ["ga_leader"], church: "Newark", churches: [], ga_ids: [] },
  4: { id: 4, name: "Sec", sys_role: "clerk", sys_roles: ["clerk"], church: "Newark", churches: [], ga_ids: [] },
};
const GAS = [
  { id: "GA1", name: "GA Central", church: "Newark, NJ - EUA" },
  { id: "GA2", name: "GA Norte", church: "Newark, NJ - EUA" },
  { id: "GA3", name: "GA Kearny", church: "Kearny, NJ - EUA" },
];
const G1 = { id: "11111111-1111-1111-1111-111111111111", year: 2026, church: "Newark, NJ - EUA", ga_id: "GA1", name: "Rita", phone: "9735550101", email: null, invited_by_member_id: null, attended_at: null, notes: null, created_at: "c", updated_at: "u" };
const G2 = { ...G1, id: "22222222-2222-2222-2222-222222222222", ga_id: "GA2", name: "Beto" };

function fakeDb({ guests = [G1, G2] } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = decodeURIComponent(url.replace("https://db.test/rest/v1/", ""));
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    let out = [];
    const id = Number((path.match(/^app_users\?id=eq\.(\d+)/) || [])[1]);
    if (path.startsWith("app_users?")) out = USERS[id] ? [USERS[id]] : [];
    else if (path.startsWith("assistance_groups?")) out = GAS;
    else if (path.startsWith("trumpet_guests?") && method === "GET") {
      const one = path.match(/id=eq\.([0-9a-f-]+)/);
      const inGa = path.match(/ga_id=in\.\(([^)]*)\)/);
      out = guests.filter((g) => (!one || g.id === one[1]) && (!inGa || inGa[1].split(",").includes(g.ga_id)));
    } else if (path.startsWith("trumpet_guests") && method === "POST") out = [{ ...G1, ...body, id: "33333333-3333-3333-3333-333333333333" }];
    else if (path.startsWith("trumpet_guests?") && method === "PATCH") {
      const one = path.match(/id=eq\.([0-9a-f-]+)/)[1];
      const g = guests.find((x) => x.id === one);
      out = g ? [{ ...g, ...body }] : [];
    } else if (path.startsWith("trumpet_guests?") && method === "DELETE") {
      const one = path.match(/id=eq\.([0-9a-f-]+)/)[1];
      out = guests.filter((x) => x.id === one).map((x) => ({ id: x.id }));
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  }));
  return calls;
}

function call(body, as = 1) {
  const t = signToken({ sub: String(as) }, "secret", 3600);
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: "POST", body, headers: { authorization: `Bearer ${t}` } }, res).then(() => res);
}
const auditOf = (calls) => calls.filter((c) => c.path === "audit_log").map((c) => c.body);

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/trumpet-guests", () => {
  it("rejects callers with no token", async () => {
    fakeDb();
    const res = { statusCode: 0, status(c) { this.statusCode = c; return this; }, json() { return this; } };
    await handler({ method: "POST", body: { action: "list", year: 2026 }, headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it("lists only the GA leader's GAs", async () => {
    fakeDb();
    const res = await call({ action: "list", year: 2026 }, 2);
    expect(res.statusCode).toBe(200);
    expect(res.body.guests.map((g) => g.name)).toEqual(["Rita"]);
    expect(res.body.guests[0]).toMatchObject({ gaId: "GA1", phone: "9735550101" });
  });

  it("a GA leader with no GAs gets an empty list without querying guests", async () => {
    const calls = fakeDb();
    const res = await call({ action: "list", year: 2026 }, 3);
    expect(res.body.guests).toEqual([]);
    expect(calls.some((c) => c.path.startsWith("trumpet_guests"))).toBe(false);
  });

  it("clerk sees the GAs of their church", async () => {
    fakeDb();
    const res = await call({ action: "list", year: 2026 }, 4);
    expect(res.body.guests.map((g) => g.name).sort()).toEqual(["Beto", "Rita"]);
  });

  it("rejects a bad year", async () => {
    fakeDb();
    expect((await call({ action: "list", year: "x" })).statusCode).toBe(400);
  });

  it("creates in scope, copies the church from the GA and audits without contact values or the guest's name", async () => {
    const calls = fakeDb();
    const res = await call({ action: "create", year: 2026, gaId: "GA1", name: "Nova", phone: "9735550199", email: "n@x.com" }, 2);
    expect(res.statusCode).toBe(200);
    const insert = calls.find((c) => c.path.startsWith("trumpet_guests") && c.method === "POST");
    expect(insert.body).toMatchObject({ year: 2026, ga_id: "GA1", church: "Newark, NJ - EUA", name: "Nova", created_by: "Líder" });
    const audit = JSON.stringify(auditOf(calls));
    expect(audit).toContain("trumpet_guest_created");
    expect(audit).not.toContain("9735550199");
    expect(audit).not.toContain("n@x.com");
    expect(audit).not.toContain("Nova");
  });

  it("forbids creating in a GA outside scope", async () => {
    fakeDb();
    expect((await call({ action: "create", year: 2026, gaId: "GA2", name: "X" }, 2)).statusCode).toBe(403);
  });

  it("returns 400 on an invalid phone", async () => {
    fakeDb();
    const res = await call({ action: "create", year: 2026, gaId: "GA1", name: "X", phone: "abc" }, 2);
    expect(res).toMatchObject({ statusCode: 400, body: { error: "invalid_phone" } });
  });

  it("forbids moving a guest to a GA outside scope, and rewrites church when moving inside", async () => {
    let calls = fakeDb();
    expect((await call({ action: "update", id: G1.id, gaId: "GA3", name: "Rita" }, 2)).statusCode).toBe(403);
    calls = fakeDb();
    await call({ action: "update", id: G1.id, gaId: "GA3", name: "Rita" }, 1);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch.body).toMatchObject({ ga_id: "GA3", church: "Kearny, NJ - EUA" });
  });

  it("forbids touching a guest of another GA", async () => {
    fakeDb();
    expect((await call({ action: "attend", id: G2.id, attended: true }, 2)).statusCode).toBe(403);
  });

  it("marks and clears attendance", async () => {
    const calls = fakeDb();
    const res = await call({ action: "attend", id: G1.id, attended: true }, 2);
    expect(res.body.guest.attendedAt).toBeTruthy();
    await call({ action: "attend", id: G1.id, attended: false }, 2);
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body.attended_at === null)).toEqual([false, true]);
  });

  it("404 when the guest does not exist", async () => {
    fakeDb({ guests: [] });
    expect((await call({ action: "delete", id: G1.id })).statusCode).toBe(404);
  });

  it("deletes in scope", async () => {
    fakeDb();
    expect((await call({ action: "delete", id: G1.id }, 2)).body).toEqual({ ok: true });
  });

  it("pages past PostgREST's 1000-row cap", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...G1, id: `${String(i).padStart(8, "0")}-1111-1111-1111-111111111111`, name: `G${i}` }));
    const calls = fakeDb({ guests: many });
    // the fake ignores limit/offset, so make it honour them for this test
    const base = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      const r = await base(url, opts);
      const m = decodeURIComponent(url).match(/limit=(\d+)&offset=(\d+)/);
      if (!m) return r;
      const all = JSON.parse(await r.text());
      return { ok: true, status: 200, text: async () => JSON.stringify(all.slice(Number(m[2]), Number(m[2]) + Number(m[1]))) };
    }));
    const res = await call({ action: "list", year: 2026 }, 1);
    expect(res.body.guests).toHaveLength(1001);
    expect(calls.filter((c) => c.path.startsWith("trumpet_guests?")).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/trumpetGuestsApi.test.js`
Expected: FAIL — cannot resolve `../../api/trumpet-guests.js`.

- [ ] **Step 3: Implement**

```js
// Vercel serverless function: Trombetas e Festas guests and goals (migration 052, server-only tables).
// Scope: admin / pastor all GAs; clerk the GAs of their church(es); GA leader their own GAs
// (gaIdsInScope in src/lib/trumpets.js). The audit log never gets phone, e-mail or the guest's name.
//
//   POST { action: "list",    year }                         → { guests }
//   POST { action: "create",  year, gaId, name, phone?, email?, invitedByMemberId?, notes? } → { guest }
//   POST { action: "update",  id, gaId, name, ... }          → { guest }
//   POST { action: "attend",  id, attended }                 → { guest }
//   POST { action: "delete",  id }                           → { ok: true }
//   POST { action: "goals",   year }                         → { goals: [{ church, goal }] }
//   POST { action: "setGoal", year, church, goal }           → { ok: true }   admin / pastor; goal 0 removes it
//   POST { action: "stats",   year }                         → { stats }      admin / pastor

import { restClient, currentUser } from "./_lib/auth.js";
import { gaIdsInScope, canManagePanel, toGuest, cleanGuestInput, buildStats } from "../src/lib/trumpets.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id,year,church,ga_id,name,phone,email,invited_by_member_id,attended_at,notes,created_at,updated_at";
const PAGE = 1000;
const yearOf = (v) => {
  const y = Number(v);
  return Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : null;
};
const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// PostgREST caps a response at 1000 rows: read page by page.
async function fetchAll(rest, path) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const r = await rest(`${path}&limit=${PAGE}&offset=${offset}`);
    if (!r.ok) throw new Error(`read_failed:${r.status}`);
    out.push(...(r.data || []));
    if ((r.data || []).length < PAGE) return out;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
    res.status(500).json({ error: "server_not_configured" });
    return;
  }
  const rest = restClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const fail = (code, error) => res.status(code).json({ error });

  try {
    const caller = await currentUser(req, rest, SESSION_SECRET);
    if (!caller) return fail(401, "not_signed_in");
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const me = await rest(`app_users?id=eq.${Number(caller.id)}&select=church,churches,ga_ids`);
    const extra = (me.ok && me.data?.[0]) || {};
    const roles = caller.sys_roles?.length ? caller.sys_roles : [caller.sys_role].filter(Boolean);
    const profile = { roles, church: extra.church || "", churches: extra.churches || [], gaIds: extra.ga_ids || [] };
    const g = await rest("assistance_groups?select=id,name,church");
    if (!g.ok) throw new Error(`gas_read_failed:${g.status}`);
    const gas = g.data || [];
    const gaById = Object.fromEntries(gas.map((x) => [x.id, x]));
    const allowed = new Set(gaIdsInScope(profile, gas));
    const by = caller.name || String(caller.id);

    const audit = (action, guestId, gaId, details = {}) =>
      rest("audit_log", {
        method: "POST",
        body: {
          actor_name: caller.name, actor_id: caller.id, actor_role: caller.sys_role, action,
          entity_type: "trumpet_guest", entity_id: guestId, entity_label: gaById[gaId]?.name || gaId,
          details,
        },
      });

    const loadOwned = async (id) => {
      if (!UUID.test(String(id || ""))) return { error: [400, "invalid_id"] };
      const r = await rest(`trumpet_guests?id=eq.${id}&select=${COLS}`);
      const row = r.ok && r.data?.[0];
      if (!row) return { error: [404, "not_found"] };
      if (!allowed.has(row.ga_id)) return { error: [403, "forbidden"] };
      return { row };
    };

    if (body.action === "list") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      if (!allowed.size) return res.status(200).json({ guests: [] });
      const rows = await fetchAll(rest, `trumpet_guests?year=eq.${year}&ga_id=in.(${[...allowed].join(",")})&select=${COLS}&order=name`);
      return res.status(200).json({ guests: rows.map(toGuest) });
    }

    if (body.action === "create") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const { error, fields } = cleanGuestInput(body);
      if (error) return fail(400, error);
      if (!allowed.has(fields.ga_id)) return fail(403, "forbidden");
      const r = await rest(`trumpet_guests?select=${COLS}`, {
        method: "POST",
        body: { ...fields, year, church: gaById[fields.ga_id].church || "", created_by: by, updated_by: by },
        prefer: "return=representation",
      });
      if (!r.ok || !r.data?.[0]) throw new Error(`guest_create_failed:${r.status}`);
      await audit("trumpet_guest_created", r.data[0].id, fields.ga_id, { year });
      return res.status(200).json({ guest: toGuest(r.data[0]) });
    }

    if (body.action === "update") {
      const own = await loadOwned(body.id);
      if (own.error) return fail(...own.error);
      const { error, fields } = cleanGuestInput(body);
      if (error) return fail(400, error);
      if (!allowed.has(fields.ga_id)) return fail(403, "forbidden");
      const r = await rest(`trumpet_guests?id=eq.${own.row.id}&select=${COLS}`, {
        method: "PATCH",
        body: { ...fields, church: gaById[fields.ga_id].church || "", updated_at: new Date().toISOString(), updated_by: by },
        prefer: "return=representation",
      });
      if (!r.ok || !r.data?.[0]) return fail(404, "not_found");
      const changed = ["ga_id", "name", "phone", "email", "invited_by_member_id", "notes"].filter((k) => (own.row[k] || null) !== (fields[k] || null));
      await audit("trumpet_guest_updated", own.row.id, fields.ga_id, { fields: changed });
      return res.status(200).json({ guest: toGuest(r.data[0]) });
    }

    if (body.action === "attend") {
      const own = await loadOwned(body.id);
      if (own.error) return fail(...own.error);
      const now = new Date().toISOString();
      const r = await rest(`trumpet_guests?id=eq.${own.row.id}&select=${COLS}`, {
        method: "PATCH",
        body: { attended_at: body.attended ? now : null, updated_at: now, updated_by: by },
        prefer: "return=representation",
      });
      if (!r.ok || !r.data?.[0]) return fail(404, "not_found");
      await audit(body.attended ? "trumpet_guest_attended" : "trumpet_guest_unattended", own.row.id, own.row.ga_id);
      return res.status(200).json({ guest: toGuest(r.data[0]) });
    }

    if (body.action === "delete") {
      const own = await loadOwned(body.id);
      if (own.error) return fail(...own.error);
      const r = await rest(`trumpet_guests?id=eq.${own.row.id}&select=id`, { method: "DELETE", prefer: "return=representation" });
      if (!r.ok || !r.data?.length) return fail(404, "not_found");
      await audit("trumpet_guest_deleted", own.row.id, own.row.ga_id, { year: own.row.year });
      return res.status(200).json({ ok: true });
    }

    // goals / setGoal / stats: Task 4.

    return fail(400, "unknown_action");
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
```

(`buildStats` is imported now and used in Task 4; ESLint may flag it as unused until then — that's fine, Task 4 is the next commit.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/trumpetGuestsApi.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/trumpet-guests.js src/test/trumpetGuestsApi.test.js
git commit -m "Trombetas e Festas: guest API scoped by GA / church, audited without contact data"
```

---

## Task 4: API — goals and panel stats

**Files:**
- Modify: `api/trumpet-guests.js` (replace the `// goals / setGoal / stats: Task 4.` line)
- Test: `src/test/trumpetGuestsApi.test.js` (append)

**Interfaces:**
- Consumes: `canManagePanel`, `buildStats` (Task 2); `fetchAll`, `allowed`, `gas`, `audit` (Task 3, inside the handler).
- Produces: actions `goals { year }` → `{ goals: [{ church, goal }] }` (any caller with a non-empty scope); `setGoal { year, church, goal }` → `{ ok: true }` (admin / pastor); `stats { year }` → `{ stats: Stats }` (admin / pastor).

- [ ] **Step 1: Write the failing tests** — extend `fakeDb` and append a `describe`

In `fakeDb`, add these branches before the final `return` (keep the others):

```js
    else if (path.startsWith("trumpet_goals?") && method === "GET") out = [{ church: "", goal: 50 }];
    else if (path.startsWith("trumpet_goals") && method === "POST") out = [body];
    else if (path.startsWith("trumpet_goals?") && method === "DELETE") out = [{ year: 2026 }];
    else if (path.startsWith("members?")) out = [{ id: "M1", name: "Ana" }];
```

and change the `trumpet_guests` GET branch so a `year=in.(` query returns stats rows:

```js
    else if (path.startsWith("trumpet_guests?") && method === "GET" && path.includes("year=in.(")) {
      out = [
        { year: 2026, church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: null, created_at: "2026-11-07T15:00:00Z" },
        { year: 2025, church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: "t", created_at: "2025-11-07T15:00:00Z" },
      ];
    }
```

(place it **before** the generic `trumpet_guests` GET branch).

```js
describe("/api/trumpet-guests goals and stats", () => {
  it("stats is for admin / pastor only", async () => {
    fakeDb();
    expect((await call({ action: "stats", year: 2026 }, 4)).statusCode).toBe(403);
    expect((await call({ action: "stats", year: 2026 }, 2)).statusCode).toBe(403);
  });

  it("stats aggregates this year and last year, with names but no contacts", async () => {
    const calls = fakeDb();
    const res = await call({ action: "stats", year: 2026 }, 1);
    expect(res.statusCode).toBe(200);
    expect(res.body.stats).toMatchObject({ invited: 1, goal: 50, prev: { invited: 1, attended: 1 }, topInviters: [{ name: "Ana", invited: 1 }] });
    const read = calls.find((c) => c.path.includes("year=in.("));
    expect(read.path).not.toMatch(/phone|email|name/);
  });

  it("goals are readable in scope; setGoal is admin / pastor only", async () => {
    fakeDb();
    expect((await call({ action: "goals", year: 2026 }, 2)).body).toEqual({ goals: [{ church: "", goal: 50 }] });
    expect((await call({ action: "goals", year: 2026 }, 3)).body).toEqual({ goals: [] });
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: 80 }, 4)).statusCode).toBe(403);
  });

  it("setGoal upserts, and 0 removes the goal", async () => {
    const calls = fakeDb();
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: 80 }, 1)).body).toEqual({ ok: true });
    expect(calls.find((c) => c.path.startsWith("trumpet_goals") && c.method === "POST").body).toMatchObject({ year: 2026, church: "", goal: 80 });
    await call({ action: "setGoal", year: 2026, church: "", goal: 0 }, 1);
    expect(calls.some((c) => c.path.startsWith("trumpet_goals?") && c.method === "DELETE")).toBe(true);
  });

  it("setGoal rejects a negative or fractional goal", async () => {
    fakeDb();
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: -1 }, 1)).statusCode).toBe(400);
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: 1.5 }, 1)).statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/trumpetGuestsApi.test.js`
Expected: the new `describe` FAILS with `400 unknown_action`; the Task 3 tests still pass.

- [ ] **Step 3: Implement** — replace the `// goals / setGoal / stats: Task 4.` line with:

```js
    if (body.action === "goals") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      if (!allowed.size) return res.status(200).json({ goals: [] });
      const r = await rest(`trumpet_goals?year=eq.${year}&select=church,goal&order=church`);
      if (!r.ok) throw new Error(`goals_read_failed:${r.status}`);
      return res.status(200).json({ goals: r.data || [] });
    }

    if (body.action === "setGoal") {
      if (!canManagePanel(roles)) return fail(403, "forbidden");
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const church = String(body.church || "").slice(0, 120);
      const goal = Number(body.goal);
      if (!Number.isInteger(goal) || goal < 0 || goal > 100000) return fail(400, "invalid_goal");
      if (goal === 0) {
        const d = await rest(`trumpet_goals?year=eq.${year}&church=eq.${encodeURIComponent(church)}`, { method: "DELETE" });
        if (!d.ok) throw new Error(`goal_delete_failed:${d.status}`);
      } else {
        const w = await rest("trumpet_goals?on_conflict=year,church&select=year,church,goal", {
          method: "POST",
          body: { year, church, goal, updated_at: new Date().toISOString(), updated_by: by },
          prefer: "resolution=merge-duplicates,return=representation",
        });
        if (!w.ok || !w.data?.[0]) throw new Error(`goal_save_failed:${w.status}`);
      }
      await rest("audit_log", {
        method: "POST",
        body: { actor_name: caller.name, actor_id: caller.id, actor_role: caller.sys_role, action: "trumpet_goal_set", entity_type: "trumpet_goal", entity_id: String(year), entity_label: church || "*", details: { goal } },
      });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "stats") {
      if (!canManagePanel(roles)) return fail(403, "forbidden");
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const rows = await fetchAll(rest, `trumpet_guests?year=in.(${year},${year - 1})&select=year,church,ga_id,invited_by_member_id,attended_at,created_at&order=created_at`);
      const inviterIds = [...new Set(rows.filter((r) => r.year === year).map((r) => r.invited_by_member_id).filter(Boolean))];
      const members = inviterIds.length ? await fetchAll(rest, `members?id=in.(${inviterIds.join(",")})&select=id,name&order=id`) : [];
      const gr = await rest(`trumpet_goals?year=eq.${year}&select=church,goal`);
      if (!gr.ok) throw new Error(`goals_read_failed:${gr.status}`);
      const stats = buildStats(rows, { year, gas, members, goals: gr.data || [], today: todayNY() });
      return res.status(200).json({ stats });
    }
```

Note: member ids come from the database (FK to `members`), so they are safe in the `in.()` filter.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/trumpetGuestsApi.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add api/trumpet-guests.js src/test/trumpetGuestsApi.test.js
git commit -m "Trombetas e Festas: goals and pastor/admin panel stats"
```

---

## Task 5: Browser client with a dev fallback

**Files:**
- Create: `src/lib/trumpetsApi.js`
- Create: `src/dev/trumpetsDevStore.js`
- Test: `src/test/trumpetsApi.test.js`

**Interfaces:**
- Consumes: `authHeaders` (`src/lib/session.js`); `toGuest`, `buildStats`, `cleanGuestInput` (Task 2); `INIT_GAS`, `INIT_MEMBERS` (`src/dev/seeds.js`).
- Produces (all async; throw `Error(code)` with the API error code on failure):
  - `listGuests(year): Promise<Guest[]>`
  - `createGuest(year, input): Promise<Guest>`
  - `updateGuest(id, input): Promise<Guest>`
  - `setAttended(id, attended): Promise<Guest>`
  - `deleteGuest(id): Promise<void>`
  - `listGoals(year): Promise<{church, goal}[]>`
  - `saveGoal(year, church, goal): Promise<void>`
  - `fetchStats(year): Promise<Stats>`
  - `devTrumpets(body): object` (in `trumpetsDevStore.js`) — same request/response shapes as the API, in memory, no scope checks.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, vi, afterEach } from "vitest";
import { listGuests, createGuest, setAttended, saveGoal } from "@/lib/trumpetsApi";

afterEach(() => vi.unstubAllGlobals());

const reply = (status, body) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe("trumpetsApi", () => {
  it("posts the action and returns the guests", async () => {
    const f = reply(200, { guests: [{ id: "g1" }] });
    vi.stubGlobal("fetch", f);
    expect(await listGuests(2026)).toEqual([{ id: "g1" }]);
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe("/api/trumpet-guests");
    expect(JSON.parse(opts.body)).toEqual({ action: "list", year: 2026 });
  });

  it("throws the API error code", async () => {
    vi.stubGlobal("fetch", reply(403, { error: "forbidden" }));
    await expect(createGuest(2026, { gaId: "GA1", name: "X" })).rejects.toThrow("forbidden");
  });

  it("sends attend and setGoal bodies", async () => {
    const f = reply(200, { guest: { id: "g1", attendedAt: "t" }, ok: true });
    vi.stubGlobal("fetch", f);
    await setAttended("g1", true);
    await saveGoal(2026, "", 80);
    expect(f.mock.calls.map(([, o]) => JSON.parse(o.body))).toEqual([
      { action: "attend", id: "g1", attended: true },
      { action: "setGoal", year: 2026, church: "", goal: 80 },
    ]);
  });
});
```

Also add a dev-store test file `src/test/trumpetsDevStore.test.js`:

```js
import { describe, it, expect } from "vitest";
import { devTrumpets } from "@/dev/trumpetsDevStore";
import { INIT_GAS } from "@/dev/seeds";

describe("dev store", () => {
  it("creates, lists, marks attendance and builds stats in memory", () => {
    const ga = INIT_GAS[0].id;
    const { guest } = devTrumpets({ action: "create", year: 2026, gaId: ga, name: "Teste" });
    expect(devTrumpets({ action: "list", year: 2026 }).guests.map((g) => g.name)).toContain("Teste");
    expect(devTrumpets({ action: "attend", id: guest.id, attended: true }).guest.attendedAt).toBeTruthy();
    expect(devTrumpets({ action: "stats", year: 2026 }).stats.attended).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/test/trumpetsApi.test.js src/test/trumpetsDevStore.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/dev/trumpetsDevStore.js`**

```js
// `npm run dev` has no serverless functions: an in-memory stand-in for api/trumpet-guests.js,
// seeded from the dev directory. No scope checks (the tab already filters by scope). Dev only.
import { INIT_GAS, INIT_MEMBERS } from "@/dev/seeds";
import { toGuest, cleanGuestInput, buildStats } from "@/lib/trumpets";

const rows = [];
const goals = [];
let seq = 0;
const now = () => new Date().toISOString();
const err = (error) => { throw new Error(error); };
const find = (id) => rows.find((r) => r.id === id) || err("not_found");
const churchOf = (gaId) => INIT_GAS.find((g) => g.id === gaId)?.church || "";

export function devTrumpets(body) {
  const year = Number(body.year);
  switch (body.action) {
    case "list":
      return { guests: rows.filter((r) => r.year === year).map(toGuest) };
    case "create": {
      const { error, fields } = cleanGuestInput(body);
      if (error) err(error);
      const row = { ...fields, id: `dev-${++seq}`, year, church: churchOf(fields.ga_id), attended_at: null, created_at: now(), updated_at: now() };
      rows.push(row);
      return { guest: toGuest(row) };
    }
    case "update": {
      const row = find(body.id);
      const { error, fields } = cleanGuestInput(body);
      if (error) err(error);
      Object.assign(row, fields, { church: churchOf(fields.ga_id), updated_at: now() });
      return { guest: toGuest(row) };
    }
    case "attend": {
      const row = find(body.id);
      row.attended_at = body.attended ? now() : null;
      return { guest: toGuest(row) };
    }
    case "delete":
      rows.splice(rows.indexOf(find(body.id)), 1);
      return { ok: true };
    case "goals":
      return { goals: goals.filter((g) => g.year === year).map(({ church, goal }) => ({ church, goal })) };
    case "setGoal": {
      const i = goals.findIndex((g) => g.year === year && g.church === (body.church || ""));
      if (i >= 0) goals.splice(i, 1);
      if (Number(body.goal) > 0) goals.push({ year, church: body.church || "", goal: Number(body.goal) });
      return { ok: true };
    }
    case "stats":
      return {
        stats: buildStats(rows.filter((r) => r.year === year || r.year === year - 1), {
          year, gas: INIT_GAS, members: INIT_MEMBERS, goals: goals.filter((g) => g.year === year),
          today: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
        }),
      };
    default:
      return err("unknown_action");
  }
}
```

- [ ] **Step 4: Implement `src/lib/trumpetsApi.js`**

```js
// Trombetas e Festas from the browser: everything goes through /api/trumpet-guests (the tables are
// server-only, migration 052). `npm run dev` has no serverless functions, so there a 404 falls back to
// an in-memory store; production builds drop that branch.
import { authHeaders } from "@/lib/session";

async function call(body) {
  const res = await fetch("/api/trumpet-guests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (import.meta.env.DEV && res.status === 404) {
    const { devTrumpets } = await import("@/dev/trumpetsDevStore");
    return devTrumpets(body);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http_${res.status}`);
  return data;
}

export const listGuests = async (year) => (await call({ action: "list", year })).guests || [];
export const createGuest = async (year, input) => (await call({ action: "create", year, ...input })).guest;
export const updateGuest = async (id, input) => (await call({ action: "update", id, ...input })).guest;
export const setAttended = async (id, attended) => (await call({ action: "attend", id, attended: !!attended })).guest;
export const deleteGuest = async (id) => { await call({ action: "delete", id }); };
export const listGoals = async (year) => (await call({ action: "goals", year })).goals || [];
export const saveGoal = async (year, church, goal) => { await call({ action: "setGoal", year, church, goal }); };
export const fetchStats = async (year) => (await call({ action: "stats", year })).stats;
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/test/trumpetsApi.test.js src/test/trumpetsDevStore.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/trumpetsApi.js src/dev/trumpetsDevStore.js src/test/trumpetsApi.test.js src/test/trumpetsDevStore.test.js
git commit -m "Trombetas e Festas: browser client with an in-memory dev fallback"
```

---

## Task 6: Access, strings and the Trombetas tab

**Files:**
- Modify: `src/lib/sectionAccess.js:8` (`assistance` list)
- Modify: `src/sections/assistance/AssistanceSection.jsx` (tabs filtered by role)
- Modify: `src/i18n/strings.js` (new `tf` object in `pt` and `en`; `assistNoAccess` text)
- Create: `src/sections/assistance/TrumpetsTab.jsx`
- Create: `src/sections/assistance/TrumpetGuestModal.jsx`
- Modify tests: `src/test/assistanceAccess.test.jsx`, `src/test/hubAssistance.test.jsx`
- Test: `src/test/trumpetsTab.test.jsx`

**Interfaces:**
- Consumes: `trumpetsApi` (Task 5); `gaIdsInScope`, `profileOf`, `canManagePanel`, `totalsByGa`, `sumTotals`, `guestsCsv`, `cityOf` (Task 2); context `{ user, gas, members, notify }` from `useAppDataContext()`.
- Produces: `<TrumpetsTab lang />`; `STRINGS[lang].tf` keys listed below; panel URL `/assistance/trombetas/painel/<year>` (route in Task 7).

- [ ] **Step 1: Update the access tests (failing first)**

In `src/test/assistanceAccess.test.jsx`, add a mock and replace the role tests:

```js
vi.mock("@/sections/assistance/TrumpetsTab", () => ({ default: () => <div>TRUMPETS TAB</div> }));
```

```js
describe("Assistência: Frequência for staff, Trombetas also for GA leaders", () => {
  it.each([["admin"], ["clerk"], ["pastor"]])("%s sees Frequência first and the Trombetas tab", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
    expect(screen.getByText("Trombetas e Festas")).toBeTruthy();
  });
  it("a GA leader lands on Trombetas and never sees Frequência", () => {
    renderAs({ name: "X", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    expect(screen.getByText("TRUMPETS TAB")).toBeTruthy();
    expect(screen.queryByText("Frequência")).toBeNull();
    expect(screen.queryByText("CENSUS TAB")).toBeNull();
  });
  it.each([["team_leader"], ["treasurer"]])("%s gets a polite no-access message", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.queryByText("CENSUS TAB")).toBeNull();
    expect(screen.getByText("Esta seção é para pastores, secretários, líderes de GA e administradores.")).toBeTruthy();
  });
  it("uses the single sysRole too", () => {
    renderAs({ name: "X", sysRole: "pastor" });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
  });
});
```

In `src/test/hubAssistance.test.jsx`, replace the "is not shown to GA leaders yet" test:

```js
  it("is shown to GA leaders (Trombetas e Festas)", () => {
    renderHome({ name: "GA", sysRoles: ["ga_leader"] });
    expect(screen.getByText("Assistência")).toBeTruthy();
  });
```

Run: `npx vitest run src/test/assistanceAccess.test.jsx src/test/hubAssistance.test.jsx`
Expected: FAIL.

- [ ] **Step 2: Access changes**

`src/lib/sectionAccess.js`:

```js
  // GA leaders only reach the Trombetas e Festas tab (AssistanceSection filters the tabs)
  assistance: ["admin", "clerk", "pastor", "ga_leader"],
```

`src/sections/assistance/AssistanceSection.jsx` — replace `TABS`, `ALLOWED` and the `useState` line, and render the new tab:

```js
import { useState } from "react";
import { Users, Megaphone } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import CensusTab from "./CensusTab";
import TrumpetsTab from "./TrumpetsTab";

// Assistência (Care): the service census (staff) and Trombetas e Festas (staff and GA leaders).
const TABS = [
  { id: "census", icon: Users, color: "#b45309", pt: "Frequência", en: "Attendance", roles: ["admin", "clerk", "pastor"] },
  { id: "trumpets", icon: Megaphone, color: "#7c3aed", pt: "Trombetas e Festas", en: "Trumpets & Feasts", roles: ["admin", "clerk", "pastor", "ga_leader"] },
];
```

Inside the component:

```js
  const { user } = useAppDataContext() || {};
  const roles = user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean);
  const visible = TABS.filter((t) => t.roles.some((r) => roles.includes(r)));
  const [picked, setTab] = useState(null);
  const tab = visible.some((t) => t.id === picked) ? picked : visible[0]?.id;

  if (!visible.length) {
    // ... existing no-access block unchanged
  }
```

Map over `visible` instead of `TABS` in the tab bar, and render:

```js
        {tab === "census" && <CensusTab lang={lang} />}
        {tab === "trumpets" && <TrumpetsTab lang={lang} />}
```

Delete the old `ALLOWED` constant.

`src/i18n/strings.js` — change `assistNoAccess`:
- pt: `"Esta seção é para pastores, secretários, líderes de GA e administradores."`
- en: `"This section is for pastors, church clerks, GA leaders and admins."`

Add to `pt` (next to `assistNoAccess`):

```js
    tf: {
      title: "Trombetas e Festas",
      year: "Ano",
      ga: "GA",
      allGas: "Todos os GAs",
      church: "Igreja",
      search: "Buscar convidado…",
      add: "Convidado",
      edit: "Editar convidado",
      name: "Nome",
      phone: "Telefone",
      email: "E-mail",
      invitedBy: "Convidado por",
      noInviter: "— ninguém / não sei —",
      notes: "Observações",
      attended: "Presente",
      yes: "Sim",
      no: "Não",
      invited: "Convidados",
      present: "Presentes",
      rate: "Comparecimento",
      total: "Total da igreja",
      save: "Salvar",
      cancel: "Cancelar",
      remove: "Excluir",
      confirmRemove: "Excluir {name} da lista?",
      exportCsv: "Exportar CSV",
      openPanel: "Abrir painel",
      goals: "Metas",
      goalOverall: "Meta geral",
      goalHint: "0 remove a meta",
      empty: "Nenhum convidado ainda.",
      noGa: "Nenhum GA está ligado à sua conta. Peça à secretaria para associar seu GA.",
      loading: "Carregando…",
      errors: {
        forbidden: "Você não tem acesso a este GA.",
        invalid_name: "Informe o nome.",
        invalid_phone: "Telefone inválido.",
        invalid_email: "E-mail inválido.",
        not_found: "Convidado não encontrado (talvez já excluído).",
        generic: "Não foi possível salvar. Tente de novo.",
      },
      panel: {
        title: "Trombetas e Festas {year}",
        goal: "Meta: {goal}",
        noGoal: "Sem meta definida",
        vsLast: "vs {year}",
        byChurch: "Por igreja",
        topGas: "GAs que mais convidaram",
        topInviters: "Quem mais convidou",
        perDay: "Convidados por dia",
        fullscreen: "Tela cheia",
        noAccess: "O painel é só para pastores e administradores.",
        error: "Não foi possível carregar os números.",
      },
    },
```

Add to `en`:

```js
    tf: {
      title: "Trumpets & Feasts",
      year: "Year",
      ga: "GA",
      allGas: "All GAs",
      church: "Church",
      search: "Search guest…",
      add: "Guest",
      edit: "Edit guest",
      name: "Name",
      phone: "Phone",
      email: "E-mail",
      invitedBy: "Invited by",
      noInviter: "— nobody / not sure —",
      notes: "Notes",
      attended: "Attended",
      yes: "Yes",
      no: "No",
      invited: "Invited",
      present: "Attended",
      rate: "Attendance",
      total: "Church total",
      save: "Save",
      cancel: "Cancel",
      remove: "Delete",
      confirmRemove: "Remove {name} from the list?",
      exportCsv: "Export CSV",
      openPanel: "Open panel",
      goals: "Goals",
      goalOverall: "Overall goal",
      goalHint: "0 removes the goal",
      empty: "No guests yet.",
      noGa: "No GA is linked to your account. Ask the church office to assign your GA.",
      loading: "Loading…",
      errors: {
        forbidden: "You don't have access to this GA.",
        invalid_name: "Enter the name.",
        invalid_phone: "Invalid phone.",
        invalid_email: "Invalid e-mail.",
        not_found: "Guest not found (maybe already deleted).",
        generic: "Could not save. Please try again.",
      },
      panel: {
        title: "Trumpets & Feasts {year}",
        goal: "Goal: {goal}",
        noGoal: "No goal set",
        vsLast: "vs {year}",
        byChurch: "By church",
        topGas: "GAs that invited the most",
        topInviters: "Who invited the most",
        perDay: "Guests per day",
        fullscreen: "Full screen",
        noAccess: "The panel is for pastors and admins only.",
        error: "Could not load the numbers.",
      },
    },
```

Run: `npx vitest run src/test/assistanceAccess.test.jsx src/test/hubAssistance.test.jsx`
Expected: PASS (TrumpetsTab is mocked in the access test; create an empty `export default function TrumpetsTab() { return null; }` first if the import fails, then replace it in Step 4).

- [ ] **Step 3: Write the failing tab test**

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppDataContext } from "@/context/AppDataContext";

const api = vi.hoisted(() => ({
  listGuests: vi.fn(),
  createGuest: vi.fn(),
  updateGuest: vi.fn(),
  setAttended: vi.fn(),
  deleteGuest: vi.fn(),
  listGoals: vi.fn(async () => []),
  saveGoal: vi.fn(async () => {}),
}));
vi.mock("@/lib/trumpetsApi", () => api);

import TrumpetsTab from "@/sections/assistance/TrumpetsTab";

const gas = [
  { id: "GA1", name: "GA Central", church: "Newark, NJ - EUA" },
  { id: "GA2", name: "GA Norte", church: "Newark, NJ - EUA" },
];
const members = [{ id: "M1", name: "Ana", church: "Newark, NJ - EUA" }];
const rita = { id: "g1", year: 2026, church: "Newark, NJ - EUA", gaId: "GA1", name: "Rita", phone: "9735550101", email: "", invitedByMemberId: "M1", attendedAt: null, notes: "" };
const beto = { ...rita, id: "g2", gaId: "GA2", name: "Beto", invitedByMemberId: null };

const renderAs = (user) => render(
  <MemoryRouter>
    <AppDataContext.Provider value={{ user, gas, members, notify: vi.fn() }}><TrumpetsTab lang="pt" /></AppDataContext.Provider>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  api.listGuests.mockResolvedValue([rita, beto]);
  api.listGoals.mockResolvedValue([]);
});

describe("Trombetas e Festas tab", () => {
  it("clerk sees totals per GA and the church total", async () => {
    renderAs({ name: "Sec", sysRoles: ["clerk"], church: "Newark" });
    await screen.findByText("Rita");
    const central = screen.getByTestId("tf-total-GA1");
    expect(within(central).getByText("1")).toBeTruthy(); // invited
    expect(screen.getByTestId("tf-total-church").textContent).toMatch(/2/);
  });

  it("a GA leader only sees rows of their GA, even when the server sends more (Ver como)", async () => {
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    await screen.findByText("Rita");
    expect(screen.queryByText("Beto")).toBeNull();
    expect(screen.queryByText("Abrir painel")).toBeNull();
  });

  it("a GA leader with no GA gets the empty state", async () => {
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: [] });
    expect(await screen.findByText(/Nenhum GA está ligado/)).toBeTruthy();
    expect(api.listGuests).not.toHaveBeenCalled();
  });

  it("toggles attendance optimistically and calls the API", async () => {
    api.setAttended.mockResolvedValue({ ...rita, attendedAt: "t" });
    renderAs({ name: "Sec", sysRoles: ["clerk"], church: "Newark" });
    await screen.findByText("Rita");
    fireEvent.click(screen.getByLabelText("Presente: Rita"));
    expect(screen.getByLabelText("Presente: Rita").checked).toBe(true);
    await waitFor(() => expect(api.setAttended).toHaveBeenCalledWith("g1", true));
  });

  it("adds a guest after the server confirms and keeps the modal on error", async () => {
    api.createGuest.mockRejectedValueOnce(new Error("invalid_phone")).mockResolvedValueOnce({ ...rita, id: "g3", name: "Nova" });
    renderAs({ name: "GA", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    await screen.findByText("Rita");
    fireEvent.click(screen.getByRole("button", { name: /Convidado/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova" } });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Telefone inválido.")).toBeTruthy();
    expect(screen.getByLabelText("Nome").value).toBe("Nova");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Nova")).toBeTruthy();
    expect(api.createGuest).toHaveBeenLastCalledWith(expect.any(Number), expect.objectContaining({ gaId: "GA1", name: "Nova" }));
  });

  it("pastor gets the panel link and the goals form", async () => {
    renderAs({ name: "Pr", sysRoles: ["pastor"] });
    await screen.findByText("Rita");
    expect(screen.getByRole("link", { name: /Abrir painel/ }).getAttribute("href")).toMatch(/^\/assistance\/trombetas\/painel\/\d{4}$/);
    fireEvent.change(screen.getByLabelText("Meta geral"), { target: { value: "80" } });
    fireEvent.blur(screen.getByLabelText("Meta geral"));
    await waitFor(() => expect(api.saveGoal).toHaveBeenCalledWith(expect.any(Number), "", 80));
  });
});
```

Run: `npx vitest run src/test/trumpetsTab.test.jsx`
Expected: FAIL.

- [ ] **Step 4: Implement `src/sections/assistance/TrumpetGuestModal.jsx`**

```jsx
import { useState } from "react";

// Add / edit one guest. Create waits for the server (the id is needed before anything else), so this
// stays open with the typed values when saving fails.
export default function TrumpetGuestModal({ tt, guest, gaOptions, members, onSave, onDelete, onClose }) {
  const [f, setF] = useState({
    gaId: guest?.gaId || gaOptions[0]?.id || "",
    name: guest?.name || "",
    phone: guest?.phone || "",
    email: guest?.email || "",
    invitedByMemberId: guest?.invitedByMemberId || "",
    notes: guest?.notes || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const church = gaOptions.find((g) => g.id === f.gaId)?.church;
  const inviters = members.filter((m) => !church || m.church === church).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError(tt.errors.invalid_name);
    setBusy(true);
    setError("");
    try {
      await onSave(f);
    } catch (err) {
      setError(tt.errors[err.message] || tt.errors.generic);
      setBusy(false);
    }
  };

  const field = (id, label, input) => (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
      {label}
      {input}
    </label>
  );

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" style={{ maxWidth: 440, display: "flex", flexDirection: "column", gap: 12 }} onSubmit={submit}>
        <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: 0 }}>{guest ? tt.edit : tt.add}</h3>
        {gaOptions.length > 1 && field("tf-ga", tt.ga, (
          <select id="tf-ga" value={f.gaId} onChange={set("gaId")}>
            {gaOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        ))}
        {field("tf-name", tt.name, <input id="tf-name" value={f.name} onChange={set("name")} autoFocus maxLength={120} />)}
        {field("tf-phone", tt.phone, <input id="tf-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} />)}
        {field("tf-email", tt.email, <input id="tf-email" type="email" inputMode="email" value={f.email} onChange={set("email")} />)}
        {field("tf-inviter", tt.invitedBy, (
          <select id="tf-inviter" value={f.invitedByMemberId} onChange={set("invitedByMemberId")}>
            <option value="">{tt.noInviter}</option>
            {inviters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ))}
        {field("tf-notes", tt.notes, <textarea id="tf-notes" rows={2} value={f.notes} onChange={set("notes")} maxLength={500} />)}
        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {guest && onDelete && <button type="button" className="btn btn-ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={onDelete}>{tt.remove}</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>{tt.cancel}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{tt.save}</button>
        </div>
      </form>
    </div>
  );
}
```

(The `<label htmlFor>` around the input makes `getByLabelText("Nome")` resolve; check the label text is exactly the string — the label's text content is the label plus nothing else since the input has no text.)

- [ ] **Step 5: Implement `src/sections/assistance/TrumpetsTab.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Download, MonitorPlay } from "lucide-react";
import { STRINGS, fill } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { gaIdsInScope, profileOf, canManagePanel, totalsByGa, sumTotals, guestsCsv } from "@/lib/trumpets";
import { listGuests, createGuest, updateGuest, setAttended, deleteGuest, listGoals, saveGoal } from "@/lib/trumpetsApi";
import TrumpetGuestModal from "./TrumpetGuestModal";

const thisYear = () => new Date().getFullYear();

function downloadCsv(filename, text) {
  const blob = new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Assistência › Trombetas e Festas: the guests each GA invites this year, attendance on the day and the
// totals per GA. GA leaders see their GAs; clerks their church; pastor / admin everything, plus goals and
// the big-screen panel. The server scopes the rows; this filters again for "Ver como".
export default function TrumpetsTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"].tf;
  const { user, gas = [], members = [], notify = () => {} } = useAppDataContext() || {};
  const profile = useMemo(() => profileOf(user), [user]);
  const manager = canManagePanel(profile.roles);
  const myGas = useMemo(() => {
    const ids = new Set(gaIdsInScope(profile, gas));
    return gas.filter((g) => ids.has(g.id)).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [profile, gas]);

  const [year, setYear] = useState(thisYear());
  const [gaFilter, setGaFilter] = useState("");
  const [query, setQuery] = useState("");
  const [guests, setGuests] = useState(null);
  const [goals, setGoals] = useState([]);
  const [modal, setModal] = useState(null); // null | { guest?: Guest }

  useEffect(() => {
    if (!myGas.length) return;
    let off = false;
    setGuests(null);
    listGuests(year)
      .then((list) => !off && setGuests(list))
      .catch((e) => { if (!off) { setGuests([]); notify(tt.errors[e.message] || tt.errors.generic); } });
    listGoals(year).then((g) => !off && setGoals(g)).catch(() => {});
    return () => { off = true; };
  }, [year, myGas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!myGas.length) return <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>{tt.noGa}</div>;

  const inScope = new Set(myGas.map((g) => g.id));
  const all = (guests || []).filter((g) => inScope.has(g.gaId));
  const shownGas = gaFilter ? myGas.filter((g) => g.id === gaFilter) : myGas;
  const q = query.trim().toLowerCase();
  const rows = all.filter((g) => (!gaFilter || g.gaId === gaFilter) && (!q || g.name.toLowerCase().includes(q)));
  const totals = totalsByGa(all, shownGas);
  const church = sumTotals(gaFilter ? all.filter((g) => g.gaId === gaFilter) : all);
  const gaName = Object.fromEntries(gas.map((g) => [g.id, g.name]));
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const goalOverall = goals.find((g) => g.church === "")?.goal ?? "";

  const replace = (g) => setGuests((prev) => (prev || []).map((x) => (x.id === g.id ? g : x)));

  const toggle = (g) => {
    const next = !g.attendedAt;
    replace({ ...g, attendedAt: next ? new Date().toISOString() : null });
    setAttended(g.id, next).then(replace).catch((e) => notify(tt.errors[e.message] || tt.errors.generic));
  };

  const save = async (input) => {
    if (modal?.guest) {
      const updated = { ...modal.guest, ...input };
      replace(updated);
      setModal(null);
      updateGuest(modal.guest.id, input).then(replace).catch((e) => notify(tt.errors[e.message] || tt.errors.generic));
      return;
    }
    const created = await createGuest(year, input); // throws → modal shows the error
    setGuests((prev) => [...(prev || []), created].sort((a, b) => a.name.localeCompare(b.name, "pt")));
    setModal(null);
  };

  const remove = () => {
    const g = modal.guest;
    if (!window.confirm(fill(tt.confirmRemove, { name: g.name }))) return;
    setGuests((prev) => prev.filter((x) => x.id !== g.id));
    setModal(null);
    deleteGuest(g.id).catch((e) => notify(tt.errors[e.message] || tt.errors.generic));
  };

  const commitGoal = (value) => {
    const goal = Math.max(0, Math.floor(Number(value) || 0));
    if (goal === (Number(goalOverall) || 0)) return;
    setGoals((prev) => [...prev.filter((g) => g.church !== ""), ...(goal ? [{ church: "", goal }] : [])]);
    saveGoal(year, "", goal).catch((e) => notify(tt.errors[e.message] || tt.errors.generic));
  };

  const csvLabels = { name: tt.name, phone: tt.phone, email: tt.email, invitedBy: tt.invitedBy, ga: tt.ga, attended: tt.attended, yes: tt.yes, no: tt.no };

  return (
    <div className="tf" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .tf-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .tf-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
        .tf-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;text-align:left;cursor:pointer}
        .tf-card b{font-size:22px;font-family:'Montserrat',sans-serif}
        .tf-list{display:flex;flex-direction:column;gap:8px}
        .tf-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) auto;gap:12px;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 14px}
        .tf-row .tf-name{font-weight:700;background:none;border:none;text-align:left;padding:0;cursor:pointer;color:var(--text);font:inherit;font-weight:700}
        .tf-row .tf-muted{color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tf-toggle{width:28px;height:28px;accent-color:var(--ok)}
        @media (max-width:640px){.tf-row{grid-template-columns:minmax(0,1fr) auto}.tf-row .tf-hide{display:none}}
      `}</style>

      <div className="tf-bar">
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          {tt.year}{" "}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {myGas.length > 1 && (
          <select aria-label={tt.ga} value={gaFilter} onChange={(e) => setGaFilter(e.target.value)}>
            <option value="">{tt.allGas}</option>
            {myGas.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <input type="search" placeholder={tt.search} value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: "1 1 160px" }} />
        <button className="btn btn-primary" onClick={() => setModal({})} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Plus size={16} /> {tt.add}
        </button>
        <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv(`trombetas_${year}.csv`, guestsCsv(rows, { gas, members, labels: csvLabels }))} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Download size={16} /> {tt.exportCsv}
        </button>
        {manager && (
          <Link className="btn btn-ghost" to={`/assistance/trombetas/painel/${year}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <MonitorPlay size={16} /> {tt.openPanel}
          </Link>
        )}
      </div>

      {manager && (
        <div className="tf-bar">
          <label htmlFor="tf-goal" style={{ fontSize: 13, fontWeight: 600 }}>{tt.goalOverall}</label>
          <input id="tf-goal" type="number" min={0} key={`${year}-${goalOverall}`} defaultValue={goalOverall} style={{ width: 100 }}
            onBlur={(e) => commitGoal(e.target.value)} />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{tt.goalHint}</span>
        </div>
      )}

      <div className="tf-cards">
        <div className="tf-card" data-testid="tf-total-church" style={{ cursor: "default", borderColor: "var(--primary)" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{tt.total}</div>
          <b>{church.invited}</b> {tt.invited.toLowerCase()} · <b>{church.attended}</b> {tt.present.toLowerCase()} · {church.pct}%
        </div>
        {totals.map((t) => (
          <button key={t.gaId} type="button" className="tf-card" data-testid={`tf-total-${t.gaId}`} onClick={() => setGaFilter(gaFilter === t.gaId ? "" : t.gaId)}
            style={gaFilter === t.gaId ? { borderColor: "var(--primary)" } : undefined}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{t.name}</div>
            <b>{t.invited}</b> / <span>{t.attended}</span> · {t.pct}%
          </button>
        ))}
      </div>

      {guests === null ? (
        <div style={{ color: "var(--muted)" }}>{tt.loading}</div>
      ) : !rows.length ? (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>{tt.empty}</div>
      ) : (
        <div className="tf-list">
          {rows.map((g) => (
            <div key={g.id} className="tf-row">
              <div style={{ minWidth: 0 }}>
                <button type="button" className="tf-name" onClick={() => setModal({ guest: g })}>{g.name}</button>
                {g.phone && <div className="tf-muted"><a href={`tel:${g.phone}`}>{g.phone}</a></div>}
              </div>
              <div className="tf-muted tf-hide">{memberName[g.invitedByMemberId] || "—"}</div>
              <div className="tf-muted tf-hide">{gaName[g.gaId] || g.gaId}</div>
              <div className="tf-muted tf-hide">{g.email}</div>
              <input type="checkbox" className="tf-toggle" aria-label={`${tt.attended}: ${g.name}`} checked={!!g.attendedAt} onChange={() => toggle(g)} />
            </div>
          ))}
        </div>
      )}

      {modal && (
        <TrumpetGuestModal
          tt={tt}
          guest={modal.guest}
          gaOptions={gaFilter ? myGas.filter((g) => g.id === gaFilter).concat(myGas.filter((g) => g.id !== gaFilter)) : myGas}
          members={members}
          onSave={save}
          onDelete={modal.guest ? remove : null}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
```

Check that `fill` is exported by `src/i18n/strings.js` (it is: `PublicStatsView` imports it).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/test/trumpetsTab.test.jsx src/test/assistanceAccess.test.jsx src/test/hubAssistance.test.jsx`
Expected: PASS. If `within(central).getByText("1")` matches several nodes, keep the assertion on `central.textContent` matching `/^GA Central1 \/ 0 · 0%$/` instead.

- [ ] **Step 7: Check it in the browser**

Run the dev server (`preview_start`), sign in with a seed GA leader and a seed pastor, open `/assistance`: GA leader sees only Trombetas; add a guest, toggle attendance, check the totals. Resize to 375 px: rows stack, no horizontal scroll.

- [ ] **Step 8: Commit**

```bash
git add src/lib/sectionAccess.js src/sections/assistance src/i18n/strings.js src/test/assistanceAccess.test.jsx src/test/hubAssistance.test.jsx src/test/trumpetsTab.test.jsx
git commit -m "Trombetas e Festas: Assistência tab for GA leaders and staff, with totals, CSV and goals"
```

---

## Task 7: The T&F panel (pastor / admin)

**Files:**
- Create: `src/views/TrumpetsPanelView.jsx`
- Modify: `src/App.jsx` (route inside `AuthGate`, sibling of the `HubShell` route)
- Test: `src/test/trumpetsPanel.test.jsx`

**Interfaces:**
- Consumes: `fetchStats(year)` (Task 5) → `Stats` (Task 2); `canManagePanel`, `profileOf`, `cityOf` (Task 2); `STRINGS[lang].tf.panel` (Task 6); context `{ user }`.
- Produces: route `/assistance/trombetas/painel/:year?`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppDataContext } from "@/context/AppDataContext";

const fetchStats = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trumpetsApi", () => ({ fetchStats }));

import TrumpetsPanelView from "@/views/TrumpetsPanelView";

const STATS = {
  year: 2026, invited: 120, attended: 30, pct: 25, goal: 200, prev: { invited: 100, attended: 40 },
  byChurch: [{ church: "Newark, NJ - EUA", invited: 90, attended: 20, goal: 150 }, { church: "Kearny, NJ - EUA", invited: 30, attended: 10, goal: null }],
  topGas: [{ gaId: "GA1", name: "GA Central", invited: 50, attended: 10 }],
  topInviters: [{ memberId: "M1", name: "Ana Souza", invited: 12, attended: 3 }],
  perDay: [{ date: "2026-11-06", count: 4 }, { date: "2026-11-07", count: 9 }],
};

const renderAs = (user, path = "/assistance/trombetas/painel/2026") => render(
  <MemoryRouter initialEntries={[path]}>
    <AppDataContext.Provider value={{ user }}>
      <Routes><Route path="/assistance/trombetas/painel/:year?" element={<TrumpetsPanelView lang="pt" />} /></Routes>
    </AppDataContext.Provider>
  </MemoryRouter>,
);

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); fetchStats.mockReset(); fetchStats.mockResolvedValue(STATS); });
afterEach(() => vi.useRealTimers());

describe("T&F panel", () => {
  it("is closed to clerks and GA leaders without calling the API", () => {
    renderAs({ sysRoles: ["clerk"] });
    expect(screen.getByText("O painel é só para pastores e administradores.")).toBeTruthy();
    expect(fetchStats).not.toHaveBeenCalled();
  });

  it("shows totals, goal, year over year, rankings and per day for a pastor", async () => {
    renderAs({ sysRoles: ["pastor"] });
    expect(await screen.findByText("Trombetas e Festas 2026")).toBeTruthy();
    expect(screen.getByTestId("tf-invited").textContent).toBe("120");
    expect(screen.getByText("Meta: 200")).toBeTruthy();
    expect(screen.getByTestId("tf-yoy-invited").textContent).toBe("+20 (+20%)");
    expect(screen.getByTestId("tf-yoy-attended").textContent).toBe("−10 (−25%)");
    expect(screen.getByText("Newark")).toBeTruthy();
    expect(screen.getByText("GA Central")).toBeTruthy();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.getAllByTestId("tf-day")).toHaveLength(2);
    expect(fetchStats).toHaveBeenCalledWith(2026);
  });

  it("refreshes every 20 seconds", async () => {
    renderAs({ sysRoles: ["admin"] });
    await screen.findByText("Trombetas e Festas 2026");
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(fetchStats).toHaveBeenCalledTimes(2);
  });

  it("uses the current year without a param", async () => {
    renderAs({ sysRoles: ["admin"] }, "/assistance/trombetas/painel");
    await screen.findByTestId("tf-invited");
    expect(fetchStats).toHaveBeenCalledWith(new Date().getFullYear());
  });

  it("keeps the last numbers and says so when a refresh fails", async () => {
    renderAs({ sysRoles: ["admin"] });
    await screen.findByTestId("tf-invited");
    fetchStats.mockRejectedValueOnce(new Error("http_500"));
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(screen.getByTestId("tf-invited").textContent).toBe("120");
  });
});
```

Run: `npx vitest run src/test/trumpetsPanel.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `src/views/TrumpetsPanelView.jsx`**

```jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Maximize } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import { STRINGS, fill } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { canManagePanel, profileOf, cityOf } from "@/lib/trumpets";
import { fetchStats } from "@/lib/trumpetsApi";

const POLL_MS = 20000;

// Same look as /events/painel (ps-* classes copied, tf- prefix), sized for a projector.
const CSS = `
.tp-page{min-height:100vh;box-sizing:border-box;background:linear-gradient(160deg,var(--icm-crimson-deep) 0%,var(--icm-crimson) 50%,var(--icm-navy-deep) 100%);padding:clamp(8px,min(2vw,1.6vh),32px) 16px;display:flex;justify-content:center}
.tp-card{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:1800px;padding:clamp(16px,min(2vw,3vh),40px);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:clamp(10px,min(1.4vw,2.2vh),28px)}
.tp-head{display:flex;align-items:center;gap:clamp(10px,1.4vw,24px);flex-wrap:wrap}
.tp-head h1{font-family:'Lora',Georgia,serif;font-size:clamp(22px,2.6vw,48px);margin:0;line-height:1.1}
.tp-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:clamp(14px,2vw,36px)}
.tp-panel{background:var(--bg);border-radius:16px;padding:clamp(12px,min(1.6vw,2.4vh),28px)}
.tp-panel h2{font-size:clamp(14px,1.3vw,24px);margin:0 0 clamp(8px,1vw,16px);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.tp-big{font-family:'Montserrat',sans-serif;font-weight:800;font-size:clamp(44px,min(7vw,10vh),140px);line-height:1}
.tp-track{height:clamp(20px,min(3vw,5vh),56px);border-radius:999px;background:var(--border);overflow:hidden;margin-top:clamp(10px,1.2vw,22px)}
.tp-fill{height:100%;width:100%;border-radius:999px;background:var(--primary);transform-origin:left center;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.tp-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,1vw,18px);margin-top:clamp(10px,min(1.4vw,2vh),26px)}
.tp-tile{background:var(--card);border-radius:14px;padding:clamp(10px,1.2vw,22px);text-align:center}
.tp-tile b{display:block;font-family:'Montserrat',sans-serif;font-weight:800;font-size:clamp(28px,min(3.6vw,6.4vh),72px);line-height:1.05}
.tp-tile span{font-size:clamp(11px,1vw,18px);color:var(--muted);font-weight:600}
.tp-tile small{display:block;font-weight:700;font-size:clamp(11px,1vw,18px);margin-top:4px}
.tp-rows{display:flex;flex-direction:column;gap:clamp(6px,.7vw,12px)}
.tp-row{display:grid;grid-template-columns:minmax(0,9em) minmax(0,1fr) auto;align-items:center;gap:10px;font-size:clamp(13px,1.2vw,22px)}
.tp-row .tp-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.tp-row .tp-bar{height:clamp(10px,1.1vw,20px);border-radius:999px;background:var(--border);overflow:hidden}
.tp-row .tp-bar i{display:block;height:100%;width:100%;background:var(--primary);transform-origin:left center;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.tp-row .tp-n{font-family:'Montserrat',sans-serif;font-weight:800;text-align:right}
.tp-row .tp-n small{color:var(--muted);font-weight:700;font-size:.8em;margin-left:.3em}
.tp-side{display:flex;flex-direction:column;gap:clamp(14px,2vw,36px)}
.tp-days{display:flex;align-items:flex-end;gap:2px;height:clamp(80px,14vh,200px)}
.tp-days i{flex:1;background:var(--primary);border-radius:3px 3px 0 0;min-height:2px}
.tp-up{color:var(--ok)}.tp-down{color:var(--danger)}
@media (max-width:900px){.tp-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.tp-fill,.tp-row .tp-bar i{transition:none}}
`;

function Rows({ items }) {
  const max = items.reduce((m, it) => Math.max(m, it.count), 0);
  return (
    <div className="tp-rows">
      {items.map((it) => (
        <div className="tp-row" key={it.key}>
          <span className="tp-name" title={it.label}>{it.label}</span>
          <span className="tp-bar"><i style={{ transform: `scaleX(${max ? it.count / max : 0})` }} /></span>
          <span className="tp-n">{it.count}{it.extra && <small>{it.extra}</small>}</span>
        </div>
      ))}
    </div>
  );
}

// "+20 (+20%)" / "−10 (−25%)"; no previous year → "".
export function yoy(now, before) {
  if (!before) return "";
  const d = now - before;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  const pct = Math.round((Math.abs(d) / before) * 100);
  return `${sign}${Math.abs(d)} (${sign}${pct}%)`;
}

// /assistance/trombetas/painel/:year? — Trombetas e Festas numbers for the big screen. Pastor / admin
// only: it shows members' names (who invited the most). Refreshed every 20s from /api/trumpet-guests.
export default function TrumpetsPanelView({ lang = "pt" }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"].tf;
  const tp = tt.panel;
  const { year: param } = useParams();
  const year = /^\d{4}$/.test(param || "") ? Number(param) : new Date().getFullYear();
  const { user } = useAppDataContext() || {};
  const allowed = canManagePanel(profileOf(user).roles);
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    if (!allowed) return;
    let off = false;
    const run = () => fetchStats(year)
      .then((data) => !off && setState({ status: "ready", data }))
      .catch((e) => { console.error("trumpets stats:", e); if (!off) setState((s) => ({ status: s.data ? "stale" : "error", data: s.data })); });
    run();
    const t = setInterval(run, POLL_MS);
    return () => { off = true; clearInterval(t); };
  }, [allowed, year]);

  if (!allowed) return <div style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>{tp.noAccess}</div>;

  const d = state.data;
  const goalPct = d?.goal ? Math.min(1, d.invited / d.goal) : 0;
  const delta = (now, before) => (now >= before ? "tp-up" : "tp-down");
  const maxDay = d ? d.perDay.reduce((m, x) => Math.max(m, x.count), 0) : 0;
  const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="tp-page">
      <style>{CSS}</style>
      <div className="tp-card">
        <div className="tp-head">
          <ICMLogo size={48} />
          <h1>{fill(tp.title, { year })}</h1>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => document.documentElement.requestFullscreen?.()} aria-label={tp.fullscreen}>
            <Maximize size={18} />
          </button>
        </div>

        {state.status === "error" && <div role="alert" style={{ color: "var(--danger)", fontWeight: 700 }}>{tp.error}</div>}

        {d && (
          <div className="tp-grid">
            <div className="tp-side">
              <div className="tp-panel">
                <h2>{tt.invited}</h2>
                <div className="tp-big" data-testid="tf-invited">{d.invited}</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{d.goal ? fill(tp.goal, { goal: d.goal }) : tp.noGoal}</div>
                {d.goal && <div className="tp-track"><div className="tp-fill" style={{ transform: `scaleX(${goalPct})` }} /></div>}
                <div className="tp-tiles">
                  <div className="tp-tile">
                    <b>{d.attended}</b><span>{tt.present}</span>
                  </div>
                  <div className="tp-tile">
                    <b>{d.pct}%</b><span>{tt.rate}</span>
                  </div>
                  <div className="tp-tile">
                    <span>{fill(tp.vsLast, { year: year - 1 })}</span>
                    <small className={delta(d.invited, d.prev.invited)} data-testid="tf-yoy-invited">{yoy(d.invited, d.prev.invited)}</small>
                    <small className={delta(d.attended, d.prev.attended)} data-testid="tf-yoy-attended">{yoy(d.attended, d.prev.attended)}</small>
                  </div>
                </div>
              </div>
              <div className="tp-panel">
                <h2>{tp.perDay}</h2>
                <div className="tp-days">
                  {d.perDay.map((x) => (
                    <i key={x.date} data-testid="tf-day" title={`${fmtDay(x.date)}: ${x.count}`} style={{ height: `${maxDay ? (x.count / maxDay) * 100 : 0}%` }} />
                  ))}
                </div>
              </div>
              <div className="tp-panel">
                <h2>{tp.byChurch}</h2>
                <Rows items={d.byChurch.map((c) => ({ key: c.church, label: cityOf(c.church), count: c.invited, extra: `${c.attended}${c.goal ? ` / ${c.goal}` : ""}` }))} />
              </div>
            </div>
            <div className="tp-side">
              <div className="tp-panel">
                <h2>{tp.topGas}</h2>
                <Rows items={d.topGas.map((g) => ({ key: g.gaId, label: g.name, count: g.invited, extra: String(g.attended) }))} />
              </div>
              <div className="tp-panel">
                <h2>{tp.topInviters}</h2>
                <Rows items={d.topInviters.map((m) => ({ key: m.memberId, label: m.name, count: m.invited, extra: String(m.attended) }))} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Check `ICMLogo` accepts `size` (open `src/components/ICMLogo.jsx`; use whatever prop `PublicStatsView` passes).

- [ ] **Step 3: Add the route in `src/App.jsx`**

Add the import next to `PublicStatsView`:

```js
import TrumpetsPanelView from "@/views/TrumpetsPanelView";
```

Inside the `AuthGate` route, **before** the `HubShell` route element (full screen, no hub bar):

```jsx
                {/* Trombetas e Festas big-screen panel: PIN-gated, pastor / admin only (shows members' names) */}
                <Route path="/assistance/trombetas/painel/:year?" element={<TrumpetsPanelView lang={lang} />} />
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/test/trumpetsPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Check it in the browser**

As the seed pastor: open the panel from the tab with a few dev guests; numbers render, the goal bar moves after setting a goal, full screen works. As a clerk: `/assistance/trombetas/painel` shows the no-access message.

- [ ] **Step 6: Commit**

```bash
git add src/views/TrumpetsPanelView.jsx src/App.jsx src/test/trumpetsPanel.test.jsx
git commit -m "Trombetas e Festas: pastor/admin big-screen panel"
```

---

## Task 8: Docs and full check

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`, `### Database`)
- Modify: `CLAUDE.md` (routes table, Serverless Functions)
- Modify: `docs/PLAN.md`, `docs/pt/PLAN.md`

- [ ] **Step 1: CHANGELOG** — under `## [Unreleased]`:

In `### Added`:

```markdown
- **Trombetas e Festas** (Assistência): each GA lists the guests its members invite (name, phone, e-mail, who invited) and marks who came; totals per GA and per church, CSV export, a yearly goal. GA leaders now reach Assistência, but only this tab and only their GAs.
- **Trombetas e Festas panel** (`/assistance/trombetas/painel/:year?`): big-screen numbers for pastors and admins — invited, attended, goal, vs last year, by church, top GAs, who invited the most, guests per day. Refreshes every 20 s.
```

In `### Database`:

```markdown
- `052_trumpet_guests.sql`: `trumpet_guests` and `trumpet_goals`, server-only (RLS on, no browser grants); reached through `api/trumpet-guests.js`, which scopes by GA / church.
```

- [ ] **Step 2: CLAUDE.md**

Routes table, `/assistance` row:

```
| `/assistance` | AssistanceSection — Assistência/Care: Frequência (service census, staff) and Trombetas e Festas (guests per GA; GA leaders see only this tab); visits and prayer requests to come |
```

Add a row under it:

```
| `/assistance/trombetas/painel/:year?` | TrumpetsPanelView — T&F big-screen numbers; PIN-gated, admin / pastor only, outside HubShell |
```

Serverless Functions list: add `trumpet-guests.js` (Trombetas e Festas guests and goals, scoped by GA / church; stats for admin / pastor).

- [ ] **Step 3: PLAN.md (EN and PT)** — add a "Trombetas e Festas" item marked done under the Assistência phase, one line each, pointing to the spec.

- [ ] **Step 4: Full check**

```bash
npm run test
```

Expected: all pass.

```bash
npm run lint
```

Expected: no errors.

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md CLAUDE.md docs/PLAN.md docs/pt/PLAN.md
git commit -m "Trombetas e Festas: changelog and docs"
```

---

## Task 9: Apply migration 052 (needs the user's go-ahead)

- [ ] **Step 1: Ask the user** before touching the production database.
- [ ] **Step 2: Apply** `migrations/052_trumpet_guests.sql` (Supabase SQL editor or MCP `apply_migration`).
- [ ] **Step 3: Verify the tables are closed to the browser**

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('trumpet_guests', 'trumpet_goals');
-- expect true for both
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name IN ('trumpet_guests', 'trumpet_goals') AND grantee IN ('anon', 'authenticated');
-- expect no rows
```

- [ ] **Step 4: Smoke test on the Vercel preview** of the branch: sign in as a GA leader, add a guest, toggle attendance; as pastor, open the panel.
