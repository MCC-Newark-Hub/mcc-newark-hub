# Culto Profético — Responsible groups (design)

Date: 2026-11-05 · Status: draft for review

## Goal

Admins and church secretaries keep, per church, a weekly table of which group is responsible for each
prophetic service (Day → Group → Leader). The public praise-list page (`/culto-profetico`) then fills in
"Grupo Responsável" automatically, shows the group's leader beside it, and lists the group's workers.

Success: whoever enters a list no longer types the group; it is right for the church, date and service,
and still editable when groups swap.

## Decisions

| Topic | Decision |
|---|---|
| Rotation | Fixed by weekday: the same group serves every Monday, etc. No week-of-month or dated calendar. |
| Slots | `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `ebd` (Sunday morning), `noite` (Sunday night). |
| Groups | Set up once per church (name, leader, workers); the weekly table picks a group per slot. |
| People | Leader and workers picked from the member directory (`member_id`), with the name stored next to it as a fallback and for public display — same pattern as `door_workers`. |
| Scope | Per church. `church` is the church display text, matching `worship_lists.church`. |
| Saved lists | Unchanged. `worship_lists.group_name` stays free text; history and old lists are untouched. |
| Group leader vs Dirigente | Treated as different roles. "Dirigente do louvor" is **not** auto-filled. |
| Shared (read-only) list page | Shows group + leader. Workers are not shown there. |

## Data model — migration `048_service_groups.sql`

```sql
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
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  member_id  text REFERENCES members(id) ON DELETE SET NULL,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  position   integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS service_group_workers_uniq ON service_group_workers (group_id, lower(name));

CREATE TABLE IF NOT EXISTS service_group_schedule (
  church    text NOT NULL,
  slot      text NOT NULL CHECK (slot IN ('mon','tue','wed','thu','fri','sat','ebd','noite')),
  group_id  uuid NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (church, slot)
);

-- Project rule: RLS disabled + grants on every new table.
ALTER TABLE service_groups          DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_group_workers   DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_group_schedule  DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON service_groups, service_group_workers, service_group_schedule
  TO anon, authenticated, service_role;
```

- A slot with no row = no group assigned (nothing auto-filled).
- Deleting a group removes its schedule rows (cascade). The UI prefers "deactivate" and warns when the
  group is still on the schedule; an inactive group cannot be picked for a slot.
- Names are copied from the member at pick time; renaming a member does not rewrite them (same as Portaria).
  Editing the group re-copies the current name.
- Add the migration to `migrations/README.md` and the three tables to the table list in `CLAUDE.md`.

## Helpers — `src/lib/serviceGroups.js` (pure)

- `SLOTS = ["mon","tue","wed","thu","fri","sat","ebd","noite"]`
- `slotFor(date, serviceType)` → Sunday: `serviceType` (`"ebd"` or `"noite"`); other days: weekday key.
  Uses local-date parsing like `serviceTypesFor` (no timezone shift).
- `groupForService({ groups, workers, schedule }, church, date, serviceType)` →
  `{ group, leaderName, workerNames }` or `null` when the slot is empty, the group is inactive or missing.
- `validateGroup(form, groups)` → error key for an empty name or a name already used in the same church.
  A group without a leader is valid (leader can be added later).

## Admin module — "Grupos" tab in the Culto Profético section

`WorshipSection` gets two tabs: **Listas de louvores** (current `PraiseListsTab`) and **Grupos**
(new `src/sections/worship/ServiceGroupsTab.jsx`). Tabs are `useState`, no sub-routes.

**Church picker** at the top: admins choose any church; clerks are fixed to their own church.

**Weekly schedule** (first, since it is what changes most):

| Dia | Grupo | Líder |
|---|---|---|
| Segunda | dropdown of active groups (or "—") | leader of the chosen group (read-only) |
| … through Sábado, then Domingo EBD, Domingo Noite | | |

Changing a dropdown upserts `(church, slot)`; "—" deletes the row. Writes are verified with `.select()`.

**Groups**: a card per group — name, leader, workers (chips), active toggle, edit/delete. The edit form
has name, leader (member search scoped to the church), and workers (member search, add/remove, order).
Member search reuses the member-picker pattern already in `src/sections/schedule/RotationTab.jsx`
(sets `member_id` + name from the chosen member).

**Permissions**
- Edit: `admin` (any church), `clerk` (their church only).
- Everyone else who can open the section (pastor, ga_leader, treasurer, Grupo de Louvor team leader):
  read-only view of the schedule and groups.
- Every create/update/delete writes an audit entry (`service_group_*`, `service_group_schedule_set`).

Follows the optimistic-first mutation pattern; failures are toasted.

## Public list page — `WorshipListPublicView`

- After church/date/service type are known, load `service_group_schedule` for that church plus the
  referenced group and its workers (three small queries, no `members` access — the page only reads the
  denormalized names, so nothing new from the directory is exposed to anonymous visitors beyond the names
  admins put on a group).
- Layout: **Grupo Responsável** and **Líder** side by side (stack on phone width). Below, a muted line:
  "Obreiros: A, B, C" (hidden when the group has no workers).
- Fill rule: only when `group_name` is empty and the list is new (no saved list for that service). A saved
  list keeps its own `group_name`.
- Líder and Obreiros are read-only, derived from the schedule. If the user edits "Grupo" to something
  other than the scheduled group's name, Líder and Obreiros hide (they no longer describe the typed group).
- Changing church, date or service type re-runs the lookup under the same fill rule.
- Lookup failure or missing tables: the page behaves exactly as today (free-text field), no error shown.

## Shared read-only page — `WorshipListSharedView`

Shows "Grupo · Líder: X" when the list's `group_name` matches the scheduled group for that list's church,
date and service. Otherwise only `group_name`, as today.

## i18n

PT and EN strings for: tab names, slot labels (Segunda … Domingo EBD / Domingo Noite), schedule headers,
group form labels and errors, "Líder", "Obreiros", empty states, read-only notice.

## Testing

- `src/test/serviceGroups.test.js`: `slotFor` for each weekday and both Sunday services; `groupForService`
  for empty slot, inactive group, missing group, worker ordering; `validateGroup`.
- Render test for the public page: auto-fills an empty group, does not overwrite a saved list, hides
  Líder/Obreiros after the group is edited.
- Permissions: clerk sees only their church and can edit; pastor sees read-only.

## Out of scope

- Week-of-month or dated rotations, swaps calendar.
- Storing leader/workers on saved lists.
- Auto-filling "Dirigente do louvor".
- Notifications to group members.

## Rollout

1. Apply migration 048 in Supabase, verify `relrowsecurity = false` for the three tables.
2. Deploy the code (the public page degrades gracefully if the tables are missing).
3. CHANGELOG entry under `[Unreleased]` (Added + Database).
