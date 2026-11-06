# Culto Profético Responsible Groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins and secretaries keep a weekly Day → Group → Leader table per church; the praise-list form fills in "Grupo Responsável" from it and shows the group's leader and workers.

**Architecture:** Three new Supabase tables (groups, workers, weekly schedule). Pure rules in `src/lib/serviceGroups.js`, Supabase access in `src/lib/serviceGroupsData.js`. A new "Grupos" tab in `WorshipSection` edits them; `ServiceListForm` (public + staff) and `WorshipListSharedView` read them. Saved lists keep storing plain text in `worship_lists.group_name`.

**Tech Stack:** React 18 + Vite, Supabase JS client (`sb` from `@/lib/supabase`), Vitest + Testing Library, lucide-react icons, inline styles with CSS variables.

**Spec:** `docs/superpowers/specs/2026-11-05-prophetic-service-groups-design.md`

## Global Constraints

- Slots are exactly: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `ebd`, `noite`.
- `church` is the church display text (e.g. `"Newark, NJ"`), same as `worship_lists.church`.
- Every new table: `DISABLE ROW LEVEL SECURITY` + `GRANT ALL PRIVILEGES ... TO anon, authenticated, service_role`.
- Every UPDATE/DELETE that must change a row is chained with `.select()` and an empty result is a failure.
- Mutations are optimistic-first in staff UI; failures are toasted with `notify`.
- Every UI string has PT and EN entries in `src/i18n/strings.js`.
- The public page never reads `members`; it reads only the names stored on the group tables.
- "Dirigente do louvor" (`leader` on `worship_lists`) is never auto-filled.
- A saved list keeps its own `group_name`; auto-fill only touches a list not yet saved.
- Edit rights: `admin` any church; `clerk` only churches in their scope. Everyone else read-only.
- Every change gets a CHANGELOG entry under `[Unreleased]`.
- Paths use the `@/` alias for `src/`.
- Code, comments and docs in English.

## Review Focus

1. **Date/church change after auto-fill on an unsaved list** — the auto-filled group of Monday must not stick when the user moves to Tuesday or another church; it is replaced by the new slot's group, or cleared when the new slot has none. (Test in Task 4.)
2. **Group typed with different case/accents** (`"newark 2"` vs `"Newark 2"`) — still counts as the scheduled group, so Líder/Obreiros stay visible. (Test in Task 4.)
3. **Inactive group still on the schedule** — nothing is auto-filled and the admin table marks it "(inativo)". (Tests in Tasks 2 and 3.)
4. **Group tables missing / fetch fails** (migration not applied yet) — the form behaves exactly as today, no error shown. (Test in Task 4.)
5. **Clerk scope matched by city** — a clerk whose `church` is `"Newark, NJ"` can edit `"Newark, NJ"` only; a clerk with no church can edit nothing. (Test in Task 2.)

---

## File map

| File | Responsibility |
|---|---|
| `migrations/048_service_groups.sql` (create) | Three tables, indexes, RLS off, grants |
| `src/lib/serviceGroups.js` (create) | Pure rules: slots, slot for a date, group for a service, validation, edit scope |
| `src/lib/serviceGroupsData.js` (create) | Supabase reads/writes for the three tables |
| `src/sections/worship/ServiceGroupsTab.jsx` (create) | Church picker, weekly schedule table, group cards |
| `src/sections/worship/ServiceGroupForm.jsx` (create) | Create/edit form with member pickers |
| `src/sections/worship/WorshipSection.jsx` (modify) | Two tabs: Listas / Grupos |
| `src/views/WorshipListPublicView.jsx` (modify) | Auto-fill group, show Líder + Obreiros |
| `src/views/WorshipListSharedView.jsx` (modify) | Show "· Líder: X" when the list's group is the scheduled one |
| `src/i18n/strings.js` (modify) | PT/EN strings |
| `src/test/serviceGroups.test.js`, `src/test/serviceGroupsData.test.js`, `src/test/serviceGroupsTab.test.jsx`, `src/test/worshipListGroupAutofill.test.jsx` (create) | Tests |
| Six existing worship tests (modify) | Mock `@/lib/serviceGroupsData` |
| `CHANGELOG.md`, `CLAUDE.md`, `migrations/README.md` (modify) | Docs |

---

### Task 1: Migration 048

**Files:**
- Create: `migrations/048_service_groups.sql`
- Modify: `migrations/README.md` (migration table), `CLAUDE.md` (Supabase Tables list), `CHANGELOG.md` (`### Database` under `[Unreleased]`)

**Interfaces:**
- Produces: tables `service_groups(id, church, name, leader_member_id, leader_name, is_active, created_at)`, `service_group_workers(id, group_id, member_id, name, position)`, `service_group_schedule(church, slot, group_id)` with PK `(church, slot)`.

- [ ] **Step 1: Write the migration**

```sql
-- Culto Profético › Grupos: which group is responsible for each prophetic service, per church.
-- service_groups          one row per group of a church (name + leader picked from the directory; the name is
--                         copied so the public page never reads members).
-- service_group_workers   the group's workers (member_id + copied name), in order.
-- service_group_schedule  fixed weekly table: one group per church and slot
--                         (mon, tue, wed, thu, fri, sat, ebd = Sunday morning, noite = Sunday night).
CREATE TABLE IF NOT EXISTS service_groups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church            text        NOT NULL CHECK (char_length(church) BETWEEN 1 AND 120),
  name              text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  leader_member_id  text        REFERENCES members(id) ON DELETE SET NULL,
  leader_name       text        CHECK (leader_name IS NULL OR char_length(leader_name) <= 120),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_groups_name_uniq ON service_groups (church, lower(name));

CREATE TABLE IF NOT EXISTS service_group_workers (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid    NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  member_id  text    REFERENCES members(id) ON DELETE SET NULL,
  name       text    NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  position   integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS service_group_workers_uniq ON service_group_workers (group_id, lower(name));

CREATE TABLE IF NOT EXISTS service_group_schedule (
  church    text NOT NULL,
  slot      text NOT NULL CHECK (slot IN ('mon','tue','wed','thu','fri','sat','ebd','noite')),
  group_id  uuid NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (church, slot)
);

ALTER TABLE service_groups          DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_group_workers   DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_group_schedule  DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON service_groups, service_group_workers, service_group_schedule
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Docs**

In `migrations/README.md`, add a row to the migration table (after the last `| \`0xx_...` row):

```
| `048_service_groups.sql` | Creates `service_groups`, `service_group_workers`, `service_group_schedule` for Culto Profético › Grupos (RLS disabled). Apply before deploying; the list form works without it. |
```

In `CLAUDE.md`, append `, \`service_groups\`, \`service_group_workers\`, \`service_group_schedule\`` to the Supabase Tables line (after `` `service_census` ``).

In `CHANGELOG.md` under `[Unreleased]` → `### Database` (first one, line ~85), add:

```
- `migrations/048_service_groups.sql` — creates `service_groups`, `service_group_workers` and `service_group_schedule` (one group per church and weekly slot: mon–sat, ebd, noite; RLS disabled). Apply before the deploy; until then the praise-list form simply has no auto-filled group.
```

- [ ] **Step 3: Commit**

```bash
git add migrations/048_service_groups.sql migrations/README.md CLAUDE.md CHANGELOG.md
git commit -m "Migration 048: Culto Profético responsible groups tables"
```

