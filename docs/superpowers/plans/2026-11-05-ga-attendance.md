# GA Attendance (Chamada do GA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Chamada do GA" tab in Assistência where a GA leader marks which members of their group were at each church service, plus a follow-up view of who has not been coming.

**Architecture:** One new table `ga_attendance` (migration 047): one row per GA + date + service type, with the roster, the present members and the visitors as `text[]`. Pure rules in `src/lib/gaAttendance.js`, database calls in `src/lib/gaAttendanceData.js`, UI in three focused components under `src/sections/assistance/`. Access goes through the existing `SECTION_ROLES` (`src/lib/sectionAccess.js`) and per-tab role lists in `AssistanceSection`.

**Tech Stack:** React 18 + Vite, Supabase JS client (`sb`), Vitest + Testing Library (jsdom), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-11-04-ga-attendance-design.md`

## Global Constraints

- Worktree: `/Users/leo.alves/vscode/projects/mcc-newark-hub-ga-attendance`, branch `feat/ga-attendance`. Never work in the main checkout.
- Code, comments and docs in English; every UI string in `src/i18n/strings.js` in **both** `pt` and `en`.
- Tone: "sem presença há 3 semanas" / "no attendance for 3 weeks", "Para cuidar primeiro" / "Reach out first". Never "faltoso", "absentee", "falta(s)".
- Who: tab `ga` for `admin` and `ga_leader` only; tab `census` stays `admin`, `clerk`, `pastor`. Pastor/clerk never see GA attendance.
- Scope: admin → every GA; anyone else → GAs whose id is in `user.gaIds`.
- Date window: today back to **14** days ago, never the future; admin any past date.
- Service types: `censusTypesFor(date)` — Sunday `["ebd","noite"]`, otherwise `["noite"]`.
- Follow-up: last **8** attendances; "needs care" = absent from each of the last **3** attendances they were on the roster for. History loaded: last **26** weeks.
- Visitors: trimmed, deduplicated (case/accent-insensitive), each ≤ **120** chars, at most **50**.
- Every UPDATE/DELETE/UPSERT chains `.select()` and treats an empty result as `not_found`.
- New table: RLS explicitly disabled + GRANTs. Migration 047 is applied to production **only after the user's explicit OK**.
- jsdom here has no usable `localStorage`: stub it in any test that touches it.
- Lint only new/changed files: `npx eslint <files>` (main has ~63 pre-existing errors). `react-hooks/set-state-in-effect` and `react-refresh/only-export-components` are enforced: no synchronous `setState` in an effect body (use `key` remounts and async `.then`), components files export only components.
- CHANGELOG `[Unreleased]` entry in the same branch; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A GA leader opens the tab with **no** `gaIds` (or ids of deleted GAs) → friendly empty state, no crash, no query.
- Re-opening an existing attendance after a member **joined or left** the GA → old members still shown on that attendance, new members appear too (unmarked), and saving keeps both on `roster_ids`.
- Switching the date from a Sunday (type `ebd`) to a weekday → type falls back to `noite`; never saves `ebd` on a weekday (DB CHECK would reject it).
- Two leaders saving the same GA/service → the upsert updates the one row (no duplicate, no unique-key error).
- Save fails (network / not found) → toast shows the error and the checkboxes, visitors and notes stay as typed.

---

### Task 1: Migration 047 — `ga_attendance` table

**Files:**
- Create: `migrations/047_ga_attendance.sql`
- Modify: `migrations/README.md` (add a row after the 046 row)

**Interfaces:**
- Produces: table `ga_attendance` with columns `id, ga_id, church, service_date, service_type, roster_ids, present_ids, visitors, notes, entered_by_user_id, entered_by_name, created_at, updated_at`; unique constraint `ga_attendance_one_per_service (ga_id, service_date, service_type)` (used by `onConflict: "ga_id,service_date,service_type"` in Task 3).

- [ ] **Step 1: Write the migration**

```sql
-- Chamada do GA: which members of an assistance group were at each church service, marked by the GA leader in
-- Assistência › Chamada do GA. One row per GA + date + service type; the roster is frozen as it was that day, so later
-- moves between groups never rewrite history. Follow-up numbers are computed by the app, never stored.
CREATE TABLE IF NOT EXISTS ga_attendance (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ga_id               text        NOT NULL,
  church              text        NOT NULL CHECK (char_length(church) BETWEEN 1 AND 120),
  service_date        date        NOT NULL,
  service_type        text        NOT NULL CHECK (service_type IN ('ebd', 'noite', 'outro')),
  roster_ids          text[]      NOT NULL DEFAULT '{}',
  present_ids         text[]      NOT NULL DEFAULT '{}',
  visitors            text[]      NOT NULL DEFAULT '{}',
  notes               text        CHECK (notes IS NULL OR char_length(notes) <= 2000),
  entered_by_user_id  text,
  entered_by_name     text        NOT NULL CHECK (char_length(entered_by_name) BETWEEN 1 AND 120),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ga_attendance_one_per_service UNIQUE (ga_id, service_date, service_type),
  CONSTRAINT ga_attendance_ebd_sunday CHECK (service_type <> 'ebd' OR extract(dow FROM service_date) = 0),
  CONSTRAINT ga_attendance_present_in_roster CHECK (present_ids <@ roster_ids),
  CONSTRAINT ga_attendance_visitors_max CHECK (cardinality(visitors) <= 50)
);
CREATE INDEX IF NOT EXISTS ga_attendance_ga_date_idx ON ga_attendance (ga_id, service_date DESC);

ALTER TABLE ga_attendance DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON ga_attendance TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Add the README row** (after the `046_…` row, same table format)

```markdown
| `047_ga_attendance.sql` | Creates `ga_attendance` (Chamada do GA: one row per GA + date + service type with `roster_ids`, `present_ids` and `visitors` as `text[]`; EBD only on Sundays; present ⊆ roster; ≤ 50 visitors), RLS disabled. Used by Assistência › Chamada do GA; the tab fails without it. Apply **before** deploying the code that uses it. |
```

