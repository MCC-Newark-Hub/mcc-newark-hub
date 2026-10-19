# Backend — MCC Newark Hub (v1)

**Retroactive schema** · 2026-10-19 · Read from the production database (Supabase, project `mcc-newark-hub`, 34 tables in the `public` schema). It shows the main tables, the links between them and **who can view and edit** each piece of data.
**Other languages:** [Português](pt/BACKEND.md)

> ⚠️ **Read this first.** Today the database does **not** enforce permissions: RLS is off on every table, so anyone with the public key can read and change everything. The rules in section 3 are applied **by the screens only**. They describe the intent, not real protection.

---

## 1. Relationship diagram

```
churches ──< church_group_members >── church_groups   (hub / area / region)
   │ pastor_id
   ▼
members ──┬── family_id ──► families   (and families.member_ids[] points back)
          ├── ga_id ─────► assistance_groups ── leader_id ──► members
          └── (text id) ◄── registrations.member_id
                              ▲  ▲   └── event_id ──► events
approvals.reg_id ─────────────┘  └── invited_by_member_id
approvals.event_id ──► events
rosters.event_id ──► events        rosters.leader_id ──► members
teams.leader_id ──► members
schedule_oracao ── period_id ──► prayer_periods     └── member_id ──► members
door_assignments ── month ──► door_months   └── worker_id ──► door_workers ──► members
worship_list_items ── list_id ──► worship_lists   └── song_id ──► praise_songs
```

Standalone tables (no foreign key): `app_users`, `app_settings`, `audit_log`, `org_responsibles`, `kitchen_plan`, `kitchen_meta`, `treasury_expenses`, `treasury_collections`, `categories`, `functions`, `instruments`, `voice_types`, `immigration_statuses`, `expense_categories`, `income_types`.

---

## 2. Tables and main fields

### 2.1 People and churches

| Table | Purpose | Main fields |
|---|---|---|
| `members` | Directory of people (454) | `id` (text), `name`, `badge_name`, `gender` (M/F), `category` (age band), `church`, `role`/`roles[]`, `family_id`, `ga_id`, `is_visitor`, `is_guest`, `immigration_status`, `allergies`, `special_needs`, `voice_type`, `instruments[]` |
| `families` | Families | `id`, `name`, `member_ids[]` (**both ends** `members.family_id` and `families.member_ids` coexist; use `familyIdOf`) |
| `assistance_groups` | Assistance Groups (GA) | `id`, `name`, `church`, `leader_id` |
| `churches` | Churches | `display`, `city`, `state_code`, `country`, `address`, `pastor_id`, `church_type` (Church / Preaching Point), `property_ownership` |
| `church_groups` + `church_group_members` | Hubs, areas and regions | `name`, `kind`; links each group to its churches |
| `org_responsibles` | Org-chart people in charge | `scope` (area/hub/church), `ref`, `kind` (responsible/co), `member_id` or `name` |

### 2.2 Events and registrations

| Table | Purpose | Main fields |
|---|---|---|
| `events` | Seminar/event | `id`, `name`, `prefix`, `date`, `capacity`, `fees` (jsonb per category), `registration_deadline`, `payment_deadline_days`, `payment_extension_days`, `registration_paused`, `registrations_locked` |
| `registrations` | The registration (core) | `reg_number` (unique), `event_id`, `member_id`, `member_name`, `category`, `church`, `team`, `fee`, `paid`, `exempt`, `cancelled`, `waitlisted`, `excedente` (over capacity), `presence`, `checked_in_at`, `checkin_method`, `registered_by`, `timeline` (jsonb), `cancel_reason`, `deadline_extended_to` |
| `approvals` | Requests to the pastor | `type` (over capacity, late, exemption, reactivation, extension), `status`, `reason`, `pastor_note`, `requested_by`, `resolved_by`, `reg_id` |
| `rosters` / `teams` | Service teams for the event | `team`, `leader_id`, `member_ids[]`, `assignments` (jsonb) |
| `categories` / `functions` | Age-band and function lists | `name`, `sort_order`, `fee_default` |
| `kitchen_plan` / `kitchen_meta` | Kitchen planning | items, quantity per person, cost, actual attendance |
| `treasury_expenses` / `treasury_collections` | Treasury | date, description, category, amount, receipt (link), type |