(Applying the migration to the live Supabase project is a separate step done with the user's go-ahead — see Task 7.)

---

### Task 2: Pure rules — `src/lib/serviceGroups.js`

**Files:**
- Create: `src/lib/serviceGroups.js`
- Test: `src/test/serviceGroups.test.js`

**Interfaces:**
- Consumes: `norm` from `@/lib/praiseLists`; `cityOf`, `scopeFor` from `@/lib/directoryStats`.
- Produces:
  - `SLOTS: string[]`
  - `slotFor(date: "YYYY-MM-DD", serviceType: "ebd"|"noite"|"outro"): string|null`
  - `groupForService(data: {groups, workers, schedule}, church: string, date: string, serviceType: string): {group, leaderName: string, workerNames: string[]} | null`
  - `sameGroupName(a: string, b: string): boolean`
  - `validateGroup(form: {id?, church, name}, groups: object[]): null | "sgNameRequired" | "sgNameTaken"`
  - `editableChurches(user, churchNames: string[]): string[]`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { SLOTS, slotFor, groupForService, sameGroupName, validateGroup, editableChurches } from "@/lib/serviceGroups";

const G1 = { id: "g1", church: "Newark, NJ", name: "Newark 1", leader_name: "Ana", is_active: true };
const G2 = { id: "g2", church: "Newark, NJ", name: "Newark 2", leader_name: "Bia", is_active: false };
const DATA = {
  groups: [G1, G2],
  workers: [
    { id: "w2", group_id: "g1", name: "Caio", position: 1 },
    { id: "w1", group_id: "g1", name: "Davi", position: 0 },
    { id: "w3", group_id: "g2", name: "Eva", position: 0 },
  ],
  schedule: [
    { church: "Newark, NJ", slot: "mon", group_id: "g1" },
    { church: "Newark, NJ", slot: "ebd", group_id: "g1" },
    { church: "Newark, NJ", slot: "tue", group_id: "g2" },
  ],
};

describe("slotFor", () => {
  it("maps weekdays to their slot", () => {
    expect(slotFor("2026-11-02", "noite")).toBe("mon");
    expect(slotFor("2026-11-03", "noite")).toBe("tue");
    expect(slotFor("2026-11-04", "noite")).toBe("wed");
    expect(slotFor("2026-11-05", "noite")).toBe("thu");
    expect(slotFor("2026-11-06", "noite")).toBe("fri");
    expect(slotFor("2026-11-07", "noite")).toBe("sat");
  });
  it("splits Sunday into EBD and Noite", () => {
    expect(slotFor("2026-11-08", "ebd")).toBe("ebd");
    expect(slotFor("2026-11-08", "noite")).toBe("noite");
    expect(slotFor("2026-11-08", "outro")).toBe("noite");
  });
  it("returns null for a bad date", () => {
    expect(slotFor("", "noite")).toBeNull();
  });
  it("lists the eight slots in order", () => {
    expect(SLOTS).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "ebd", "noite"]);
  });
});

describe("groupForService", () => {
  it("returns the scheduled group with its leader and ordered workers", () => {
    const r = groupForService(DATA, "Newark, NJ", "2026-11-02", "noite");
    expect(r.group.id).toBe("g1");
    expect(r.leaderName).toBe("Ana");
    expect(r.workerNames).toEqual(["Davi", "Caio"]);
  });
  it("uses the EBD slot on Sunday morning", () => {
    expect(groupForService(DATA, "Newark, NJ", "2026-11-08", "ebd").group.id).toBe("g1");
    expect(groupForService(DATA, "Newark, NJ", "2026-11-08", "noite")).toBeNull();
  });
  it("returns null for an empty slot, another church, or no church", () => {
    expect(groupForService(DATA, "Newark, NJ", "2026-11-04", "noite")).toBeNull();
    expect(groupForService(DATA, "New York, NY", "2026-11-02", "noite")).toBeNull();
    expect(groupForService(DATA, "", "2026-11-02", "noite")).toBeNull();
  });
  it("ignores an inactive group on the schedule", () => {
    expect(groupForService(DATA, "Newark, NJ", "2026-11-03", "noite")).toBeNull();
  });
  it("returns null when the scheduled group no longer exists", () => {
    const data = { ...DATA, schedule: [{ church: "Newark, NJ", slot: "mon", group_id: "gone" }] };
    expect(groupForService(data, "Newark, NJ", "2026-11-02", "noite")).toBeNull();
  });
  it("tolerates missing data", () => {
    expect(groupForService(null, "Newark, NJ", "2026-11-02", "noite")).toBeNull();
  });
});

describe("sameGroupName", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(sameGroupName("  newark   2 ", "Newark 2")).toBe(true);
    expect(sameGroupName("Grupo São Paulo", "grupo sao paulo")).toBe(true);
    expect(sameGroupName("Newark 1", "Newark 2")).toBe(false);
    expect(sameGroupName("", "Newark 2")).toBe(false);
  });
});

describe("validateGroup", () => {
  it("requires a name", () => {
    expect(validateGroup({ church: "Newark, NJ", name: "  " }, [])).toBe("sgNameRequired");
  });
  it("refuses a name already used in the same church, but not in another", () => {
    expect(validateGroup({ church: "Newark, NJ", name: "newark 1" }, [G1])).toBe("sgNameTaken");
    expect(validateGroup({ church: "New York, NY", name: "Newark 1" }, [G1])).toBeNull();
  });
  it("lets a group keep its own name when edited", () => {
    expect(validateGroup({ id: "g1", church: "Newark, NJ", name: "Newark 1" }, [G1])).toBeNull();
  });
});