- [ ] **Step 3: Commit** (do NOT apply to production — that is Task 7, with the user's OK)

```bash
git add migrations/047_ga_attendance.sql migrations/README.md
git commit -m "GA attendance: migration 047 (ga_attendance table)"
```

---

### Task 2: Pure rules — `src/lib/gaAttendance.js`

**Files:**
- Create: `src/lib/gaAttendance.js`
- Test: `src/test/gaAttendance.test.js`

**Interfaces:**
- Consumes: `serviceTypesFor(date)` from `@/lib/praiseLists`; `rolesOf(user)` from `@/lib/sectionAccess`.
- Produces:
  - constants `ATTENDANCE_DAYS_BACK=14`, `RECENT_COUNT=8`, `CARE_AFTER=3`, `HISTORY_WEEKS=26`, `MAX_VISITORS=50`, `MAX_VISITOR_NAME=120`
  - `addDays(date: "YYYY-MM-DD", n: number) → "YYYY-MM-DD"`
  - `attendanceDateAllowed(date, today, { isAdmin }) → boolean`
  - `attendanceTypesFor(date) → string[]`
  - `isAttendanceAdmin(user) → boolean`
  - `gasInScope(user, gas) → ga[]` (sorted by name, natural)
  - `rosterFor(gaId, members) → member[]` (by name, `pt`)
  - `shownRoster(row, roster, members) → [{ id, name }]` (saved roster ∪ current roster; unknown ids get `name: null`)
  - `cleanVisitors(list) → string[]`, `cleanPresent(presentIds, rosterIds) → string[]`
  - `followUp(attendances, roster, today) → [{ member, lastPresent, since, recent, needsCare }]`
  - `sinceLabel(days, tt) → string`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { STRINGS } from "@/i18n/strings";
import {
  addDays, attendanceDateAllowed, attendanceTypesFor, gasInScope, rosterFor, shownRoster,
  cleanVisitors, cleanPresent, followUp, sinceLabel, isAttendanceAdmin,
} from "@/lib/gaAttendance";

const tt = STRINGS.pt;
const att = (service_date, roster_ids, present_ids, service_type = "noite") => ({ service_date, service_type, roster_ids, present_ids });

describe("dates", () => {
  it("adds days across months", () => {
    expect(addDays("2026-11-05", -14)).toBe("2026-10-22");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
  it("allows today back to 14 days, never the future; admin any past date", () => {
    expect(attendanceDateAllowed("2026-11-05", "2026-11-05")).toBe(true);
    expect(attendanceDateAllowed("2026-10-22", "2026-11-05")).toBe(true);
    expect(attendanceDateAllowed("2026-10-21", "2026-11-05")).toBe(false);
    expect(attendanceDateAllowed("2026-11-06", "2026-11-05")).toBe(false);
    expect(attendanceDateAllowed("2025-01-01", "2026-11-05", { isAdmin: true })).toBe(true);
    expect(attendanceDateAllowed("2026-11-06", "2026-11-05", { isAdmin: true })).toBe(false);
    expect(attendanceDateAllowed("", "2026-11-05")).toBe(false);
  });
  it("Sunday has EBD and Noite, other days Noite", () => {
    expect(attendanceTypesFor("2026-11-01")).toEqual(["ebd", "noite"]);
    expect(attendanceTypesFor("2026-11-04")).toEqual(["noite"]);
  });
});

describe("scope and roster", () => {
  const gas = [{ id: "g2", name: "Newark 10" }, { id: "g1", name: "Newark 2" }, { id: "g3", name: "York 1" }];
  it("admin sees every GA, a leader only their gaIds, nobody else nothing", () => {
    expect(gasInScope({ sysRoles: ["admin"] }, gas).map((g) => g.id)).toEqual(["g1", "g2", "g3"]);
    expect(gasInScope({ sysRoles: ["ga_leader"], gaIds: ["g3", "gX"] }, gas).map((g) => g.id)).toEqual(["g3"]);
    expect(gasInScope({ sysRoles: ["ga_leader"] }, gas)).toEqual([]);
    expect(isAttendanceAdmin({ sysRole: "admin" })).toBe(true);
    expect(isAttendanceAdmin({ sysRoles: ["ga_leader"] })).toBe(false);
  });
  it("roster is the GA's members by name", () => {
    const members = [{ id: "b", name: "Bruno", gaId: "g1" }, { id: "a", name: "Álvaro", gaId: "g1" }, { id: "c", name: "Carla", gaId: "g2" }];
    expect(rosterFor("g1", members).map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("an existing attendance keeps who has left and adds who has joined", () => {
    const members = [{ id: "a", name: "Ana", gaId: "g1" }, { id: "n", name: "Nova", gaId: "g1" }, { id: "x", name: "Xavier", gaId: "g2" }];
    const roster = rosterFor("g1", members);
    const shown = shownRoster({ roster_ids: ["a", "x", "gone"] }, roster, members);
    expect(shown).toEqual([{ id: "a", name: "Ana" }, { id: "n", name: "Nova" }, { id: "x", name: "Xavier" }, { id: "gone", name: null }]);
    expect(shownRoster(null, roster, members).map((m) => m.id)).toEqual(["a", "n"]);
  });
});

describe("cleaning", () => {
  it("visitors: trimmed, no blanks, no duplicates ignoring case and accents, 120 chars, at most 50", () => {
    expect(cleanVisitors([" José ", "jose", "", "  ", "Maria"])).toEqual(["José", "Maria"]);
    expect(cleanVisitors(["x".repeat(130)])[0]).toHaveLength(120);
    expect(cleanVisitors(Array.from({ length: 60 }, (_, i) => `V${i}`))).toHaveLength(50);
    expect(cleanVisitors(undefined)).toEqual([]);
  });
  it("present: only roster ids, once", () => {
    expect(cleanPresent(["a", "a", "z"], ["a", "b"])).toEqual(["a"]);
  });
});

describe("followUp", () => {
  const roster = [{ id: "a", name: "Ana" }, { id: "b", name: "Bia" }, { id: "n", name: "Nova" }];
  const list = [
    att("2026-10-18", ["a", "b"], ["a", "b"]),
    att("2026-10-25", ["a", "b"], ["a"]),
    att("2026-11-01", ["a", "b"], ["a"], "ebd"),
    att("2026-11-01", ["a", "b", "n"], ["n"], "noite"),
  ];
  const res = followUp(list, roster, "2026-11-05");
  const by = Object.fromEntries(res.map((r) => [r.member.id, r]));

  it("last presence and days since", () => {
    expect(by.a.lastPresent).toBe("2026-11-01");
    expect(by.a.since).toBe(4);
    expect(by.b.lastPresent).toBe("2026-10-18");
    expect(by.b.since).toBe(18);
  });
  it("recent is newest first (Noite before EBD on a Sunday), none when not on the roster", () => {
    expect(by.a.recent).toEqual(["absent", "present", "present", "present"]);
    expect(by.n.recent).toEqual(["present", "none", "none", "none"]);
  });
  it("needs care after 3 absences on their own rosters, listed first", () => {
    expect(by.b.needsCare).toBe(true);
    expect(by.a.needsCare).toBe(false);
    expect(by.n.needsCare).toBe(false); // only one attendance on the roster
    expect(res[0].member.id).toBe("b");
  });
  it("then longest since last presence; never present counts as longest", () => {
    const r2 = followUp([att("2026-11-01", ["a", "b"], ["a"])], [{ id: "a", name: "Ana" }, { id: "b", name: "Bia" }], "2026-11-05");
    expect(r2.map((r) => r.member.id)).toEqual(["b", "a"]);
    expect(r2[0].lastPresent).toBeNull();
    expect(r2[0].since).toBeNull();
  });
  it("keeps only the last 8", () => {
    const many = Array.from({ length: 10 }, (_, i) => att(addDays("2026-09-01", i * 7), ["a"], ["a"]));
    expect(followUp(many, [{ id: "a", name: "Ana" }], "2026-11-10")[0].recent).toHaveLength(8);
  });
});

describe("sinceLabel", () => {
  it("speaks in days, weeks and months, gently", () => {
    expect(sinceLabel(null, tt)).toBe("Ainda sem presença registrada");
    expect(sinceLabel(0, tt)).toBe("hoje");
    expect(sinceLabel(1, tt)).toBe("há 1 dia");
    expect(sinceLabel(5, tt)).toBe("há 5 dias");
    expect(sinceLabel(14, tt)).toBe("há 2 semanas");
    expect(sinceLabel(21, tt)).toBe("há 3 semanas");
    expect(sinceLabel(70, tt)).toBe("há 2 meses");
    expect(sinceLabel(21, STRINGS.en)).toBe("3 weeks ago");
  });
});
```

- [ ] **Step 2: Add the strings these tests need** — in `src/i18n/strings.js`, after `assistTabCensus` in **pt**:

```js
    assistTabGa: "Chamada do GA",
    gaNeverPresent: "Ainda sem presença registrada",
    gaToday: "hoje",
    gaOneDay: "há 1 dia",
    gaDaysAgo: "há {n} dias",
    gaWeeksAgo: "há {n} semanas",
    gaOneMonth: "há 1 mês",
    gaMonthsAgo: "há {n} meses",
```

and after `assistTabCensus` in **en**:

```js
    assistTabGa: "GA Attendance",
    gaNeverPresent: "No attendance recorded yet",
    gaToday: "today",
    gaOneDay: "1 day ago",
    gaDaysAgo: "{n} days ago",
    gaWeeksAgo: "{n} weeks ago",
    gaOneMonth: "1 month ago",
    gaMonthsAgo: "{n} months ago",
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/test/gaAttendance.test.js`
Expected: FAIL — cannot resolve `@/lib/gaAttendance`.

- [ ] **Step 4: Implement `src/lib/gaAttendance.js`**

```js
// Chamada do GA: pure rules — who may mark which group and date, the roster of an attendance, cleaning what was typed,
// and the follow-up of who has not been coming (to care for them, never to accuse). No database here (see
// gaAttendanceData.js).
import { serviceTypesFor } from "@/lib/praiseLists";
import { rolesOf } from "@/lib/sectionAccess";

export const ATTENDANCE_DAYS_BACK = 14;
export const RECENT_COUNT = 8;
export const CARE_AFTER = 3;
export const HISTORY_WEEKS = 26;
export const MAX_VISITORS = 50;
export const MAX_VISITOR_NAME = 120;

const pad = (n) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { numeric: true });
const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export function addDays(date, n) {
  const [y, m, d] = String(date).split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

const dayNumber = (date) => {
  const [y, m, d] = String(date).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

// Today back to 14 days ago (forgot on Sunday, marks on Tuesday); never the future. Admins correct any past date.
export function attendanceDateAllowed(date, today, { isAdmin = false } = {}) {
  if (!DATE_RE.test(String(date || "")) || date > today) return false;
  return isAdmin || date >= addDays(today, -ATTENDANCE_DAYS_BACK);
}

// Same services as the Frequência: Sunday has EBD and Noite, every other day only Noite.
export const attendanceTypesFor = (date) => serviceTypesFor(date);

export const isAttendanceAdmin = (user) => rolesOf(user).includes("admin");

// Admin: every group. Anyone else: only the groups linked to their account (app_users.ga_ids).
export function gasInScope(user, gas = []) {
  const list = isAttendanceAdmin(user) ? gas : gas.filter((g) => (user?.gaIds || []).includes(g.id));
  return [...list].sort(byName);
}

export const rosterFor = (gaId, members = []) => members.filter((m) => m.gaId === gaId).sort(byName);

// Who an attendance lists: its saved roster (people who have left the group since stay on it) plus whoever is in the
// group now (unmarked). Saved ids no longer in the directory come back with name null.
export function shownRoster(row, roster = [], members = []) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const current = roster.map((m) => ({ id: m.id, name: m.name }));
  const ids = new Set(current.map((m) => m.id));
  const extra = (row?.roster_ids || []).filter((id) => !ids.has(id)).map((id) => ({ id, name: byId.get(id)?.name ?? null }));
  const named = [...current, ...extra.filter((m) => m.name)].sort(byName);
  return [...named, ...extra.filter((m) => !m.name)];
}

export function cleanVisitors(list = []) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const name = String(raw ?? "").trim().slice(0, MAX_VISITOR_NAME);
    const key = fold(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_VISITORS) break;
  }
  return out;
}

export function cleanPresent(presentIds = [], rosterIds = []) {
  const roster = new Set(rosterIds);
  return [...new Set(presentIds)].filter((id) => roster.has(id));
}

// Newest first; on a Sunday the Noite comes after the EBD, so it is the newer one.
const TYPE_ORDER = { noite: 0, outro: 1, ebd: 2 };
const newestFirst = (a, b) => b.service_date.localeCompare(a.service_date) || (TYPE_ORDER[a.service_type] ?? 9) - (TYPE_ORDER[b.service_type] ?? 9);

// For each member of the group: last presence, days since, the group's last 8 attendances ("present" / "absent" /
// "none" = not in the group that day) and whether to reach out first (absent from the last 3 attendances they were
// on). Order: reach out first, then longest since last presence (never present = longest), then name.
export function followUp(attendances = [], roster = [], today) {
  const sorted = [...attendances].sort(newestFirst);
  const rows = roster.map((member) => {
    const mark = (a) => (!(a.roster_ids || []).includes(member.id) ? "none" : (a.present_ids || []).includes(member.id) ? "present" : "absent");
    const marks = sorted.map(mark);
    const own = marks.filter((x) => x !== "none");
    const lastIdx = marks.indexOf("present");
    const lastPresent = lastIdx === -1 ? null : sorted[lastIdx].service_date;
    return {
      member,
      lastPresent,
      since: lastPresent ? dayNumber(today) - dayNumber(lastPresent) : null,
      recent: marks.slice(0, RECENT_COUNT),
      needsCare: own.length >= CARE_AFTER && own.slice(0, CARE_AFTER).every((x) => x === "absent"),
    };
  });
  const far = (r) => (r.since === null ? Infinity : r.since);
  const farther = (a, b) => (far(a) === far(b) ? 0 : far(b) - far(a)); // two "never present" are equal, not NaN
  return rows.sort((a, b) => (b.needsCare - a.needsCare) || farther(a, b) || byName(a.member, b.member));
}

export function sinceLabel(days, tt) {
  if (days === null || days === undefined) return tt.gaNeverPresent;
  if (days <= 0) return tt.gaToday;
  if (days === 1) return tt.gaOneDay;
  if (days < 14) return fill(tt.gaDaysAgo, { n: days });
  if (days < 60) return fill(tt.gaWeeksAgo, { n: Math.floor(days / 7) });
  const months = Math.floor(days / 30);
  return months === 1 ? tt.gaOneMonth : fill(tt.gaMonthsAgo, { n: months });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/gaAttendance.test.js`
Expected: PASS (all).

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/lib/gaAttendance.js src/test/gaAttendance.test.js
git add src/lib/gaAttendance.js src/test/gaAttendance.test.js src/i18n/strings.js
git commit -m "GA attendance: pure rules (dates, scope, roster, follow-up)"
```

---

### Task 3: Database calls — `src/lib/gaAttendanceData.js`

**Files:**
- Create: `src/lib/gaAttendanceData.js`
- Test: `src/test/gaAttendanceData.test.js`

**Interfaces:**
- Consumes: `sb` from `@/lib/supabase`; `cleanPresent`, `cleanVisitors` from Task 2.
- Produces (all return `{ data, error }`, `error` a string or null):
  - `fetchAttendance(gaId, date, type) → row | null`
  - `listAttendance(gaId, from) → row[]` (newest first)
  - `saveAttendance({ ga_id, church, service_date, service_type, roster_ids, present_ids, visitors, notes, entered_by_user_id, entered_by_name }) → row` (`error: "not_found"` if no row returns)
  - `deleteAttendance(id) → row`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("@/lib/supabase", () => ({ sb: { from: (...a) => from(...a) } }));

import { fetchAttendance, listAttendance, saveAttendance, deleteAttendance } from "@/lib/gaAttendanceData";

// A chainable fake query that records calls and resolves to `result` when awaited.
const chain = (result, calls = []) => {
  const q = new Proxy({}, {
    get: (_, k) => (k === "then" ? (res) => Promise.resolve(result).then(res) : (...a) => { calls.push([k, ...a]); return q; }),
  });
  return q;
};

beforeEach(() => from.mockReset());

describe("gaAttendanceData", () => {
  it("fetches one attendance by GA, date and type", async () => {
    const calls = [];
    from.mockReturnValue(chain({ data: { id: "1" }, error: null }, calls));
    expect(await fetchAttendance("g1", "2026-11-01", "ebd")).toEqual({ data: { id: "1" }, error: null });
    expect(from).toHaveBeenCalledWith("ga_attendance");
    expect(calls).toContainEqual(["eq", "ga_id", "g1"]);
    expect(calls).toContainEqual(["eq", "service_date", "2026-11-01"]);
    expect(calls).toContainEqual(["eq", "service_type", "ebd"]);
  });

  it("lists a GA's attendances from a date, newest first", async () => {
    const calls = [];
    from.mockReturnValue(chain({ data: [{ id: "1" }], error: null }, calls));
    expect((await listAttendance("g1", "2026-05-07")).data).toEqual([{ id: "1" }]);
    expect(calls).toContainEqual(["gte", "service_date", "2026-05-07"]);
    expect(calls).toContainEqual(["order", "service_date", { ascending: false }]);
  });

  it("saves with an upsert on the service key, cleaned lists and .select()", async () => {
    const calls = [];
    from.mockReturnValue(chain({ data: [{ id: "1" }], error: null }, calls));
    const res = await saveAttendance({
      ga_id: "g1", church: "Newark, NJ", service_date: "2026-11-01", service_type: "noite",
      roster_ids: ["a", "b"], present_ids: ["a", "z", "a"], visitors: [" José ", "jose"], notes: "  ",
      entered_by_user_id: 5, entered_by_name: "Leonard",
    });
    expect(res).toEqual({ data: { id: "1" }, error: null });
    const up = calls.find((c) => c[0] === "upsert");
    expect(up[1]).toMatchObject({ present_ids: ["a"], visitors: ["José"], notes: null, entered_by_user_id: "5", roster_ids: ["a", "b"] });
    expect(up[2]).toEqual({ onConflict: "ga_id,service_date,service_type" });
    expect(calls.some((c) => c[0] === "select")).toBe(true);
  });

  it("treats an empty result as not_found and passes errors through", async () => {
    from.mockReturnValue(chain({ data: [], error: null }));
    expect((await deleteAttendance("x")).error).toBe("not_found");
    from.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    expect((await saveAttendance({ roster_ids: [], present_ids: [], visitors: [], entered_by_name: "x" })).error).toBe("boom");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/gaAttendanceData.test.js`
Expected: FAIL — cannot resolve `@/lib/gaAttendanceData`.

- [ ] **Step 3: Implement**

```js
// Chamada do GA: database calls. Staff only (the signed-in Hub client); the date window and the GA scope are checked by
// the app (gaAttendance.js) — enforcing them on the server belongs to the RLS phase of the security plan.
import { sb } from "@/lib/supabase";
import { cleanPresent, cleanVisitors } from "@/lib/gaAttendance";

const COLS = "id,ga_id,church,service_date,service_type,roster_ids,present_ids,visitors,notes,entered_by_user_id,entered_by_name,created_at,updated_at";

export async function fetchAttendance(gaId, date, type) {
  const { data, error } = await sb.from("ga_attendance").select(COLS)
    .eq("ga_id", gaId).eq("service_date", date).eq("service_type", type).maybeSingle();
  return { data: data || null, error: error ? error.message : null };
}

export async function listAttendance(gaId, from) {
  const { data, error } = await sb.from("ga_attendance").select(COLS)
    .eq("ga_id", gaId).gte("service_date", from).order("service_date", { ascending: false });
  return { data: data || [], error: error ? error.message : null };
}

const one = ({ data, error }) => {
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { data: row, error: null } : { data: null, error: "not_found" };
};

// One row per GA + service: saving a service already marked (by another leader of the group, too) updates it.
export async function saveAttendance(row) {
  const roster = [...new Set(row.roster_ids || [])];
  const fields = {
    ga_id: row.ga_id, church: row.church, service_date: row.service_date, service_type: row.service_type,
    roster_ids: roster, present_ids: cleanPresent(row.present_ids, roster), visitors: cleanVisitors(row.visitors),
    notes: String(row.notes || "").trim() || null,
    entered_by_user_id: row.entered_by_user_id != null ? String(row.entered_by_user_id) : null,
    entered_by_name: String(row.entered_by_name || "").slice(0, 120), updated_at: new Date().toISOString(),
  };
  return one(await sb.from("ga_attendance").upsert(fields, { onConflict: "ga_id,service_date,service_type" }).select(COLS));
}

export async function deleteAttendance(id) {
  return one(await sb.from("ga_attendance").delete().eq("id", id).select(COLS));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/gaAttendanceData.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/lib/gaAttendanceData.js src/test/gaAttendanceData.test.js
git add src/lib/gaAttendanceData.js src/test/gaAttendanceData.test.js
git commit -m "GA attendance: database calls"
```

---

### Task 4: Access — GA leaders reach Assistência, tabs by role

**Files:**
- Modify: `src/lib/sectionAccess.js` (`assistance` list)
- Modify: `src/sections/assistance/AssistanceSection.jsx` (tabs with roles; GA tab renders `GaAttendanceTab`)
- Create: `src/sections/assistance/GaAttendanceTab.jsx` (stub in this task: `export default function GaAttendanceTab() { return <div />; }` — replaced in Task 5)
- Modify: `src/hub/HubHome.jsx` (Assistência description)
- Modify: `src/i18n/strings.js` (`assistNoAccess` pt/en)
- Modify tests: `src/test/assistanceAccess.test.jsx`, `src/test/hubAssistance.test.jsx`, `src/test/roleVisibility.test.jsx`, `src/test/hubHomeWorship.test.jsx`

**Interfaces:**
- Consumes: `rolesOf` from `@/lib/sectionAccess`.
- Produces: `AssistanceSection` renders `<GaAttendanceTab lang={lang} />` when the active tab is `ga`.

- [ ] **Step 1: Update the tests first**

`src/test/assistanceAccess.test.jsx` — mock the new tab and replace the describe block:

```js
vi.mock("@/sections/assistance/GaAttendanceTab", () => ({ default: () => <div>GA TAB</div> }));
```

```js
describe("Assistência: tabs by profile (even by typing /assistance)", () => {
  it.each([["clerk"], ["pastor"]])("%s sees only Frequência", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
    expect(screen.queryByText("Chamada do GA")).toBeNull();
  });
  it("a GA leader sees only the Chamada do GA", () => {
    renderAs({ name: "X", sysRoles: ["ga_leader"], gaIds: ["g1"] });
    expect(screen.getByText("GA TAB")).toBeTruthy();
    expect(screen.queryByText("Frequência")).toBeNull();
  });
  it("admin sees both and switches", () => {
    renderAs({ name: "X", sysRoles: ["admin"] });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
    fireEvent.click(screen.getByText("Chamada do GA"));
    expect(screen.getByText("GA TAB")).toBeTruthy();
  });
  it("a pastor who also leads a GA sees both", () => {
    renderAs({ name: "X", sysRoles: ["pastor", "ga_leader"], gaIds: ["g1"] });
    expect(screen.getByText("Frequência")).toBeTruthy();
    expect(screen.getByText("Chamada do GA")).toBeTruthy();
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

(add `fireEvent` to the `@testing-library/react` import.)

`src/test/hubAssistance.test.jsx` — replace the last test:

```js
  it("GA leaders get the card too (their Chamada do GA)", () => {
    renderHome({ name: "GA", sysRoles: ["ga_leader"], gaIds: ["g1"] });
    expect(screen.getByText("Assistência")).toBeTruthy();
  });
```

`src/test/roleVisibility.test.jsx` — the GA leader line becomes:

```js
  it("GA leader: Eventos, Diretório and Assistência — no Escalas, no Culto Profético", () => expect(see(gaLeader)).toEqual(["events", "cms", "assistance"]));
```

`src/test/hubHomeWorship.test.jsx` — the GA leader test becomes `expect(cards()).toEqual(["Eventos", "Diretório", "Assistência"]);` (title: "a GA leader sees Eventos, Diretório and Assistência — no Escalas, no Culto Profético"). Run it once before editing the "GA leader who is also a secretary" test: if it already passes unchanged, leave it; if not, set its expected list to what the Home shows for a clerk plus nothing new (the clerk already reaches Assistência).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/test/assistanceAccess.test.jsx src/test/hubAssistance.test.jsx src/test/roleVisibility.test.jsx src/test/hubHomeWorship.test.jsx`
Expected: FAIL on the GA-leader cases.

- [ ] **Step 3: Implement**

`src/lib/sectionAccess.js`:

```js
  assistance: ["admin", "clerk", "pastor", "ga_leader"],
```

`src/sections/assistance/GaAttendanceTab.jsx` (stub, replaced in Task 5):

```js
export default function GaAttendanceTab() {
  return <div />;
}
```

`src/sections/assistance/AssistanceSection.jsx` — replace the top through the gate:

```js
import { useState } from "react";
import { Users, ClipboardCheck } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { rolesOf } from "@/lib/sectionAccess";
import CensusTab from "./CensusTab";
import GaAttendanceTab from "./GaAttendanceTab";

// Assistência (Care): pastoral follow-up. Each tab lists the profiles that see it: the church census for pastors and
// clerks, the GA attendance for GA leaders (their groups only); admins see both. Visits and prayer requests arrive as
// tabs here.
const TABS = [
  { id: "census", icon: Users, color: "#b45309", pt: "Frequência", en: "Attendance", roles: ["admin", "clerk", "pastor"] },
  { id: "ga", icon: ClipboardCheck, color: "#0f766e", pt: "Chamada do GA", en: "GA Attendance", roles: ["admin", "ga_leader"] },
];

export default function AssistanceSection({ lang }) {
  const pt = lang !== "en";
  const [tab, setTab] = useState(null);
  const { user } = useAppDataContext() || {};
  const roles = rolesOf(user);
  const tabs = TABS.filter((t) => t.roles.some((r) => roles.includes(r)));
  const active = tabs.find((t) => t.id === tab) || tabs[0];

  if (!active) {
    return (
      <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)", padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
        {STRINGS[pt ? "pt" : "en"].assistNoAccess}
      </div>
    );
  }
```

In the JSX: map over `tabs` (not `TABS`), compute `isActive = t.id === active.id`, and render

```js
        {active.id === "census" && <CensusTab lang={lang} />}
        {active.id === "ga" && <GaAttendanceTab lang={lang} />}
```

`src/i18n/strings.js`: pt `assistNoAccess: "Esta seção é para pastores, secretários, líderes de GA e administradores."`; en `assistNoAccess: "This section is for pastors, church clerks, GA leaders and admins."`

`src/hub/HubHome.jsx` Assistência tile: pt `desc: "Frequência dos cultos, chamada do GA e acompanhamento"`, en `desc: "Service attendance, GA attendance and follow-up"`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/test/assistanceAccess.test.jsx src/test/hubAssistance.test.jsx src/test/roleVisibility.test.jsx src/test/hubHomeWorship.test.jsx src/test/hubSections.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/lib/sectionAccess.js src/sections/assistance/AssistanceSection.jsx src/sections/assistance/GaAttendanceTab.jsx src/hub/HubHome.jsx src/test/assistanceAccess.test.jsx src/test/hubAssistance.test.jsx
git add -A src/lib/sectionAccess.js src/sections/assistance src/hub/HubHome.jsx src/i18n/strings.js src/test
git commit -m "GA attendance: GA leaders reach Assistência; tabs by profile"
```

---

### Task 5: Chamada view — tab shell and attendance form

**Files:**
- Modify (replace stub): `src/sections/assistance/GaAttendanceTab.jsx`
- Create: `src/sections/assistance/GaAttendanceForm.jsx`
- Modify: `src/i18n/strings.js`
- Test: `src/test/gaAttendanceTab.test.jsx`

**Interfaces:**
- Consumes: Task 2 (`gasInScope`, `rosterFor`, `shownRoster`, `attendanceTypesFor`, `attendanceDateAllowed`, `isAttendanceAdmin`, `addDays`, `ATTENDANCE_DAYS_BACK`, `cleanVisitors`), Task 3 (`fetchAttendance`, `saveAttendance`, `deleteAttendance`), `useAppDataContext()` → `{ user, members, gas, notify }`, `todayLocal`/`formatDate` from `@/lib/prayerSlots`, `logAuditEvent`/`staffActor` from `@/lib/auditEvent`, `ConfirmDelete`.
- Produces: `GaAttendanceTab({ lang })` with `view` state `"take" | "follow"`; renders `<GaFollowUp ga roster lang key={ga.id} />` for `"follow"` (Task 6 creates it — in this task render `null` for `"follow"` and add the import in Task 6). `GaAttendanceForm({ ga, date, type, roster, lang })`.

- [ ] **Step 1: Add strings** — pt (after the Task 2 strings):

```js
    gaViewTake: "Chamada",
    gaViewFollow: "Acompanhamento",
    gaGroup: "Grupo",
    gaNoGroups: "Nenhum grupo de assistência ligado à sua conta. Fale com a secretaria.",
    gaNoMembers: "Este grupo ainda não tem membros no Diretório.",
    gaMarkAll: "Marcar todos",
    gaUnmarkAll: "Desmarcar todos",
    gaRemovedMember: "Membro removido",
    gaVisitors: "Visitantes",
    gaVisitorName: "Nome do visitante",
    gaAddVisitor: "Adicionar",
    gaRemoveVisitor: "Remover {name}",
    gaNotes: "Observação (opcional)",
    gaCount: "{present} de {total} presentes · {visitors} visitante(s)",
    gaSave: "Salvar chamada",
    gaSaving: "Salvando…",
    gaSaved: "Chamada salva.",
    gaRecordedBy: "Lançada por {name} em {date}",
    gaDateWindow: "A chamada pode ser feita para hoje ou até 14 dias atrás.",
    gaErrLoad: "Não foi possível carregar a chamada.",
    gaErrSave: "Não foi possível salvar a chamada. Nada foi perdido — tente de novo.",
    gaRetry: "Tentar de novo",
    gaDelete: "Excluir chamada",
    gaDeleteLabel: "a chamada de {date} ({type})",
    gaDeleted: "Chamada excluída.",
```

en:

```js
    gaViewTake: "Take attendance",
    gaViewFollow: "Follow-up",
    gaGroup: "Group",
    gaNoGroups: "No assistance group is linked to your account. Please ask the church office.",
    gaNoMembers: "This group has no members in the Directory yet.",
    gaMarkAll: "Mark all",
    gaUnmarkAll: "Clear all",
    gaRemovedMember: "Removed member",
    gaVisitors: "Visitors",
    gaVisitorName: "Visitor's name",
    gaAddVisitor: "Add",
    gaRemoveVisitor: "Remove {name}",
    gaNotes: "Note (optional)",
    gaCount: "{present} of {total} present · {visitors} visitor(s)",
    gaSave: "Save attendance",
    gaSaving: "Saving…",
    gaSaved: "Attendance saved.",
    gaRecordedBy: "Recorded by {name} on {date}",
    gaDateWindow: "Attendance can be taken for today or up to 14 days back.",
    gaErrLoad: "Could not load the attendance.",
    gaErrSave: "Could not save the attendance. Nothing was lost — please try again.",
    gaRetry: "Try again",
    gaDelete: "Delete attendance",
    gaDeleteLabel: "the attendance of {date} ({type})",
    gaDeleted: "Attendance deleted.",
```

- [ ] **Step 2: Write the failing component tests** (`src/test/gaAttendanceTab.test.jsx`)

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDataContext } from "@/context/AppDataContext";

const fetchA = vi.fn();
const saveA = vi.fn();
const listA = vi.fn();
vi.mock("@/lib/gaAttendanceData", () => ({
  fetchAttendance: (...a) => fetchA(...a), saveAttendance: (...a) => saveA(...a),
  listAttendance: (...a) => listA(...a), deleteAttendance: vi.fn(),
}));
vi.mock("@/lib/auditEvent", () => ({ logAuditEvent: vi.fn(), staffActor: (u) => ({ name: u?.name, id: u?.id, role: "ga_leader" }) }));
vi.mock("@/lib/prayerSlots", async (orig) => ({ ...(await orig()), todayLocal: () => "2026-11-01" })); // a Sunday

import GaAttendanceTab from "@/sections/assistance/GaAttendanceTab";

const members = [
  { id: "a", name: "Ana", gaId: "g1" }, { id: "b", name: "Bruno", gaId: "g1" }, { id: "c", name: "Carla", gaId: "g2" },
];
const gas = [{ id: "g1", name: "Newark 1", church: "Newark, NJ" }, { id: "g2", name: "Newark 2", church: "Newark, NJ" }];
const notify = vi.fn();
const renderTab = (user) => render(
  <AppDataContext.Provider value={{ user, members, gas, notify }}><GaAttendanceTab lang="pt" /></AppDataContext.Provider>
);
const leader = { id: 5, name: "Leonard", sysRoles: ["ga_leader"], gaIds: ["g1"] };

beforeEach(() => {
  fetchA.mockReset().mockResolvedValue({ data: null, error: null });
  saveA.mockReset();
  listA.mockReset().mockResolvedValue({ data: [], error: null });
  notify.mockReset();
});

describe("GaAttendanceTab — Chamada", () => {
  it("a leader with no groups gets a friendly message and no query", () => {
    renderTab({ ...leader, gaIds: [] });
    expect(screen.getByText("Nenhum grupo de assistência ligado à sua conta. Fale com a secretaria.")).toBeTruthy();
    expect(fetchA).not.toHaveBeenCalled();
  });

  it("shows only the leader's group, loads today's first service and marks members", async () => {
    renderTab(leader);
    await waitFor(() => expect(fetchA).toHaveBeenCalledWith("g1", "2026-11-01", "ebd"));
    expect(await screen.findByLabelText("Ana")).toBeTruthy();
    expect(screen.queryByText("Carla")).toBeNull();
    expect(screen.queryByLabelText("Grupo")).toBeNull(); // one group: no picker
    fireEvent.click(screen.getByLabelText("Ana"));
    expect(screen.getByText("1 de 2 presentes · 0 visitante(s)")).toBeTruthy();
  });

  it("saves present members, visitors and who recorded it", async () => {
    saveA.mockResolvedValue({ data: { id: "r1", service_date: "2026-11-01", service_type: "ebd", entered_by_name: "Leonard", updated_at: "2026-11-01T15:00:00Z", roster_ids: ["a", "b"], present_ids: ["b"], visitors: ["José"] }, error: null });
    renderTab(leader);
    fireEvent.click(await screen.findByLabelText("Bruno"));
    fireEvent.change(screen.getByPlaceholderText("Nome do visitante"), { target: { value: "José" } });
    fireEvent.click(screen.getByText("Adicionar"));
    fireEvent.click(screen.getByText("Salvar chamada"));
    await waitFor(() => expect(saveA).toHaveBeenCalled());
    expect(saveA.mock.calls[0][0]).toMatchObject({
      ga_id: "g1", church: "Newark, NJ", service_date: "2026-11-01", service_type: "ebd",
      roster_ids: ["a", "b"], present_ids: ["b"], visitors: ["José"], entered_by_user_id: 5, entered_by_name: "Leonard",
    });
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Chamada salva."));
  });

  it("a failed save keeps what was marked", async () => {
    saveA.mockResolvedValue({ data: null, error: "boom" });
    renderTab(leader);
    fireEvent.click(await screen.findByLabelText("Ana"));
    fireEvent.click(screen.getByText("Salvar chamada"));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("Não foi possível salvar")));
    expect(screen.getByLabelText("Ana").checked).toBe(true);
  });

  it("an existing attendance opens filled in, keeping a member who left", async () => {
    fetchA.mockResolvedValue({ data: { id: "r1", service_date: "2026-11-01", service_type: "ebd", roster_ids: ["a", "c"], present_ids: ["c"], visitors: [], notes: "", entered_by_name: "Leonard", updated_at: "2026-11-01T15:00:00Z" }, error: null });
    renderTab(leader);
    expect(await screen.findByText(/Lançada por Leonard em 01\/11\/2026/)).toBeTruthy();
    expect(screen.getByLabelText("Carla").checked).toBe(true);
    expect(screen.getByLabelText("Bruno").checked).toBe(false); // joined since: listed, unmarked
  });

  it("moving the date to a weekday falls back to Noite; a date out of the window disables saving", async () => {
    renderTab(leader);
    await screen.findByLabelText("Ana");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-28" } }); // Wednesday
    await waitFor(() => expect(fetchA).toHaveBeenLastCalledWith("g1", "2026-10-28", "noite"));
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-01" } });
    expect(await screen.findByText("A chamada pode ser feita para hoje ou até 14 dias atrás.")).toBeTruthy();
    expect(screen.getByText("Salvar chamada").closest("button").disabled).toBe(true);
  });

  it("admin picks among every group", async () => {
    renderTab({ id: 1, name: "Admin", sysRoles: ["admin"] });
    fireEvent.change(await screen.findByLabelText("Grupo"), { target: { value: "g2" } });
    await waitFor(() => expect(fetchA).toHaveBeenLastCalledWith("g2", "2026-11-01", "ebd"));
    expect(await screen.findByLabelText("Carla")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/test/gaAttendanceTab.test.jsx`
Expected: FAIL (stub renders nothing).

- [ ] **Step 4: Implement `GaAttendanceTab.jsx`**

```js
import { useMemo, useState } from "react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { todayLocal } from "@/lib/prayerSlots";
import { groupGasByChurch } from "@/lib/gaGroups";
import { gasInScope, rosterFor, attendanceTypesFor, attendanceDateAllowed, isAttendanceAdmin, addDays, ATTENDANCE_DAYS_BACK } from "@/lib/gaAttendance";
import GaAttendanceForm from "./GaAttendanceForm";

// Assistência › Chamada do GA: the GA leader marks who of their group was at each service (admins: any group), and
// follows who has not been coming — to care for them, never to accuse.
export default function GaAttendanceTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, members = [], gas = [] } = useAppDataContext() || {};
  const isAdmin = isAttendanceAdmin(user);
  const today = todayLocal();
  const groups = useMemo(() => gasInScope(user, gas), [user, gas]);

  const [gaId, setGaId] = useState("");
  const [view, setView] = useState("take");
  const [date, setDate] = useState(today);
  const [type, setType] = useState("");

  const ga = groups.find((g) => g.id === gaId) || groups[0];
  const roster = useMemo(() => (ga ? rosterFor(ga.id, members) : []), [ga, members]);
  const types = attendanceTypesFor(date);
  const activeType = types.includes(type) ? type : types[0];
  const dateOk = attendanceDateAllowed(date, today, { isAdmin });
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };

  if (!ga) return <p style={{ color: "var(--muted)", padding: "24px 0" }}>{tt.gaNoGroups}</p>;

  const sel = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" };
  const seg = (on) => ({
    padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", fontWeight: on ? 700 : 500,
    background: on ? "#0f766e" : "var(--card)", color: on ? "#fff" : "var(--text)",
  });

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        {groups.length > 1 && (
          <select aria-label={tt.gaGroup} value={ga.id} onChange={(e) => setGaId(e.target.value)} style={sel}>
            {isAdmin
              ? groupGasByChurch(groups, members).map((c) => (
                <optgroup key={c.church || "—"} label={c.church || "—"}>
                  {c.gas.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </optgroup>
              ))
              : groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <div role="tablist" style={{ display: "flex", gap: 6 }}>
          <button role="tab" aria-selected={view === "take"} style={seg(view === "take")} onClick={() => setView("take")}>{tt.gaViewTake}</button>
          <button role="tab" aria-selected={view === "follow"} style={seg(view === "follow")} onClick={() => setView("follow")}>{tt.gaViewFollow}</button>
        </div>
      </div>

      {view === "take" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {tt.censusDate}
              <input type="date" aria-label={tt.censusDate} value={date} max={today}
                min={isAdmin ? undefined : addDays(today, -ATTENDANCE_DAYS_BACK)}
                onChange={(e) => setDate(e.target.value)} style={sel} />
            </label>
            {types.map((t) => (
              <button key={t} style={seg(t === activeType)} aria-pressed={t === activeType} onClick={() => setType(t)}>{typeLabel[t] || t}</button>
            ))}
          </div>
          {!dateOk && <p role="alert" style={{ color: "var(--muted)", fontSize: 13 }}>{tt.gaDateWindow}</p>}
          <GaAttendanceForm key={`${ga.id}|${date}|${activeType}`} ga={ga} date={date} type={activeType} roster={roster}
            canSave={dateOk} lang={lang} />
        </>
      )}
      {view === "follow" && null}
    </div>
  );
}
```

Note: `tt.censusDate` is "Data" / "Date" (already exists), used as the date field's label.

- [ ] **Step 5: Implement `GaAttendanceForm.jsx`**

```js
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { formatDate } from "@/lib/prayerSlots";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { shownRoster, cleanVisitors, isAttendanceAdmin } from "@/lib/gaAttendance";
import { fetchAttendance, saveAttendance, deleteAttendance } from "@/lib/gaAttendanceData";
import ConfirmDelete from "@/components/ConfirmDelete";

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const isoDay = (ts) => String(ts || "").slice(0, 10);

// One attendance (GA + date + service). Remounted by the tab (key) whenever any of the three changes, so it always
// starts from what the database has.
export default function GaAttendanceForm({ ga, date, type, roster, canSave, lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, members = [], notify } = useAppDataContext() || {};
  const [row, setRow] = useState(undefined);        // undefined = loading, null = none yet
  const [loadErr, setLoadErr] = useState(false);
  const [present, setPresent] = useState(() => new Set());
  const [visitors, setVisitors] = useState([]);
  const [visitor, setVisitor] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchAttendance(ga.id, date, type).then(({ data, error }) => {
      if (!live) return;
      if (error) { setLoadErr(true); return; }
      setLoadErr(false);
      setRow(data);
      setPresent(new Set(data?.present_ids || []));
      setVisitors(data?.visitors || []);
      setNotes(data?.notes || "");
    });
    return () => { live = false; };
  }, [ga.id, date, type, attempt]);

  const list = useMemo(() => shownRoster(row, roster, members), [row, roster, members]);
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };

  if (loadErr) {
    return (
      <div role="alert" style={{ color: "var(--muted)", padding: "16px 0" }}>
        {tt.gaErrLoad} <button className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>{tt.gaRetry}</button>
      </div>
    );
  }
  if (row === undefined) return <p style={{ color: "var(--muted)" }}>…</p>;

  const toggle = (id) => setPresent((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = list.length > 0 && list.every((m) => present.has(m.id));
  const addVisitor = () => { setVisitors((v) => cleanVisitors([...v, visitor])); setVisitor(""); };

  const save = async () => {
    setSaving(true);
    const actor = staffActor(user);
    const { data, error } = await saveAttendance({
      ga_id: ga.id, church: ga.church, service_date: date, service_type: type,
      roster_ids: list.map((m) => m.id), present_ids: [...present], visitors, notes,
      entered_by_user_id: user?.id ?? null, entered_by_name: actor?.name || user?.name || "—",
    });
    setSaving(false);
    if (error) { notify?.(`${tt.gaErrSave} (${error})`); return; }
    setRow(data);
    notify?.(tt.gaSaved);
    logAuditEvent({ actor, action: "ga_attendance_saved", entityType: "ga_attendance", entityId: data.id,
      entityLabel: `${ga.name} · ${date} · ${type}`, details: { present: data.present_ids?.length || 0, roster: data.roster_ids?.length || 0, visitors: data.visitors?.length || 0 } });
  };

  const remove = async () => {
    setDeleting(false);
    const { error } = await deleteAttendance(row.id);
    if (error) { notify?.(`${tt.gaErrSave} (${error})`); return; }
    logAuditEvent({ actor: staffActor(user), action: "ga_attendance_deleted", entityType: "ga_attendance", entityId: row.id, entityLabel: `${ga.name} · ${date} · ${type}` });
    setRow(null); setPresent(new Set()); setVisitors([]); setNotes("");
    notify?.(tt.gaDeleted);
  };

  const field = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" };

  return (
    <div>
      {row && <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>{fill(tt.gaRecordedBy, { name: row.entered_by_name, date: formatDate(isoDay(row.updated_at), lang) })}</p>}

      {list.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{tt.gaNoMembers}</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <button className="btn btn-ghost" onClick={() => setPresent(allOn ? new Set() : new Set(list.map((m) => m.id)))}>{allOn ? tt.gaUnmarkAll : tt.gaMarkAll}</button>
          </div>
          {list.map((m) => {
            const name = m.name || tt.gaRemovedMember;
            return (
              <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", minHeight: 48, borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                <input type="checkbox" aria-label={name} checked={present.has(m.id)} onChange={() => toggle(m.id)} style={{ width: 22, height: 22 }} />
                <span style={{ color: m.name ? "var(--text)" : "var(--muted)" }}>{name}</span>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <strong style={{ fontSize: 14 }}>{tt.gaVisitors}</strong>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input value={visitor} placeholder={tt.gaVisitorName} maxLength={120} onChange={(e) => setVisitor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVisitor(); } }} style={{ ...field, flex: 1 }} />
          <button className="btn btn-ghost" disabled={!visitor.trim()} onClick={addVisitor}>{tt.gaAddVisitor}</button>
        </div>
        {visitors.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {visitors.map((v) => (
              <li key={v} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 999, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 13 }}>
                {v}
                <button className="btn btn-ghost" aria-label={fill(tt.gaRemoveVisitor, { name: v })} onClick={() => setVisitors((list2) => list2.filter((x) => x !== v))} style={{ padding: 2 }}><X size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <textarea value={notes} placeholder={tt.gaNotes} aria-label={tt.gaNotes} maxLength={2000} onChange={(e) => setNotes(e.target.value)}
        style={{ ...field, width: "100%", minHeight: 64, marginTop: 16, boxSizing: "border-box" }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontSize: 13, color: "var(--muted)", flex: 1 }}>
          {fill(tt.gaCount, { present: list.filter((m) => present.has(m.id)).length, total: list.length, visitors: visitors.length })}
        </span>
        {row && isAttendanceAdmin(user) && <button className="btn btn-ghost" onClick={() => setDeleting(true)}>{tt.gaDelete}</button>}
        <button className="btn btn-primary" disabled={!canSave || saving || list.length === 0} onClick={save}>{saving ? tt.gaSaving : tt.gaSave}</button>
      </div>

      {deleting && (
        <ConfirmDelete label={fill(tt.gaDeleteLabel, { date: formatDate(date, lang), type: typeLabel[type] || type })}
          onConfirm={remove} onCancel={() => setDeleting(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/test/gaAttendanceTab.test.jsx`
Expected: PASS. (If `formatDate(isoDay("2026-11-01T15:00:00Z"))` gives `01/11/2026`, the "Lançada por" assertion holds.)

- [ ] **Step 7: Lint and commit**

```bash
npx eslint src/sections/assistance/GaAttendanceTab.jsx src/sections/assistance/GaAttendanceForm.jsx src/test/gaAttendanceTab.test.jsx
git add src/sections/assistance/GaAttendanceTab.jsx src/sections/assistance/GaAttendanceForm.jsx src/test/gaAttendanceTab.test.jsx src/i18n/strings.js
git commit -m "GA attendance: take attendance (members, visitors, notes)"
```

If `react-hooks/set-state-in-effect` flags the `setState` calls inside `.then(...)` in the effect, they are already asynchronous; check the rule's message — the fix is to move the four setters into one `apply(data)` function declared outside the effect and call it from `.then`.

---

### Task 6: Acompanhamento view — `GaFollowUp`

**Files:**
- Create: `src/sections/assistance/GaFollowUp.jsx`
- Modify: `src/sections/assistance/GaAttendanceTab.jsx` (render it for `view === "follow"`)
- Modify: `src/i18n/strings.js`
- Test: append to `src/test/gaAttendanceTab.test.jsx`

**Interfaces:**
- Consumes: `listAttendance(gaId, from)` (Task 3); `followUp`, `sinceLabel`, `addDays`, `HISTORY_WEEKS` (Task 2); `todayLocal`.
- Produces: `GaFollowUp({ ga, roster, lang })`.

- [ ] **Step 1: Strings** — pt:

```js
    gaCareFirst: "Para cuidar primeiro",
    gaCareHint: "Sem presença nas 3 últimas chamadas. Uma visita ou ligação pode fazer diferença.",
    gaLastPresence: "Última presença: {when}",
    gaNoAttendance: "Ainda não há chamadas deste grupo. Faça a primeira na aba Chamada.",
    gaLegend: "● presente · ○ sem presença · – ainda não era do grupo · mais recente à direita",
    gaMarkPresent: "presente", gaMarkAbsent: "sem presença", gaMarkNone: "ainda não era do grupo",
```

en:

```js
    gaCareFirst: "Reach out first",
    gaCareHint: "No attendance at the last 3 services. A visit or a call can make a difference.",
    gaLastPresence: "Last attended: {when}",
    gaNoAttendance: "No attendance taken for this group yet. Take the first one in Take attendance.",
    gaLegend: "● present · ○ not present · – not in the group yet · most recent on the right",
    gaMarkPresent: "present", gaMarkAbsent: "not present", gaMarkNone: "not in the group yet",
```

- [ ] **Step 2: Failing tests** (append inside a new describe in `src/test/gaAttendanceTab.test.jsx`)

```js
describe("GaAttendanceTab — Acompanhamento", () => {
  it("lists who to reach out to first, with gentle wording", async () => {
    listA.mockResolvedValue({ data: [
      { service_date: "2026-10-11", service_type: "noite", roster_ids: ["a", "b"], present_ids: ["a", "b"] },
      { service_date: "2026-10-18", service_type: "noite", roster_ids: ["a", "b"], present_ids: ["a"] },
      { service_date: "2026-10-25", service_type: "noite", roster_ids: ["a", "b"], present_ids: ["a"] },
      { service_date: "2026-11-01", service_type: "ebd", roster_ids: ["a", "b"], present_ids: ["a"] },
    ], error: null });
    renderTab(leader);
    fireEvent.click(screen.getByText("Acompanhamento"));
    await waitFor(() => expect(listA).toHaveBeenCalledWith("g1", "2026-05-03"));
    expect(await screen.findByText("Para cuidar primeiro")).toBeTruthy();
    expect(screen.getAllByText("Última presença: há 3 semanas").length).toBeGreaterThan(0); // Bruno, 21 days
    expect(screen.getAllByText("Última presença: hoje").length).toBeGreaterThan(0);          // Ana
    expect(document.body.textContent).not.toMatch(/falt/i);
  });

  it("says so when there is no attendance yet", async () => {
    renderTab(leader);
    fireEvent.click(screen.getByText("Acompanhamento"));
    expect(await screen.findByText("Ainda não há chamadas deste grupo. Faça a primeira na aba Chamada.")).toBeTruthy();
  });
});
```

(`2026-11-01` − 26×7 = 182 days = `2026-05-03`.)

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/test/gaAttendanceTab.test.jsx -t Acompanhamento`
Expected: FAIL.

- [ ] **Step 4: Implement `GaFollowUp.jsx`**

```js
import { useEffect, useMemo, useState } from "react";
import { STRINGS } from "@/i18n/strings";
import { todayLocal } from "@/lib/prayerSlots";
import { followUp, sinceLabel, addDays, HISTORY_WEEKS } from "@/lib/gaAttendance";
import { listAttendance } from "@/lib/gaAttendanceData";

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const DOT = { present: "●", absent: "○", none: "–" };

// Who of the group has not been coming lately, so the leader can reach out — care, not a roll of shame.
export default function GaFollowUp({ ga, roster, lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const today = todayLocal();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    listAttendance(ga.id, addDays(today, -HISTORY_WEEKS * 7)).then(({ data, error: err }) => {
      if (!live) return;
      setError(!!err);
      setRows(data);
    });
    return () => { live = false; };
  }, [ga.id, today, attempt]);

  const people = useMemo(() => (rows ? followUp(rows, roster, today) : []), [rows, roster, today]);
  const label = { present: tt.gaMarkPresent, absent: tt.gaMarkAbsent, none: tt.gaMarkNone };

  if (error) return <div role="alert" style={{ color: "var(--muted)" }}>{tt.gaErrLoad} <button className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>{tt.gaRetry}</button></div>;
  if (!rows) return <p style={{ color: "var(--muted)" }}>…</p>;
  if (rows.length === 0) return <p style={{ color: "var(--muted)", padding: "24px 0" }}>{tt.gaNoAttendance}</p>;

  const care = people.filter((p) => p.needsCare);
  const line = (p) => (
    <div key={p.member.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 600 }}>{p.member.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.since === null ? tt.gaNeverPresent : fill(tt.gaLastPresence, { when: sinceLabel(p.since, tt) })}</div>
      </div>
      <div aria-label={[...p.recent].reverse().map((m) => label[m]).join(", ")} style={{ letterSpacing: 4, fontSize: 15, color: "#0f766e" }}>
        {[...p.recent].reverse().map((m, i) => <span key={i} title={label[m]}>{DOT[m]}</span>)}
      </div>
    </div>
  );

  return (
    <div>
      {care.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 16, borderLeft: "4px solid #b45309" }}>
          <div style={{ padding: "12px 14px" }}>
            <strong>{tt.gaCareFirst}</strong>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{tt.gaCareHint}</div>
          </div>
          {care.map(line)}
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>{people.map(line)}</div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{tt.gaLegend}</p>
    </div>
  );
}
```

`GaAttendanceTab.jsx`: `import GaFollowUp from "./GaFollowUp";` and replace `{view === "follow" && null}` with

```js
      {view === "follow" && <GaFollowUp key={ga.id} ga={ga} roster={roster} lang={lang} />}
```

Note: a member with `since === null` prints `gaNeverPresent` alone (not "Última presença: Ainda sem…").

- [ ] **Step 5: Run all GA tests**

Run: `npx vitest run src/test/gaAttendance.test.js src/test/gaAttendanceData.test.js src/test/gaAttendanceTab.test.jsx`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/sections/assistance/GaFollowUp.jsx src/sections/assistance/GaAttendanceTab.jsx src/test/gaAttendanceTab.test.jsx
git add src/sections/assistance/GaFollowUp.jsx src/sections/assistance/GaAttendanceTab.jsx src/test/gaAttendanceTab.test.jsx src/i18n/strings.js
git commit -m "GA attendance: follow-up (last presence, last 8, reach out first)"
```

---

### Task 7: Docs, full test run, migration (with OK), browser check, PR

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`, first bullet), `CLAUDE.md` (route table `/assistance` row; Supabase tables list adds `ga_attendance`)

- [ ] **Step 1: CHANGELOG bullet** (top of `### Added` under `[Unreleased]`)

```markdown
- **Assistência › Chamada do GA** — the GA leader marks which members of their group were at each church service (church of the group + date + EBD/Noite, as in the Frequência), for today or up to 14 days back, with visitors by name and an optional note; an attendance already taken opens filled in ("Lançada por …") and saving updates it. **Acompanhamento** shows each member's last attendance ("Última presença: há 3 semanas") and the group's last 8 attendances (● / ○ / –), with **Para cuidar primeiro** on top for whoever has not been at the last 3 — to care for them, never to accuse. Only GA leaders (their own groups) and admins (every group, any past date, can delete) see it; pastors and clerks keep the Frequência. Saves and deletes go to the audit log. Table `ga_attendance` (migration 047; roster, present and visitors as arrays, so later group changes never rewrite history). `src/lib/gaAttendance.js` (rules; tests in `src/test/gaAttendance.test.js`), `src/lib/gaAttendanceData.js` (tests in `src/test/gaAttendanceData.test.js`), `GaAttendanceTab` / `GaAttendanceForm` / `GaFollowUp` (tests in `src/test/gaAttendanceTab.test.jsx`). GA leaders now get the Assistência card.
```

- [ ] **Step 2: CLAUDE.md** — `/assistance` row: `AssistanceSection — Assistência/Care: Frequência (service census; admin, clerk, pastor) and Chamada do GA (GA attendance; admin, ga_leader, own groups) tabs; visits and prayer requests to come`. Tables list: append `, ga_attendance`.

- [ ] **Step 3: Full test suite**

Run: `npm run test`
Expected: all pass. Report any failure verbatim; fix only failures caused by this branch.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit docs**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "GA attendance: changelog and CLAUDE.md"
```

- [ ] **Step 6: Ask the user for the OK to apply migration 047 to production** (Supabase MCP `apply_migration`, name `047_ga_attendance`). Do not apply without an explicit yes. After applying, verify:

```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'ga_attendance';  -- must be false
SELECT conname FROM pg_constraint WHERE conrelid = 'ga_attendance'::regclass ORDER BY 1;
```

- [ ] **Step 7: Browser check** — `preview_start` the dev server (`.claude/launch.json`), sign in as the seed GA leader (Leonard Alves, GA001), open Assistência: only "Chamada do GA" tab; mark two members, add a visitor, save; reopen → "Lançada por"; Acompanhamento renders; mobile width (375px) has no horizontal scroll; switch to EN. Then as the seed admin: both tabs, group picker by church. Screenshot as proof. If the dev build does not reach Supabase with the seed users, say so and report what was verified.

- [ ] **Step 8: Push and open the PR** (`gh pr create --base main`), body summarising the feature, the migration (applied or pending), tests and the browser check; end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `ccd_pr get_status` / `bind_pr`.