### 2.3 Schedules and praise

| Table | Purpose |
|---|---|
| `prayer_periods` + `schedule_oracao` | 24h prayer lists and their 96 time slots; scope by church or hub; capacity per slot |
| `door_workers`, `door_months`, `door_assignments` | Door duty: who can serve, the generated month and who serves each day |
| `praise_songs`, `worship_lists`, `worship_list_items` | Song catalogue, each service's list and its ordered items |

### 2.4 Access and system

| Table | Purpose | Main fields |
|---|---|---|
| `app_users` | Portal accounts | `name`, `pin` (unique), `sys_role`/`sys_roles[]`, `primary_role`, `church`, `churches[]`, `ga_ids[]`, `team_leads[]`, `active` |
| `app_settings` | Single configuration row | `session_ttl_hours` |
| `audit_log` | Who did what | `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `entity_label`, `details` (jsonb) |
| `immigration_statuses`, `expense_categories`, `income_types`, `instruments`, `voice_types` | Lists editable in Settings | `name`, `sort_order` |

### 2.5 Rules inside the database
- `registrations.reg_number` is unique; **one active registration per person and event** (migration 013).
- Deadlines and capacities are checked by `CHECK` constraints (e.g. prayer slots 0–95, `slot_capacity` 1–20, praise category).
- A trigger prevents exceeding the number of people per prayer slot.
- The `set_user_churches` function saves a user's list of churches.

---

## 3. Who can **view** and **edit** each piece of data (rule by screen)

Legend: **V** = view · **E** = edit · **—** = no access. "Church" = only the church(es) of the access.

| Data | Administrator | Secretary | Pastor | GA leader | Team leader | Treasurer | Public (no PIN) |
|---|---|---|---|---|---|---|---|
| Registrations | V·E | V·E (church) | V (approves exceptions) | V (their GAs) | V (their team) | V (payments) | creates their own; looks up their own |
| Approvals | V·E | requests | V·E (decides) | — | — | — | — |
| Members, families | V·E | V·E (church) | V (functions) | V (their GAs) | V (team) | — | search to register |
| Overview and Org chart | V | V (Overview, church) | V (Overview; Org chart only if allowed) | — | — | — | — |
| Treasury (balance, expenses, income) | V·E | — | V (if allowed) | — | — | V·E | — |
| Kitchen, teams, badges | V·E | — | — | — | V·E (their team) | — | — |
| Schedules (door, flowers, prayer) | V·E | V | V | V | V | V | reads door duty and prayer; picks a prayer slot |
| Praise Song List | V·E | V | V | V | V·E (Praise Group) | V | creates and edits with the link; reads the published list |
| Users, PINs, lists, audit log | V·E | — | — | — | — | — | — |

**Most sensitive data:** PINs (`app_users.pin`), contacts and health of minors (`members`), amounts paid (`registrations`, `treasury_*`).

---

## 4. How this should work in the database (for v2)

1. **Real authentication** (Supabase Auth or a server function): without it the database cannot know who is who.
2. **RLS on**, with the policies from the table in section 3. Suggested order: `app_users` (PIN out of public reach), `registrations` and `members`, then the rest.
3. **Public access** only to what it needs: insert a registration, read one's own receipt, read published lists, pick a prayer slot. All through specific functions (`rpc`), never through an open table.
4. **Scope by church** becomes a database rule: `members`/`registrations` filtered by the user's church.
5. **To strengthen:** store the PIN only as a hash and limit attempts.

*New restrictions must arrive as a numbered migration in `migrations/`, with a test that the screens still work for every profile.*

---

## 5. Database conventions
- New table: `ALTER TABLE … DISABLE ROW LEVEL SECURITY; GRANT ALL … TO anon, authenticated, service_role;` **(today's rule; changes in v2 per item 2)**.
- Verify `UPDATE`/`DELETE` with `.select()`: Supabase returns no error when the row does not exist.
- People and families use a **text** identifier; registrations and most newer tables use **uuid**.
- Names (tables, columns, constraints, seed data identifiers) are written in English; user-facing labels come from the i18n files, not from the database.