describe("editableChurches", () => {
  const ALL = ["Newark, NJ", "New York, NY", "Philadelphia, PA"];
  it("gives admins every church", () => {
    expect(editableChurches({ sysRoles: ["admin"] }, ALL)).toEqual(ALL);
  });
  it("gives a clerk only the church of their account, matched by city", () => {
    expect(editableChurches({ sysRoles: ["clerk"], church: "Newark, NJ" }, ALL)).toEqual(["Newark, NJ"]);
    expect(editableChurches({ sysRole: "clerk", church: "Newark" }, ALL)).toEqual(["Newark, NJ"]);
  });
  it("gives a clerk with a church list exactly those", () => {
    expect(editableChurches({ sysRoles: ["clerk"], churches: ["New York, NY", "Philadelphia, PA"] }, ALL)).toEqual(["New York, NY", "Philadelphia, PA"]);
  });
  it("gives nothing to a clerk without a church, or to other roles", () => {
    expect(editableChurches({ sysRoles: ["clerk"] }, ALL)).toEqual([]);
    expect(editableChurches({ sysRoles: ["pastor"], church: "Newark, NJ" }, ALL)).toEqual([]);
    expect(editableChurches(null, ALL)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/test/serviceGroups.test.js`
Expected: FAIL — cannot resolve `@/lib/serviceGroups`.

- [ ] **Step 3: Implement**

```js
// Culto Profético › Grupos: pure rules for the weekly responsible-group table.
import { norm } from "@/lib/praiseLists";
import { cityOf, scopeFor } from "@/lib/directoryStats";

// One responsible group per church and slot. Sunday has two services (EBD in the morning, Noite at night).
export const SLOTS = ["mon", "tue", "wed", "thu", "fri", "sat", "ebd", "noite"];
const WEEKDAY_SLOT = [null, "mon", "tue", "wed", "thu", "fri", "sat"];

// Slot of a service: Sunday by service type (anything but "ebd" is the Noite), other days by weekday.
export function slotFor(date, serviceType) {
  const [y, m, d] = String(date).split("-").map(Number);
  if (!y || !m || !d) return null;
  const weekday = new Date(y, m - 1, d).getDay();
  if (weekday === 0) return serviceType === "ebd" ? "ebd" : "noite";
  return WEEKDAY_SLOT[weekday];
}

// The group responsible for a church's service, with its leader and workers (in order); null when nobody is
// scheduled, the group is inactive or was deleted.
export function groupForService(data, church, date, serviceType) {
  const slot = slotFor(date, serviceType);
  if (!data || !church || !slot) return null;
  const row = (data.schedule || []).find((r) => r.church === church && r.slot === slot);
  const group = row && (data.groups || []).find((g) => g.id === row.group_id);
  if (!group || !group.is_active) return null;
  const workerNames = (data.workers || [])
    .filter((w) => w.group_id === group.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, "pt"))
    .map((w) => w.name);
  return { group, leaderName: group.leader_name || "", workerNames };
}

// "newark 2" is the same group as "Newark 2".
export const sameGroupName = (a, b) => !!norm(a) && norm(a) === norm(b);

// Error key (STRINGS) for a group form, or null when it can be saved. A group without a leader is valid.
export function validateGroup(form, groups = []) {
  const name = String(form?.name || "").trim();
  if (!name) return "sgNameRequired";
  const taken = groups.some((g) => g.id !== form.id && g.church === form.church && sameGroupName(g.name, name));
  return taken ? "sgNameTaken" : null;
}

const rolesOf = (user) => (user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean));

// Churches whose groups this user may edit: admins all, clerks those in their scope (by city), others none.
export function editableChurches(user, churchNames = []) {
  const roles = rolesOf(user);
  if (roles.includes("admin")) return churchNames;
  if (!roles.includes("clerk")) return [];
  const cities = scopeFor(user).cities.map((c) => c.toLowerCase());
  return churchNames.filter((c) => cities.includes(cityOf(c).toLowerCase()));
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/test/serviceGroups.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/serviceGroups.js src/test/serviceGroups.test.js
git commit -m "serviceGroups: slot, group-for-service, validation and edit-scope rules"
```

---

### Task 3: Data access + "Grupos" tab

**Files:**
- Create: `src/lib/serviceGroupsData.js`, `src/sections/worship/ServiceGroupsTab.jsx`, `src/sections/worship/ServiceGroupForm.jsx`
- Modify: `src/sections/worship/WorshipSection.jsx`, `src/i18n/strings.js`
- Test: `src/test/serviceGroupsData.test.js`, `src/test/serviceGroupsTab.test.jsx`

**Interfaces:**
- Consumes: everything from Task 2; `logAuditEvent`, `staffActor` from `@/lib/auditEvent`; `splitChurches` from `@/lib/prayerSlots`; `cityOf` from `@/lib/directoryStats`; `useAppDataContext()` → `{ user, notify, members, churches }`.
- Produces:
  - `fetchServiceGroups(church?: string): Promise<{ data: {groups, workers, schedule}, error }>`
  - `saveServiceGroup(group: {id?, church, name, leader_member_id, leader_name, is_active}, workers: {member_id, name}[]): Promise<{ data: {group, workers}|null, error }>`
  - `deleteServiceGroup(id: string): Promise<{ error }>`
  - `setScheduleSlot(church: string, slot: string, groupId: string|null): Promise<{ error }>`
  - strings `praiseGroupLeader`, `praiseGroupWorkers` (used by Tasks 4 and 5).

- [ ] **Step 1: Write the failing data test** (`src/test/serviceGroupsData.test.js`)

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable Supabase stand-in (same as doorData.test.jsx): each awaited query is recorded and answered by `handler`.
const calls = [];
let handler = () => ({ data: [], error: null });
vi.mock("@/lib/supabase", () => ({
  sb: {
    from: (table) => {
      const q = { table, op: null, args: null, filters: [] };
      const chain = {
        select: () => { if (!q.op) q.op = "select"; return chain; },
        insert: (rows) => { q.op = "insert"; q.args = rows; return chain; },
        update: (v) => { q.op = "update"; q.args = v; return chain; },
        delete: () => { q.op = "delete"; return chain; },
        upsert: (v) => { q.op = "upsert"; q.args = v; return chain; },
        eq: (k, v) => { q.filters.push([k, v]); return chain; },
        in: () => chain, order: () => chain, single: () => chain, maybeSingle: () => chain,
        then: (res, rej) => { calls.push(q); return Promise.resolve(handler(q)).then(res, rej); },
      };
      return chain;
    },
  },
}));

const { fetchServiceGroups, saveServiceGroup, deleteServiceGroup, setScheduleSlot } = await import("@/lib/serviceGroupsData");

beforeEach(() => { calls.length = 0; handler = () => ({ data: [], error: null }); });

describe("serviceGroupsData", () => {
  it("loads a church's groups, schedule and only those groups' workers", async () => {
    handler = (q) => ({
      service_groups: { data: [{ id: "g1", church: "Newark, NJ", name: "Newark 1" }], error: null },
      service_group_workers: { data: [{ group_id: "g1", name: "Ana" }, { group_id: "other", name: "Zé" }], error: null },
      service_group_schedule: { data: [{ church: "Newark, NJ", slot: "mon", group_id: "g1" }], error: null },
    }[q.table]);
    const { data, error } = await fetchServiceGroups("Newark, NJ");
    expect(error).toBeNull();
    expect(data.groups).toHaveLength(1);
    expect(data.workers.map((w) => w.name)).toEqual(["Ana"]);
    expect(data.schedule).toHaveLength(1);
    expect(calls.find((c) => c.table === "service_groups").filters).toContainEqual(["church", "Newark, NJ"]);
  });

  it("reports a load error with empty data", async () => {
    handler = () => ({ data: null, error: { message: "relation does not exist" } });
    const { data, error } = await fetchServiceGroups("Newark, NJ");
    expect(error).toBeTruthy();
    expect(data).toEqual({ groups: [], workers: [], schedule: [] });
  });

  it("creates a group and then its workers in order", async () => {
    handler = (q) => {
      if (q.table === "service_groups" && q.op === "insert") return { data: { id: "g9", ...q.args }, error: null };
      if (q.table === "service_group_workers" && q.op === "insert") return { data: q.args, error: null };
      return { data: [], error: null };
    };
    const { data, error } = await saveServiceGroup(
      { church: "Newark, NJ", name: " Newark 3 ", leader_member_id: "m1", leader_name: "Ana", is_active: true },
      [{ member_id: "m2", name: "Bia" }, { member_id: null, name: "Caio" }],
    );
    expect(error).toBeNull();
    expect(data.group.id).toBe("g9");
    const ins = calls.find((c) => c.table === "service_group_workers" && c.op === "insert");
    expect(ins.args).toEqual([
      { group_id: "g9", member_id: "m2", name: "Bia", position: 0 },
      { group_id: "g9", member_id: null, name: "Caio", position: 1 },
    ]);
    expect(calls.find((c) => c.table === "service_groups").args.name).toBe("Newark 3");
  });

  it("treats an update that changed no row as a failure", async () => {
    handler = (q) => (q.op === "update" ? { data: null, error: null } : { data: [], error: null });
    const { error } = await saveServiceGroup({ id: "g1", church: "Newark, NJ", name: "Newark 1", is_active: true }, []);
    expect(error).toBeTruthy();
  });

  it("treats a delete that removed nothing as a failure", async () => {
    handler = () => ({ data: [], error: null });
    expect((await deleteServiceGroup("g1")).error).toBeTruthy();
  });

  it("upserts a slot, and deletes it when the group is cleared", async () => {
    await setScheduleSlot("Newark, NJ", "mon", "g1");
    expect(calls[0]).toMatchObject({ table: "service_group_schedule", op: "upsert", args: { church: "Newark, NJ", slot: "mon", group_id: "g1" } });
    await setScheduleSlot("Newark, NJ", "mon", null);
    expect(calls[1]).toMatchObject({ table: "service_group_schedule", op: "delete" });
    expect(calls[1].filters).toEqual([["church", "Newark, NJ"], ["slot", "mon"]]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/test/serviceGroupsData.test.js`
Expected: FAIL — cannot resolve `@/lib/serviceGroupsData`.

- [ ] **Step 3: Implement `src/lib/serviceGroupsData.js`**

```js
import { sb } from "@/lib/supabase";

// Data access for Culto Profético › Grupos (staff tab) and the praise-list pages (read only).
const EMPTY = { groups: [], workers: [], schedule: [] };

// A church's groups, their workers and its weekly schedule. Without a church, every church's.
export async function fetchServiceGroups(church) {
  let groupsQ = sb.from("service_groups").select("*").order("name");
  let scheduleQ = sb.from("service_group_schedule").select("*");
  if (church) { groupsQ = groupsQ.eq("church", church); scheduleQ = scheduleQ.eq("church", church); }
  const [g, w, s] = await Promise.all([groupsQ, sb.from("service_group_workers").select("*").order("position"), scheduleQ]);
  const error = g.error || w.error || s.error || null;
  if (error) return { data: EMPTY, error };
  const ids = new Set((g.data || []).map((x) => x.id));
  return { data: { groups: g.data || [], workers: (w.data || []).filter((x) => ids.has(x.group_id)), schedule: s.data || [] }, error: null };
}

// Creates or updates a group, then replaces its workers (in the order given).
export async function saveServiceGroup(group, workers) {
  const row = {
    church: group.church,
    name: String(group.name || "").trim(),
    leader_member_id: group.leader_member_id || null,
    leader_name: group.leader_name ? String(group.leader_name).trim() : null,
    is_active: group.is_active !== false,
  };
  const res = group.id
    ? await sb.from("service_groups").update(row).eq("id", group.id).select().single()
    : await sb.from("service_groups").insert(row).select().single();
  if (res.error || !res.data) return { data: null, error: res.error || { message: "group not saved" } };
  const saved = res.data;
  if (group.id) {
    const del = await sb.from("service_group_workers").delete().eq("group_id", saved.id);
    if (del.error) return { data: null, error: del.error };
  }
  const rows = (workers || []).map((w, i) => ({ group_id: saved.id, member_id: w.member_id || null, name: String(w.name).trim(), position: i }));
  if (!rows.length) return { data: { group: saved, workers: [] }, error: null };
  const ins = await sb.from("service_group_workers").insert(rows).select();
  if (ins.error) return { data: null, error: ins.error };
  return { data: { group: saved, workers: ins.data || rows }, error: null };
}

export async function deleteServiceGroup(id) {
  const { data, error } = await sb.from("service_groups").delete().eq("id", id).select();
  if (error) return { error };
  return { error: data?.length ? null : { message: "group not found" } };
}

// Puts a group on a slot; null takes the slot's group away (deleting a slot that was empty is fine).
export async function setScheduleSlot(church, slot, groupId) {
  if (!groupId) {
    const { error } = await sb.from("service_group_schedule").delete().eq("church", church).eq("slot", slot).select();
    return { error };
  }
  const { data, error } = await sb.from("service_group_schedule").upsert({ church, slot, group_id: groupId }, { onConflict: "church,slot" }).select();
  if (error) return { error };
  return { error: data?.length ? null : { message: "slot not saved" } };
}
```

Note: in the "upserts a slot" test the default handler returns `{ data: [] }`; `setScheduleSlot` would then report an error, which the test does not check. That is intended — the test checks the call shape only.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/test/serviceGroupsData.test.js`
Expected: PASS.

- [ ] **Step 5: Add strings to `src/i18n/strings.js`**

In the `pt` block, after `praisePreacher: …` (near line 527), add:

```js
    praiseGroupLeader: "Líder",
    praiseGroupWorkers: "Obreiros",
    worshipTabLists: "Listas de louvores",
    worshipTabGroups: "Grupos",
    sgTitle: "Grupos responsáveis",
    sgChurch: "Igreja",
    sgSchedule: "Escala semanal",
    sgDay: "Dia",
    sgGroup: "Grupo",
    sgLeader: "Líder",
    sgNone: "—",
    sgSlotMon: "Segunda",
    sgSlotTue: "Terça",
    sgSlotWed: "Quarta",
    sgSlotThu: "Quinta",
    sgSlotFri: "Sexta",
    sgSlotSat: "Sábado",
    sgSlotEbd: "Domingo EBD",
    sgSlotNoite: "Domingo Noite",
    sgGroups: "Grupos",
    sgNewGroup: "Novo grupo",
    sgEdit: "Editar",
    sgDelete: "Excluir",
    sgDeleteConfirm: "Excluir o grupo {name}?",
    sgDeleteOnSchedule: "{name} está na escala ({days}). Excluir mesmo assim? Esses dias ficarão sem grupo.",
    sgInactive: "inativo",
    sgActive: "Ativo",
    sgName: "Nome do grupo",
    sgLeaderPick: "Líder (buscar no diretório)",
    sgWorkersPick: "Obreiros (buscar no diretório)",
    sgSearchHint: "Digite 2 letras ou mais",
    sgRemove: "Remover",
    sgSave: "Salvar",
    sgCancel: "Cancelar",
    sgSaveFailed: "Não foi possível salvar. Tente de novo.",
    sgLoadFailed: "Não foi possível carregar os grupos. Confirme que a migration 048 foi aplicada.",
    sgNameRequired: "Informe o nome do grupo.",
    sgNameTaken: "Já existe um grupo com esse nome nesta igreja.",
    sgReadOnly: "Somente leitura: apenas administradores e a secretaria da igreja alteram os grupos.",
    sgEmpty: "Nenhum grupo cadastrado nesta igreja.",
    sgNoWorkers: "Sem obreiros",
    sgPickChurch: "Escolha a igreja",
```

In the `en` block, after `praisePreacher: …` (near line 1409), add the same keys:

```js
    praiseGroupLeader: "Leader",
    praiseGroupWorkers: "Workers",
    worshipTabLists: "Praise lists",
    worshipTabGroups: "Groups",
    sgTitle: "Responsible groups",
    sgChurch: "Church",
    sgSchedule: "Weekly schedule",
    sgDay: "Day",
    sgGroup: "Group",
    sgLeader: "Leader",
    sgNone: "—",
    sgSlotMon: "Monday",
    sgSlotTue: "Tuesday",
    sgSlotWed: "Wednesday",
    sgSlotThu: "Thursday",
    sgSlotFri: "Friday",
    sgSlotSat: "Saturday",
    sgSlotEbd: "Sunday EBD",
    sgSlotNoite: "Sunday Night",
    sgGroups: "Groups",
    sgNewGroup: "New group",
    sgEdit: "Edit",
    sgDelete: "Delete",
    sgDeleteConfirm: "Delete the group {name}?",
    sgDeleteOnSchedule: "{name} is on the schedule ({days}). Delete anyway? Those days will have no group.",
    sgInactive: "inactive",
    sgActive: "Active",
    sgName: "Group name",
    sgLeaderPick: "Leader (search the directory)",
    sgWorkersPick: "Workers (search the directory)",
    sgSearchHint: "Type 2 letters or more",
    sgRemove: "Remove",
    sgSave: "Save",
    sgCancel: "Cancel",
    sgSaveFailed: "Could not save. Please try again.",
    sgLoadFailed: "Could not load the groups. Check that migration 048 was applied.",
    sgNameRequired: "Enter the group name.",
    sgNameTaken: "There is already a group with this name in this church.",
    sgReadOnly: "Read only: only admins and the church secretary change the groups.",
    sgEmpty: "No groups in this church yet.",
    sgNoWorkers: "No workers",
    sgPickChurch: "Choose the church",
```

- [ ] **Step 6: Write the failing tab test** (`src/test/serviceGroupsTab.test.jsx`)

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";
import { fetchServiceGroups, setScheduleSlot } from "@/lib/serviceGroupsData";

vi.mock("@/lib/serviceGroupsData", () => ({
  fetchServiceGroups: vi.fn(), saveServiceGroup: vi.fn(), deleteServiceGroup: vi.fn(), setScheduleSlot: vi.fn(),
}));
vi.mock("@/lib/auditEvent", () => ({ logAuditEvent: vi.fn(), staffActor: (u) => u }));

let ctx = {};
vi.mock("@/context/AppDataContext", () => ({ useAppDataContext: () => ctx }));

const { default: ServiceGroupsTab } = await import("@/sections/worship/ServiceGroupsTab");
const tt = STRINGS.pt;
const CHURCHES = [{ display: "Newark, NJ", is_hub: true }, { display: "New York, NY", is_hub: true }];
const DATA = {
  groups: [
    { id: "g1", church: "Newark, NJ", name: "Newark 1", leader_name: "Ana", is_active: true },
    { id: "g2", church: "Newark, NJ", name: "Newark 2", leader_name: "Bia", is_active: false },
  ],
  workers: [{ id: "w1", group_id: "g1", name: "Caio", position: 0 }],
  schedule: [{ church: "Newark, NJ", slot: "mon", group_id: "g1" }, { church: "Newark, NJ", slot: "tue", group_id: "g2" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchServiceGroups.mockResolvedValue({ data: DATA, error: null });
  setScheduleSlot.mockResolvedValue({ error: null });
});

describe("ServiceGroupsTab", () => {
  it("shows the weekly table with each slot's group and leader; inactive groups are flagged", async () => {
    ctx = { user: { sysRoles: ["admin"], church: "Newark, NJ" }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    const mon = await screen.findByTestId("sg-slot-mon");
    expect(within(mon).getByRole("combobox").value).toBe("g1");
    expect(within(mon).getByText("Ana")).toBeTruthy();
    expect(within(screen.getByTestId("sg-slot-tue")).getByText(new RegExp(tt.sgInactive))).toBeTruthy();
    expect(screen.getByText("Caio")).toBeTruthy();
  });

  it("saves a slot change for an admin", async () => {
    ctx = { user: { sysRoles: ["admin"] }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    const wed = await screen.findByTestId("sg-slot-wed");
    fireEvent.change(within(wed).getByRole("combobox"), { target: { value: "g1" } });
    await waitFor(() => expect(setScheduleSlot).toHaveBeenCalledWith("Newark, NJ", "wed", "g1"));
  });

  it("does not offer an inactive group for a slot that does not have it", async () => {
    ctx = { user: { sysRoles: ["admin"] }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    const wed = await screen.findByTestId("sg-slot-wed");
    const values = [...within(wed).getByRole("combobox").options].map((o) => o.value);
    expect(values).toEqual(["", "g1"]);
  });

  it("is read-only for a pastor", async () => {
    ctx = { user: { sysRoles: ["pastor"], church: "Newark, NJ" }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    expect(await screen.findByText(tt.sgReadOnly)).toBeTruthy();
    expect(within(screen.getByTestId("sg-slot-mon")).queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(tt.sgNewGroup)).toBeNull();
  });

  it("locks a clerk to their own church", async () => {
    ctx = { user: { sysRoles: ["clerk"], church: "New York, NY" }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    await waitFor(() => expect(fetchServiceGroups).toHaveBeenCalledWith("New York, NY"));
    expect(screen.getByLabelText(tt.sgChurch).disabled).toBe(true);
    expect(screen.getByText(tt.sgNewGroup)).toBeTruthy();
  });

  it("shows the migration hint when loading fails", async () => {
    fetchServiceGroups.mockResolvedValue({ data: { groups: [], workers: [], schedule: [] }, error: { message: "x" } });
    ctx = { user: { sysRoles: ["admin"] }, notify: vi.fn(), members: [], churches: CHURCHES };
    render(<ServiceGroupsTab lang="pt" />);
    expect(await screen.findByText(tt.sgLoadFailed)).toBeTruthy();
  });
});
```

- [ ] **Step 7: Run to see it fail**

Run: `npx vitest run src/test/serviceGroupsTab.test.jsx`
Expected: FAIL — cannot resolve `@/sections/worship/ServiceGroupsTab`.

- [ ] **Step 8: Implement `src/sections/worship/ServiceGroupForm.jsx`**

```jsx
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { norm } from "@/lib/praiseLists";
import { cityOf } from "@/lib/directoryStats";
import { validateGroup } from "@/lib/serviceGroups";

const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };

// Member search scoped to the group's church (by city). Picks set member_id + the member's name.
function MemberSearch({ id, label, members, church, exclude = [], onPick, tt }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (norm(q).length < 2) return [];
    const city = cityOf(church).toLowerCase();
    return members
      .filter((m) => cityOf(m.church).toLowerCase() === city && !exclude.includes(m.id) && norm(m.name).includes(norm(q)))
      .slice(0, 6);
  }, [q, members, church, exclude]);
  return (
    <div>
      <label style={labelStyle} htmlFor={id}>{label}</label>
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt.sgSearchHint} style={inputStyle} autoComplete="off" />
      {results.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, background: "var(--card)" }}>
          {results.map((m) => (
            <button key={m.id} type="button" onClick={() => { onPick(m); setQ(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Create / edit one group: name, leader, workers (ordered), active.
// initial: { id?, church, name, leader_member_id, leader_name, is_active, workers: [{ member_id, name }] }
export default function ServiceGroupForm({ initial, groups, members, tt, saving, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const workerIds = form.workers.map((w) => w.member_id).filter(Boolean);

  const submit = (e) => {
    e.preventDefault();
    const key = validateGroup(form, groups);
    if (key) { setError(tt[key]); return; }
    setError("");
    onSave(form);
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, padding: 16, border: "1.5px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
      <div>
        <label style={labelStyle} htmlFor="sg-name">{tt.sgName}</label>
        <input id="sg-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} maxLength={120} />
      </div>

      {form.leader_name ? (
        <div>
          <span style={labelStyle}>{tt.sgLeader}</span>
          <span style={{ fontSize: 14 }}>{form.leader_name}</span>{" "}
          <button type="button" className="btn btn-sm" onClick={() => setForm((f) => ({ ...f, leader_member_id: null, leader_name: "" }))} aria-label={tt.sgRemove}><X size={12} /></button>
        </div>
      ) : (
        <MemberSearch id="sg-leader" label={tt.sgLeaderPick} members={members} church={form.church} tt={tt}
          onPick={(m) => setForm((f) => ({ ...f, leader_member_id: m.id, leader_name: m.name }))} />
      )}

      <div>
        <MemberSearch id="sg-workers" label={tt.sgWorkersPick} members={members} church={form.church} exclude={workerIds} tt={tt}
          onPick={(m) => setForm((f) => ({ ...f, workers: [...f.workers, { member_id: m.id, name: m.name }] }))} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {form.workers.map((w, i) => (
            <span key={`${w.member_id || w.name}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 99, background: "var(--bg)", fontSize: 13 }}>
              {w.name}
              <button type="button" onClick={() => setForm((f) => ({ ...f, workers: f.workers.filter((_, j) => j !== i) }))} aria-label={`${tt.sgRemove} ${w.name}`} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, color: "var(--muted)" }}><X size={12} /></button>
            </span>
          ))}
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
        {tt.sgActive}
      </label>

      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{tt.sgSave}</button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>{tt.sgCancel}</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 9: Implement `src/sections/worship/ServiceGroupsTab.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAppDataContext } from "@/context/AppDataContext";
import { STRINGS, fill } from "@/i18n/strings";
import { splitChurches } from "@/lib/prayerSlots";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { SLOTS, editableChurches } from "@/lib/serviceGroups";
import { fetchServiceGroups, saveServiceGroup, deleteServiceGroup, setScheduleSlot } from "@/lib/serviceGroupsData";
import ServiceGroupForm from "./ServiceGroupForm";

const SLOT_KEYS = { mon: "sgSlotMon", tue: "sgSlotTue", wed: "sgSlotWed", thu: "sgSlotThu", fri: "sgSlotFri", sat: "sgSlotSat", ebd: "sgSlotEbd", noite: "sgSlotNoite" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };
const EMPTY = { groups: [], workers: [], schedule: [] };

// Culto Profético › Grupos: per church, the groups (leader + workers) and the fixed weekly table of who is
// responsible for each service. Admins edit any church, clerks their own; everyone else reads.
export default function ServiceGroupsTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, notify, members = [], churches = [] } = useAppDataContext() || {};
  const actor = staffActor(user);
  const allChurches = useMemo(() => { const { hubs, others } = splitChurches(churches); return [...hubs, ...others]; }, [churches]);
  const editable = useMemo(() => editableChurches(user, allChurches), [user, allChurches]);
  // A clerk only sees (and edits) the churches of their scope; admins and read-only profiles browse every church.
  const lockedToOwn = editable.length > 0 && editable.length < allChurches.length;
  const [church, setChurch] = useState(() => editable[0] || allChurches.find((c) => c === user?.church) || allChurches[0] || "");
  const canEdit = editable.includes(church);

  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(null); // initial values while the group form is open
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!church) return;
    let cancelled = false;
    setLoaded(false);
    fetchServiceGroups(church).then(({ data: d, error }) => {
      if (cancelled) return;
      setData(d || EMPTY);
      setLoadError(!!error);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [church]);

  const say = (text) => notify && notify(text);
  const groupById = useMemo(() => new Map(data.groups.map((g) => [g.id, g])), [data.groups]);
  const slotGroup = (slot) => groupById.get(data.schedule.find((r) => r.slot === slot)?.group_id) || null;
  const workersOf = (gid) => data.workers.filter((w) => w.group_id === gid).sort((a, b) => a.position - b.position);
  const slotsOf = (gid) => data.schedule.filter((r) => r.group_id === gid).map((r) => tt[SLOT_KEYS[r.slot]]);

  const changeSlot = async (slot, groupId) => {
    const prev = data.schedule;
    setData((d) => ({ ...d, schedule: [...d.schedule.filter((r) => r.slot !== slot), ...(groupId ? [{ church, slot, group_id: groupId }] : [])] }));
    const { error } = await setScheduleSlot(church, slot, groupId || null);
    if (error) { say(tt.sgSaveFailed); setData((d) => ({ ...d, schedule: prev })); return; }
    logAuditEvent({ actor, action: "service_group_schedule_set", entityType: "service_group_schedule", entityId: `${church}|${slot}`, entityLabel: `${church} · ${tt[SLOT_KEYS[slot]]}`, details: { church, slot, group: groupById.get(groupId)?.name || null } });
  };

  const openNew = () => setForm({ church, name: "", leader_member_id: null, leader_name: "", is_active: true, workers: [] });
  const openEdit = (g) => setForm({ ...g, leader_name: g.leader_name || "", workers: workersOf(g.id).map((w) => ({ member_id: w.member_id, name: w.name })) });

  const save = async (f) => {
    setSaving(true);
    const { data: res, error } = await saveServiceGroup(f, f.workers);
    setSaving(false);
    if (error) { say(tt.sgSaveFailed); return; }
    setData((d) => ({
      ...d,
      groups: [...d.groups.filter((g) => g.id !== res.group.id), res.group].sort((a, b) => a.name.localeCompare(b.name, "pt")),
      workers: [...d.workers.filter((w) => w.group_id !== res.group.id), ...res.workers],
    }));
    logAuditEvent({ actor, action: f.id ? "service_group_updated" : "service_group_created", entityType: "service_group", entityId: res.group.id, entityLabel: res.group.name, details: { church, leader: res.group.leader_name, workers: res.workers.map((w) => w.name), active: res.group.is_active } });
    setForm(null);
  };

  const remove = async (g) => {
    const days = slotsOf(g.id);
    const msg = days.length ? fill(tt.sgDeleteOnSchedule, { name: g.name, days: days.join(", ") }) : fill(tt.sgDeleteConfirm, { name: g.name });
    if (!window.confirm(msg)) return;
    const prev = data;
    setData((d) => ({ groups: d.groups.filter((x) => x.id !== g.id), workers: d.workers.filter((w) => w.group_id !== g.id), schedule: d.schedule.filter((r) => r.group_id !== g.id) }));
    const { error } = await deleteServiceGroup(g.id);
    if (error) { say(tt.sgSaveFailed); setData(prev); return; }
    logAuditEvent({ actor, action: "service_group_deleted", entityType: "service_group", entityId: g.id, entityLabel: g.name, details: { church, slots: days } });
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ maxWidth: 320 }}>
        <label style={labelStyle} htmlFor="sg-church">{tt.sgChurch}</label>
        <select id="sg-church" value={church} onChange={(e) => setChurch(e.target.value)} disabled={lockedToOwn && editable.length === 1} style={inputStyle}>
          {!church && <option value="">{tt.sgPickChurch}</option>}
          {(lockedToOwn ? editable : allChurches).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {!canEdit && <p style={{ fontSize: 13, color: "var(--muted)" }}>{tt.sgReadOnly}</p>}
      {loadError && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{tt.sgLoadFailed}</p>}

      {loaded && (
        <>
          <section>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{tt.sgSchedule}</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 8px" }}>{tt.sgDay}</th><th style={{ padding: "6px 8px" }}>{tt.sgGroup}</th><th style={{ padding: "6px 8px" }}>{tt.sgLeader}</th>
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot) => {
                  const g = slotGroup(slot);
                  const options = data.groups.filter((x) => x.is_active || x.id === g?.id);
                  return (
                    <tr key={slot} data-testid={`sg-slot-${slot}`} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px", fontWeight: 600 }}>{tt[SLOT_KEYS[slot]]}</td>
                      <td style={{ padding: "8px" }}>
                        {canEdit ? (
                          <select aria-label={`${tt.sgGroup} · ${tt[SLOT_KEYS[slot]]}`} value={g?.id || ""} onChange={(e) => changeSlot(slot, e.target.value)} style={inputStyle}>
                            <option value="">{tt.sgNone}</option>
                            {options.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_active ? "" : ` (${tt.sgInactive})`}</option>)}
                          </select>
                        ) : (
                          <span>{g ? `${g.name}${g.is_active ? "" : ` (${tt.sgInactive})`}` : tt.sgNone}</span>
                        )}
                      </td>
                      <td style={{ padding: "8px" }}>{g?.leader_name || tt.sgNone}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700 }}>{tt.sgGroups}</h3>
              {canEdit && !form && <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> {tt.sgNewGroup}</button>}
            </div>
            {form && <ServiceGroupForm key={form.id || "new"} initial={form} groups={data.groups} members={members} tt={tt} saving={saving} onSave={save} onCancel={() => setForm(null)} />}
            {data.groups.length === 0 && !form && <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.sgEmpty}</p>}
            <div style={{ display: "grid", gap: 10, marginTop: form ? 12 : 0 }}>
              {data.groups.map((g) => {
                const workers = workersOf(g.id);
                return (
                  <div key={g.id} style={{ padding: 14, border: "1.5px solid var(--border)", borderRadius: 12, background: "var(--card)", opacity: g.is_active ? 1 : 0.6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ fontWeight: 700 }}>{g.name}{g.is_active ? "" : ` (${tt.sgInactive})`}</p>
                        <p style={{ fontSize: 13, color: "var(--muted)" }}>{tt.sgLeader}: {g.leader_name || tt.sgNone}</p>
                      </div>
                      {canEdit && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => openEdit(g)} aria-label={`${tt.sgEdit} ${g.name}`}><Pencil size={14} /></button>
                          <button className="btn btn-sm" onClick={() => remove(g)} aria-label={`${tt.sgDelete} ${g.name}`}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {workers.length ? workers.map((w) => <span key={w.id} style={{ padding: "3px 10px", borderRadius: 99, background: "var(--bg)", fontSize: 13 }}>{w.name}</span>)
                        : <span style={{ fontSize: 13, color: "var(--muted)" }}>{tt.sgNoWorkers}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
```

