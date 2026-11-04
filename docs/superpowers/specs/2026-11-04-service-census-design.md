# Service Census (Frequência de Culto — church part) — Design

Date: 2026-11-04 · Status: approved design, awaiting spec review · Module 1 of 4

## Context

New pastoral-care modules were requested, in this build order:

1. **Service Census** — headcount of each church service (this spec).
2. GA attendance — the assistance-group leader marks who of the group was present.
3. Visit log — visits made by/for an assistance group.
4. Prayer requests — one reason per request, status, follow-ups, response-time KPIs.

Each module gets its own spec, plan and PR. This spec also creates the **Assistência** hub section that modules 2–4 will
add tabs to.

**Purpose.** Follow general participation in services over time — not to police anyone, but to care for the church better.
Copy and reports should read that way.

## Decisions

| Topic | Decision |
|---|---|
| Who records | Anyone with the public link, no PIN. They pick their church, then **pick their own name from the directory** (like the Profético page asks for a name, but bound to a member). Identification, not authentication. |
| Service split | Same types as the Profético: `ebd` / `noite` / `outro` (`SERVICE_TYPES`, `serviceTypesFor(date)` in `src/lib/praiseLists.js`). EBD only on Sundays. One census per church + date + type. |
| Visitors | Counts only (CIAs, Youth & Adults). No names. |
| Public edit window | The public link only writes the census of **today**. Past dates are corrected by staff. |
| Staff home | New hub section **Assistência** (EN "Care") at `/assistance`; this module adds the **Frequência** tab. |
| Data access | Public page goes through two Postgres RPCs (member search, save) so it keeps working once RLS is turned on (security review is a separate chat). |

## Data

Migration `045_service_census.sql`.

```sql
CREATE TABLE service_census (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church                text        NOT NULL,              -- churches.display, as worship_lists.church
  service_date          date        NOT NULL,
  service_type          text        NOT NULL CHECK (service_type IN ('ebd', 'noite', 'outro')),
  members_cia           int         NOT NULL DEFAULT 0 CHECK (members_cia    BETWEEN 0 AND 5000),
  members_adult         int         NOT NULL DEFAULT 0 CHECK (members_adult  BETWEEN 0 AND 5000),
  visitors_cia          int         NOT NULL DEFAULT 0 CHECK (visitors_cia   BETWEEN 0 AND 5000),
  visitors_adult        int         NOT NULL DEFAULT 0 CHECK (visitors_adult BETWEEN 0 AND 5000),
  notes                 text        CHECK (char_length(notes) <= 2000),
  entered_by_member_id  text,                              -- members.id of whoever saved last
  entered_by_name       text        NOT NULL CHECK (char_length(entered_by_name) BETWEEN 1 AND 120),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (church, service_date, service_type),
  CHECK (service_type <> 'ebd' OR extract(dow FROM service_date) = 0)
);
ALTER TABLE service_census DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON service_census TO anon, authenticated, service_role;
```

Totals (members, visitors, overall) are computed, never stored.

### RPCs (`SECURITY DEFINER`, granted to `anon`)

- `census_member_search(p_church text, p_query text)` → up to 10 `{id, name}` of members whose `members.church` is that church and whose
  name matches (accent- and case-insensitive). Returns nothing when `p_query` has fewer than 3 characters. The public page
  never loads the member list.
- `census_save(p_church, p_date, p_type, p_member_id, p_counts jsonb, p_notes)` → upsert on
  `(church, service_date, service_type)`, returns the row. Rejects:
  - `p_member_id` that is not a member of `p_church`;
  - `p_date` outside the **service-day window**: `p_date` must equal the current date in `America/New_York`, or the day
    before (so a late West Coast / Texas evening service saved after midnight Eastern still counts as that day);
  - EBD on a non-Sunday (also enforced by the table CHECK).

  `entered_by_name` is taken from the member row, not from the client.

Staff reads and edits go through the normal `sb` client (staff are signed in), with `.select()` chained on every
update/delete per the project rule.

## Public page — `/frequencia` (alias `/attendance`)

Outside `PublicLayout` (like `/24h-prayers` and `/portaria`), so it stays open in maintenance mode. Mobile-first form:

1. **Church** — same church picker as the Profético (hub churches first). Remembered on the device.
2. **Your name** — type-ahead search (≥ 3 letters) via `census_member_search`. The chosen member is remembered on the
   device; "Not you?" clears it.
3. **Date** — today, shown, not editable.
4. **Service** — `serviceTypesFor(today)` (EBD only on Sundays).
5. **Members**: CIAs, Youth & Adults → live subtotal. **Visitors**: CIAs, Youth & Adults → live subtotal.
   **Overall total** shown prominently. Number inputs with +/- steppers, `inputmode="numeric"`.
6. **Notes** (optional).
7. **Save**. If a census for church + today + type already exists, it is loaded and the save updates it (message: "Already
   recorded by {name} — you are editing it").

Every save writes an audit event (`census_saved`, actor = `publicActor(name)`, details: church, date, type, counts,
`deviceInfo()`).

## Staff section — `/assistance` › Frequência

- Hub tile **Assistência / Care**; roles for now: `admin`, `clerk`, `pastor`. (`ga_leader` gets the section when module 2
  lands.) Clerks and pastors see only their churches (`churches` scope on `app_users`); admin sees all.
- Filters: church (or all in scope), period (this month default; last 3 / 12 months; custom).
- Table, one row per service: date, type, members (CIA / adult / total), visitors (CIA / adult / total), overall, notes
  indicator, recorded by. Click a row → edit modal (any date), delete with `ConfirmDelete`. Staff can also add a census for
  a past date.
- Period summary: number of services; average overall attendance per service type; visitor share (%); CIA share (%);
  highest and lowest service; services with no census (Sundays/known service days without a row are **not** guessed —
  only listed counts are shown).
- CSV export of the filtered table.
- Shared link card with the public URL and a QR code, for printing at the door.

## i18n

Every string in PT and EN (`src/i18n/strings.js`). Labels: "Membros / Members", "Visitantes / Visitors",
"CIAs / Children", "Jovens e Adultos / Youth & Adults", "Total geral / Overall total".

## Files (expected)

- `migrations/045_service_census.sql` — table + RPCs.
- `src/lib/census.js` — totals, period summary, date-window and service-type rules (pure, unit-tested); data calls.
- `src/views/CensusPublicView.jsx` — public page.
- `src/sections/assistance/AssistanceSection.jsx` + `CensusTab.jsx` — staff section.
- `src/hub/HubHome.jsx`, `src/App.jsx` — tile and routes.
- `CLAUDE.md` route tables, `CHANGELOG.md` `[Unreleased]`.

## Testing

- Vitest on `src/lib/census.js`: totals; summary (averages per type, shares, highs/lows, empty period); service-day window
  incl. the after-midnight-Eastern case; EBD only on Sundays.
- Browser check: public form on mobile width (pick church, search name, save, reopen same service → edit), staff tab
  (filters, edit past date, delete, CSV).
- SQL check after migration: `relrowsecurity = false`; `census_save` rejects a past date and a member of another church.

## Out of scope

Visitor names/contacts; GA attendance, visits, prayer requests (modules 2–4); charts beyond the summary numbers;
authentication of the public recorder (security review, separate chat).
