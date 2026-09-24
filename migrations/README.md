# Database Migrations

Run these files **in order** using the Supabase SQL editor or `psql`. Each migration is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) — re-running is safe.

| File | Description |
|---|---|
| `001_member_fields.sql` | Adds `first_name`, `last_name`, `allergies`, `special_needs`, `notes` to `members`. Auto-populates first/last name from existing `name` values. |
| `002_teams_table.sql` | Creates `teams` reference table; seeds the 13 standard service teams. |
| `003_presence.sql` | Adds `presence` column to `registrations` (`unknown` / `present` / `absent` / `walk_in`). |
| `004_checkin_fields.sql` | Adds `checked_in_at` (timestamptz) and `checkin_method` (`manual` / `qr_clerk` / `self`) to `registrations`. |
| `005_churches_schema.sql` | Expands `churches` table with `city`, `state`, `country`, `region` fields; keeps the `display` column as canonical short label. |
| `006_teams_enrich.sql` | Adds `description`, `leader_id` (FK → members), and `responsibilities` to `teams`. |
| `007_churches_pastor.sql` | Adds `pastor_id` (FK → members) to `churches`. |
| `008_member_roles.sql` | Adds `roles text[]` array to `members` for multi-role support; keeps legacy `role` column for compatibility. |
| `009_id_defaults.sql` | Adds auto-generated ID defaults for `assistance_groups` and `families` so clients don't need to supply IDs on insert. |
| `010_families_member_ids.sql` | Adds `member_ids text[]` to `families`; adds ID defaults for both `families` and `assistance_groups`. |
| `011_hub_and_guests.sql` | Adds `is_hub` boolean to `churches` (flags Newark/Philadelphia/New York/Toms River); adds `invited_by_member_id` (FK → members) to `registrations` for guest tracking. |
| `012_registration_deadline.sql` | Adds `registration_deadline` (date) to `events`; adds `category`/`church`/`badge_name`/`team`/`note`/`pastor_note` to `approvals` so late-registration requests can be approved into real registrations. |
| `013_unique_active_registration.sql` | Adds a partial unique index on `registrations (member_id, event_id) WHERE cancelled = false AND member_id <> 'GUEST'`, so a member can't end up with two active registrations for the same event. Cancel-then-re-register still works since cancelled rows are excluded. |
| `014_payment_extension_and_reactivation.sql` | Adds `registrations.deadline_extended_to` (date) and `registrations.cancel_reason` (text) for the reactivation/extension flow; adds `events.payment_extension_days` (int, default 5) for the shorter deadline reactivated registrations get. |
| `015_app_settings.sql` | Creates single-row `app_settings` table (`session_ttl_hours`, default 2) for global config previously hardcoded in the client — admin-configurable from Usuários & PINs. |
| `016_audit_log.sql` | Creates `audit_log` table (actor, action, entity, details, timestamp) — every mutation in useAppData.js writes here, feeding the Admin audit log page. |
| `022_schedule_oracao.sql` | Creates `prayer_periods` ("Período de Orações Ininterruptas": `oracao24h-NNN` id, title, optional circular number, start/end date, `reasons text[]`, `is_active`) and `schedule_oracao` (one person per slot, unique per period + slot index), RLS disabled; seeds the first period (inactive). Used by the admin Oração 24h tab and the public `/24h-prayers` board; both fail without it. |
| `023_church_groups.sql` | Creates `church_groups` (polos / áreas / regiões) and `church_group_members`, seeds the three polos, and adds list name, English title/intentions and scope (`scope_kind`, `scope_group_ids`, `scope_churches`) to `prayer_periods`. Additive and idempotent. |
| `024_prayer_slot_capacity.sql` | Adds `prayer_periods.slot_capacity` (people per slot, 1-20, default 1), drops the one-person-per-slot unique constraint on `schedule_oracao`, adds a unique index so the same person can't be twice in a slot, and a `BEFORE INSERT` trigger that enforces the capacity (locks the period row; a full slot raises 23505). Apply **before** deploying the code that uses it. |
| `025_praise_lists.sql` | Creates `praise_songs`, `worship_lists`, `worship_list_items` and the `praise_song_last_sung` view for Culto Profético › Lista de Louvores (RLS disabled). Catalogue starts empty; apply **before** deploying the code that uses it. |
| `026_worship_list_published.sql` | Adds `worship_lists.published_at` (NULL = not published) for the read-only page sent to the Grupo de Louvor. Apply **before** deploying the code that uses it. |
| `027_worship_list_church.sql` | Adds `worship_lists.church` (which church the list belongs to; shown on the published page). Apply **before** deploying the code that uses it. |
| `028_door_schedule.sql` | Creates `door_workers` (door-duty workers + `days` availability), `door_months` (generated month, people per service, `published_at`) and `door_assignments` (who is on each service), RLS disabled. Used by Escalas › Portaria and the public `/portaria/YYYY-MM` page; both fail without it. Apply **before** deploying the code that uses it. |

## How to run

1. Open your Supabase project → **SQL Editor**
2. Run each file in numerical order (001 → 014)

## Notes

- Migrations assume the base schema (all 12 core tables) already exists. The base schema is created separately via the Supabase dashboard or a seed script.
- Row Level Security is disabled on all tables. If Supabase Auth is ever added, re-evaluate RLS policies before re-enabling.

## ⚠️ Creating a new table? Read this first.

**Supabase enables RLS by default on every newly created table**, unlike this
schema's original 12 tables, which predate that default and have it off. This
has already caused two real incidents: `app_settings` (015) and `audit_log`
(016) both shipped with writes silently blocked from day one, undetected until
2026-08-09 — days later for `app_settings`, since its own admin-facing "save"
button reported success every time regardless (see the "silent no-op" note
below).

Any `CREATE TABLE` migration **must** include, right after the table
definition:
```sql
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON your_table TO anon, authenticated, service_role;
```
After running it, verify — don't assume:
```sql
select relrowsecurity from pg_class where relname = 'your_table';  -- must be false
```

**Silent no-op is worse than a thrown error, and it's the default failure mode
for UPDATE/DELETE.** A blocked `INSERT` throws a real, catchable error. A
blocked `UPDATE`/`DELETE` under RLS just matches zero rows — no error, `error`
is `null`. Any mutation that only checks `if (error)` will report success on a
write that changed nothing. Always chain `.select().single()` (or check
`data.length`) and treat an empty result as a failure too — this is what
`updateSessionTtlHours` in `useAppData.js` was missing, which is exactly why
its bug went unnoticed for 5 days.