Note: an inactive group is flagged only through its label (`"Newark 2 (inativo)"` in the option or the read-only text), so the "inactive flagged" test finds exactly one element in the `sg-slot-tue` row.

- [ ] **Step 10: Wire the tabs in `src/sections/worship/WorshipSection.jsx`**

Replace the whole file with:

```jsx
import { useState } from "react";
import PraiseListsTab from "./PraiseListsTab";
import ServiceGroupsTab from "./ServiceGroupsTab";
import { STRINGS } from "@/i18n/strings";

// Prophetic Service module (Culto Profético): service praise lists, song catalogue and history, plus the
// responsible groups of each service. Its own module on the Home — it used to be a tab of Schedules.
export default function WorshipSection({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const [tab, setTab] = useState("lists");
  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[["lists", tt.worshipTabLists], ["groups", tt.worshipTabGroups]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{ padding: "7px 18px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 700 : 500, fontFamily: "'Montserrat',sans-serif", background: tab === id ? "#7c3aed" : "var(--card)", color: tab === id ? "#fff" : "var(--muted)" }}>
              {label}
            </button>
          ))}
        </div>
        {tab === "lists" ? <PraiseListsTab lang={lang} /> : <ServiceGroupsTab lang={lang} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Run tests**

Run: `npx vitest run src/test/serviceGroupsTab.test.jsx src/test/serviceGroupsData.test.js`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/serviceGroupsData.js src/sections/worship/ServiceGroupsTab.jsx src/sections/worship/ServiceGroupForm.jsx src/sections/worship/WorshipSection.jsx src/i18n/strings.js src/test/serviceGroupsData.test.js src/test/serviceGroupsTab.test.jsx
git commit -m "Culto Profético: Grupos tab with weekly responsible-group schedule"
```

---

### Task 4: Auto-fill on the praise-list form

**Files:**
- Modify: `src/views/WorshipListPublicView.jsx` (imports; `ServiceListForm` state/effects ~lines 92–137; group field ~lines 293–296)
- Modify (mock only): `src/test/worshipListEditor.test.jsx`, `src/test/worshipListName.test.jsx`, `src/test/songNumberUi.test.jsx`, `src/test/catalogFilter.test.jsx`, `src/test/praiseMergeUi.test.jsx`
- Test: `src/test/worshipListGroupAutofill.test.jsx`

**Interfaces:**
- Consumes: `fetchServiceGroups` (Task 3), `groupForService`, `sameGroupName` (Task 2), strings `praiseGroupLeader`, `praiseGroupWorkers`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test** (`src/test/worshipListGroupAutofill.test.jsx`)

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceListForm } from "@/views/WorshipListPublicView";
import { fetchListsByDate } from "@/lib/praiseData";
import { fetchServiceGroups } from "@/lib/serviceGroupsData";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/praiseData", () => ({
  fetchSuggestDays: () => Promise.resolve({ data: 7, error: null }), saveSuggestDays: vi.fn(),
  fetchListsByDate: vi.fn(), fetchRecentLists: vi.fn(), createList: vi.fn(), updateList: vi.fn(),
  addListItem: vi.fn(), removeListItem: vi.fn(), saveItemPositions: vi.fn(), createSong: vi.fn(),
}));
vi.mock("@/lib/serviceGroupsData", () => ({ fetchServiceGroups: vi.fn() }));

const tt = STRINGS.pt;
const CHURCH = "Newark, NJ";
const DATA = {
  groups: [
    { id: "g1", church: CHURCH, name: "Newark 1", leader_name: "Ana", is_active: true },
    { id: "g2", church: CHURCH, name: "Newark 2", leader_name: "Bia", is_active: true },
  ],
  workers: [{ id: "w1", group_id: "g2", name: "Caio", position: 0 }, { id: "w2", group_id: "g2", name: "Davi", position: 1 }],
  // 2026-11-02 Monday → Newark 2; 2026-11-03 Tuesday → Newark 1; Wednesday empty
  schedule: [{ church: CHURCH, slot: "mon", group_id: "g2" }, { church: CHURCH, slot: "tue", group_id: "g1" }],
};
const SAVED = { id: "l1", service_date: "2026-11-02", service_type: "noite", church: CHURCH, group_name: "Grupo Visitante", leader: null, preacher: null, entered_by: "Ana", locked: false, published_at: null, items: [] };

const renderForm = (props) => render(
  <ServiceListForm tt={tt} lang="pt" today="2026-11-02" songs={[]} songsById={new Map()} onSongCreated={() => {}} initialDate="2026-11-02" initialType="noite" initialChurch={CHURCH} {...props} />
);
const groupInput = () => screen.getByLabelText(tt.praiseGroup);

describe("ServiceListForm — responsible group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 2, 20, 0));
    fetchListsByDate.mockResolvedValue({ data: [], error: null });
    fetchServiceGroups.mockResolvedValue({ data: DATA, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it("fills the scheduled group and shows its leader and workers", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    expect(screen.getByLabelText(tt.praiseGroupLeader).value).toBe("Bia");
    expect(screen.getByText(`${tt.praiseGroupWorkers}: Caio, Davi`)).toBeTruthy();
    expect(screen.getByLabelText(tt.praiseLeader).value).toBe(""); // Dirigente is never auto-filled
  });

  it("keeps the group of a saved list", async () => {
    fetchListsByDate.mockResolvedValue({ data: [SAVED], error: null });
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Grupo Visitante"));
    expect(screen.queryByLabelText(tt.praiseGroupLeader)).toBeNull();
  });

  it("still treats the group as scheduled when typed with other case/accents", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(groupInput(), { target: { value: "newark  2" } });
    expect(screen.getByLabelText(tt.praiseGroupLeader).value).toBe("Bia");
  });

  it("hides leader and workers once another group is typed", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(groupInput(), { target: { value: "Grupo de Elizabeth" } });
    expect(screen.queryByLabelText(tt.praiseGroupLeader)).toBeNull();
    expect(screen.queryByText(/Caio/)).toBeNull();
  });

  it("replaces the auto-filled group when the date moves, and clears it on a day with no group", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(screen.getByLabelText(tt.praiseDate), { target: { value: "2026-11-03" } });
    await waitFor(() => expect(groupInput().value).toBe("Newark 1"));
    fireEvent.change(screen.getByLabelText(tt.praiseDate), { target: { value: "2026-11-04" } });
    await waitFor(() => expect(groupInput().value).toBe(""));
  });

  it("does not replace a group the person typed when the date moves", async () => {
    renderForm();
    await waitFor(() => expect(groupInput().value).toBe("Newark 2"));
    fireEvent.change(groupInput(), { target: { value: "Grupo de Elizabeth" } });
    fireEvent.change(screen.getByLabelText(tt.praiseDate), { target: { value: "2026-11-03" } });
    await waitFor(() => expect(fetchListsByDate).toHaveBeenLastCalledWith("2026-11-03"));
    expect(groupInput().value).toBe("Grupo de Elizabeth");
  });

  it("works as before when the groups cannot be loaded", async () => {
    fetchServiceGroups.mockRejectedValue(new Error("relation does not exist"));
    renderForm();
    await waitFor(() => expect(groupInput()).toBeTruthy());
    expect(groupInput().value).toBe("");
    expect(screen.queryByLabelText(tt.praiseGroupLeader)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/test/worshipListGroupAutofill.test.jsx`
Expected: FAIL — first test times out waiting for "Newark 2" (`groupInput()` is empty) and `praiseGroupLeader` label not found.

- [ ] **Step 3: Implement in `src/views/WorshipListPublicView.jsx`**

Add imports next to the existing ones:

```js
import { fetchServiceGroups } from "@/lib/serviceGroupsData";
import { groupForService, sameGroupName } from "@/lib/serviceGroups";
```

Inside `ServiceListForm`, after the `useEffect` that loads the list (the one ending `}, [date, type, church]);`), add:

```js
  // Responsible group from Culto Profético › Grupos: fills "Grupo responsável" on a list not saved yet and shows
  // the group's leader and workers. Missing tables or a failed load leave the form exactly as it was.
  const [groupData, setGroupData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setGroupData(null);
    if (!church) return undefined;
    Promise.resolve()
      .then(() => fetchServiceGroups(church))
      .then(({ data, error }) => { if (!cancelled) setGroupData(error ? null : data); })
      .catch(() => { if (!cancelled) setGroupData(null); });
    return () => { cancelled = true; };
  }, [church]);
  const scheduled = useMemo(() => groupForService(groupData, church, date, type), [groupData, church, date, type]);

  // The name this form filled in by itself: replaced when the slot changes, never what the person typed.
  const autoGroup = useRef("");
  useEffect(() => {
    if (loading || list) return;
    const current = header.group_name.trim();
    const wasAuto = !current || current === autoGroup.current;
    if (!wasAuto) return;
    const next = scheduled?.group.name || "";
    autoGroup.current = next;
    if (next !== current) setHeader((h) => ({ ...h, group_name: next }));
  }, [scheduled, loading, list]); // eslint-disable-line react-hooks/exhaustive-deps

  const showGroupPeople = !!scheduled && sameGroupName(header.group_name, scheduled.group.name);
```

Note: `useMemo` and `useRef` are already imported at the top of the file.

Replace the group field block:

```jsx
          <div>
            <label style={labelStyle} htmlFor="worship-group">{tt.praiseGroup}</label>
            <input id="worship-group" value={header.group_name} onChange={setField("group_name")} style={inputStyle} disabled={!canEdit} maxLength={120} />
          </div>
```

with:

```jsx
          <div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 220px" }}>
                <label style={labelStyle} htmlFor="worship-group">{tt.praiseGroup}</label>
                <input id="worship-group" value={header.group_name} onChange={setField("group_name")} style={inputStyle} disabled={!canEdit} maxLength={120} />
              </div>
              {showGroupPeople && scheduled.leaderName && (
                <div style={{ flex: "1 1 160px" }}>
                  <label style={labelStyle} htmlFor="worship-group-leader">{tt.praiseGroupLeader}</label>
                  <input id="worship-group-leader" value={scheduled.leaderName} readOnly tabIndex={-1} style={{ ...inputStyle, background: "var(--bg)" }} />
                </div>
              )}
            </div>
            {showGroupPeople && scheduled.workerNames.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{`${tt.praiseGroupWorkers}: ${scheduled.workerNames.join(", ")}`}</p>
            )}
          </div>
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/test/worshipListGroupAutofill.test.jsx`
Expected: PASS (7 tests).

If "replaces the auto-filled group when the date moves" fails because the list-load effect resets `group_name` to `""` before the auto-fill effect runs (it does that only for a *saved* list, `keepTyped` false), check the order: the auto-fill effect depends on `loading`, which turns false only after `setLoadedKey`, so it runs after the reset. No change should be needed.

- [ ] **Step 5: Mock the new module in the existing worship tests**

In each of `src/test/worshipListEditor.test.jsx`, `src/test/worshipListName.test.jsx`, `src/test/songNumberUi.test.jsx`, `src/test/catalogFilter.test.jsx`, `src/test/praiseMergeUi.test.jsx`, add after the existing `vi.mock("@/lib/praiseData", …)` call:

```js
vi.mock("@/lib/serviceGroupsData", () => ({
  fetchServiceGroups: () => Promise.resolve({ data: { groups: [], workers: [], schedule: [] }, error: null }),
}));
```

- [ ] **Step 6: Run the worship tests**

Run: `npx vitest run src/test/worshipListEditor.test.jsx src/test/worshipListName.test.jsx src/test/songNumberUi.test.jsx src/test/catalogFilter.test.jsx src/test/praiseMergeUi.test.jsx src/test/worshipListGroupAutofill.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/views/WorshipListPublicView.jsx src/test/worshipListGroupAutofill.test.jsx src/test/worshipListEditor.test.jsx src/test/worshipListName.test.jsx src/test/songNumberUi.test.jsx src/test/catalogFilter.test.jsx src/test/praiseMergeUi.test.jsx
git commit -m "Praise list: fill in the responsible group with its leader and workers"
```

---

### Task 5: Leader on the shared (read-only) list

**Files:**
- Modify: `src/views/WorshipListSharedView.jsx` (imports; load effect ~lines 35–47; `details` ~line 52)
- Test: `src/test/worshipListSharedView.test.jsx`

**Interfaces:**
- Consumes: `fetchServiceGroups`, `groupForService`, `sameGroupName`, string `praiseGroupLeader`.

- [ ] **Step 1: Write the failing tests**

In `src/test/worshipListSharedView.test.jsx`, add after the existing `vi.mock("@/lib/praiseData", …)`:

```js
vi.mock("@/lib/serviceGroupsData", () => ({ fetchServiceGroups: vi.fn() }));
```

and the import `import { fetchServiceGroups } from "@/lib/serviceGroupsData";`. In the file's `beforeEach` (create one at the top of the main `describe` if there is none) add:

```js
fetchServiceGroups.mockResolvedValue({ data: { groups: [], workers: [], schedule: [] }, error: null });
```

Then add these tests inside the main `describe` (LIST is a Sunday noite at "New York, NY" with `group_name: "Grupo A"`; reuse the file's existing pattern for resolving `fetchListById` / `fetchSongsByIds` and rendering `<WorshipListSharedView id="l1" lang="pt" />`):

```jsx
  it("adds the leader when the list's group is the scheduled one", async () => {
    fetchListById.mockResolvedValue({ data: LIST, error: null });
    fetchSongsByIds.mockResolvedValue({ data: SONGS, error: null });
    fetchServiceGroups.mockResolvedValue({ data: {
      groups: [{ id: "g1", church: "New York, NY", name: "Grupo A", leader_name: "Marta", is_active: true }],
      workers: [{ id: "w1", group_id: "g1", name: "Caio", position: 0 }],
      schedule: [{ church: "New York, NY", slot: "noite", group_id: "g1" }],
    }, error: null });
    render(<WorshipListSharedView id="l1" lang="pt" />);
    expect(await screen.findByText(`Grupo A · ${STRINGS.pt.praiseGroupLeader}: Marta`)).toBeTruthy();
    expect(screen.queryByText(/Caio/)).toBeNull(); // workers are not on the sheet
  });

  it("shows only the group name when it is not the scheduled group or groups fail to load", async () => {
    fetchListById.mockResolvedValue({ data: LIST, error: null });
    fetchSongsByIds.mockResolvedValue({ data: SONGS, error: null });
    fetchServiceGroups.mockRejectedValue(new Error("no table"));
    render(<WorshipListSharedView id="l1" lang="pt" />);
    expect(await screen.findByText("Grupo A")).toBeTruthy();
  });
```

Add `import { STRINGS } from "@/i18n/strings";` if the file does not import it. Check `LIST.service_date` is a Sunday (`2026-08-02` is a Sunday) so the `noite` slot applies.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/test/worshipListSharedView.test.jsx`
Expected: the first new test FAILS (text "Grupo A · Líder: Marta" not found); the rest PASS.

- [ ] **Step 3: Implement**

Add imports:

```js
import { fetchServiceGroups } from "@/lib/serviceGroupsData";
import { groupForService, sameGroupName } from "@/lib/serviceGroups";
```

Change the state to carry the scheduled group: `useState({ status: "loading", list: null, songs: new Map(), scheduled: null })`, and in the load effect replace the final `setState({ status: "ready", … })` with:

```js
      const groups = await Promise.resolve()
        .then(() => fetchServiceGroups(list.church))
        .then(({ data, error }) => (error ? null : data))
        .catch(() => null);
      if (cancelled) return;
      setState({ status: "ready", list, songs: new Map(songs.map((s) => [s.id, s])), scheduled: groupForService(groups, list.church, list.service_date, list.service_type) });
```

(Keep `scheduled: null` in the other `setState` calls of that effect.) Then replace:

```js
  const { status, list, songs } = state;
```
```js
  // Who led/preached is for the person entering the list, not for the sheet sent to the Grupo de Louvor.
  const details = list?.group_name || null;
```

with:

```js
  const { status, list, songs, scheduled } = state;
```
```js
  // The sheet sent to the Grupo de Louvor names the responsible group, and its leader when the group is the one on
  // the weekly schedule. Who led the praise / preached stays off the sheet.
  const groupLeader = scheduled && sameGroupName(list?.group_name, scheduled.group.name) ? scheduled.leaderName : "";
  const details = list?.group_name ? (groupLeader ? `${list.group_name} · ${tt.praiseGroupLeader}: ${groupLeader}` : list.group_name) : null;
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/test/worshipListSharedView.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/WorshipListSharedView.jsx src/test/worshipListSharedView.test.jsx
git commit -m "Shared praise list: name the responsible group's leader"
```

---

### Task 6: CHANGELOG and docs

**Files:**
- Modify: `CHANGELOG.md` (`### Added` under `[Unreleased]`), `CLAUDE.md` (PIN-gated routes table)

- [ ] **Step 1: CHANGELOG** — add at the top of `### Added` under `[Unreleased]`:

```
- **Culto Profético › Grupos: who is responsible for each service** — a new "Grupos" tab next to the praise lists. Per church, admins (any church) and the church secretary (their own) set up groups once — name, leader and workers picked from the directory, active or not — and a fixed weekly table picks the group of each service (Segunda … Sábado, Domingo EBD, Domingo Noite); everyone else who opens the section reads it. On the praise-list form (`/culto-profetico` and the staff editor) "Grupo responsável" now fills in by itself for the church, date and service, with the group's leader beside it and "Obreiros: …" below; it stays editable for swaps (typing another group hides the leader and workers), a saved list keeps its own group, and "Dirigente do louvor" is never filled in. The shared list sheet adds "· Líder: …" when its group is the scheduled one. Audited as `service_group_created` / `_updated` / `_deleted` and `service_group_schedule_set`. `src/lib/serviceGroups.js` (rules), `src/lib/serviceGroupsData.js`, `src/sections/worship/ServiceGroupsTab.jsx`, `ServiceGroupForm.jsx`; tests in `src/test/serviceGroups.test.js`, `serviceGroupsData.test.js`, `serviceGroupsTab.test.jsx`, `worshipListGroupAutofill.test.jsx`, `worshipListSharedView.test.jsx`.
```

- [ ] **Step 2: CLAUDE.md** — in the PIN-gated routes table there is no `/worship` row; add one after `/schedule`:

```
| `/worship` | WorshipSection — Culto Profético: Listas de louvores (lists, catalogue, history) and Grupos (responsible group per weekly service) |
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "Docs: Culto Profético responsible groups"
```

---

### Task 7: Full verification

- [ ] **Step 1:** `npm run lint` — Expected: no errors.
- [ ] **Step 2:** `npm run test` — Expected: every test passes (the six worship tests included).
- [ ] **Step 3:** `npm run build` — Expected: build succeeds.
- [ ] **Step 4: Browser check (dev server via `preview_start`)** — with the migration not yet applied, open `/culto-profetico`: the form must look and behave exactly as before (no errors in the console beyond the failed Supabase request). Open `/worship` as an admin: tabs "Listas de louvores" / "Grupos"; Grupos shows the migration hint. Check phone width (375px): Grupo + Líder stack, schedule table fits without horizontal page scroll.
- [ ] **Step 5: Apply the migration — only with the user's explicit go-ahead.** Apply `migrations/048_service_groups.sql` to the Supabase project, then verify:

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('service_groups','service_group_workers','service_group_schedule');
```

Expected: three rows, all `false`. Then repeat Step 4 with a test group on today's slot and confirm the auto-fill, leader and workers on `/culto-profetico`.
