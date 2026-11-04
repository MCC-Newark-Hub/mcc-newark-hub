# GA Attendance (Chamada do GA) — Design

Date: 2026-11-04 · Status: approved design, awaiting spec review · Module 2 of 4 of Assistência

## Context

Module 1 (Frequência de Culto, PR #44) created the **Assistência** section (`/assistance`) with the Frequência tab and the
`service_census` table (migration 045). This module adds the second tab: the assistance-group (GA) leader marks which
members of their group were at each church service.

**Purpose.** Follow who has not been coming, so the group can care for them better — never to accuse. Copy and reports
say "sem presença há 3 semanas" / "no attendance for 3 weeks", "para cuidar primeiro" / "reach out first"; never
"faltoso" / "absentee".

## Decisions

| Topic | Decision |
|---|---|
| What is marked | Presence at **church services** (church of the GA + date + service type), the same services as the Frequência: Sunday has `ebd` and `noite`, every other day `noite` (`censusTypesFor`). One attendance per GA + date + type. |
| Who records | The GA leader (`ga_leader`), only for their `user.gaIds`. Admin can record and correct any GA. |
| Who sees | Only the GA leader (their groups) and admin (every group). Pastor and clerk keep the church census (Frequência) and do **not** see this tab. |
| Visitors | Names, typed by the leader (free text). |
| Date window | Today back to 14 days ago, never the future. Admin: any past date. |
| Follow-up | Per member: last presence ("há 3 semanas") and the last 8 attendances (● / ○ / –). On top, "Para cuidar primeiro": members absent from the last 3 attendances they were on the roster for. |
| Storage | One row per attendance with the roster, the present members and the visitors as arrays (one write, the roster frozen as it was that day). |
| Out of scope | CSV, church-level or cross-GA reports (the data is ready for them; they come later). |

## Access

- `ga_leader` is added to the Assistência tile in `src/hub/HubHome.jsx` and to `ALLOWED` in
  `src/sections/assistance/AssistanceSection.jsx`.
- Tabs by role (any of the user's `sysRoles`):
  - `census` (Frequência): `admin`, `clerk`, `pastor` — unchanged.
  - `ga` (Chamada do GA / GA Attendance): `admin`, `ga_leader`.
  - The first allowed tab opens by default. A user with both (e.g. a pastor who also leads a GA) sees both, and in the
    GA tab only their own groups.
- GAs in scope: admin → every GA (picker grouped by church with `groupGasByChurch`); otherwise → the GAs whose id is in
  `user.gaIds`. A ga_leader with no groups sees a friendly empty state ("Nenhum grupo ligado à sua conta…").

## Data

Migration `047_ga_attendance.sql`.

```sql
CREATE TABLE IF NOT EXISTS ga_attendance (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ga_id               text        NOT NULL,                 -- assistance_groups.id
  church              text        NOT NULL CHECK (char_length(church) BETWEEN 1 AND 120), -- GA's church at the time
  service_date        date        NOT NULL,
  service_type        text        NOT NULL CHECK (service_type IN ('ebd', 'noite', 'outro')),
  roster_ids          text[]      NOT NULL DEFAULT '{}',    -- members of the GA that day
  present_ids         text[]      NOT NULL DEFAULT '{}',    -- who came
  visitors            text[]      NOT NULL DEFAULT '{}',    -- visitor names
  notes               text        CHECK (notes IS NULL OR char_length(notes) <= 2000),
  entered_by_user_id  text,                                 -- app_users.id of whoever saved last
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
```

Visitor name length (≤ 120) is enforced by the app (an array element CHECK needs a function; not worth it now).
No public RPC: reads and writes use the signed-in Hub client, like the staff edits of the Frequência. The date window and
the GA scope are enforced by the app; enforcing them on the server belongs to the RLS phase of the security plan.

## Rules — `src/lib/gaAttendance.js` (pure, no database)

- `ATTENDANCE_DAYS_BACK = 14`.
- `attendanceDateAllowed(date, today, { isAdmin })` → `date <= today` and (`isAdmin` or `date >= today − 14 days`).
- `gasInScope(user, gas)` → admin: all GAs; otherwise GAs whose id is in `user.gaIds`.
- `rosterFor(gaId, members)` → members with `gaId === gaId`, sorted by name (`pt` collation).
- `cleanVisitors(list)` → trimmed, empty removed, duplicates removed (case- and accent-insensitive), each cut to 120
  characters, at most 50.
- `cleanPresent(presentIds, rosterIds)` → only ids that are on the roster, no duplicates.
- `followUp(attendances, roster, today)` → for each roster member:
  - `lastPresent` (date or null) and `since` (days since `lastPresent`);
  - `recent`: the GA's last 8 attendances (newest first) as `"present" | "absent" | "none"` (`none` = not on that
    attendance's roster);
  - `needsCare`: absent from each of the last 3 attendances they were on the roster for (and on at least 3).
  - List order: `needsCare` first, then longest since last presence, then name.
- `sinceLabel(days, lang)` → "hoje" / "há 5 dias" / "há 3 semanas" / "há 2 meses" (EN "today" / "5 days ago" / …);
  `null` → "Ainda sem presença registrada" / "No attendance recorded yet".

## Database calls — `src/lib/gaAttendanceData.js`

- `fetchAttendance(gaId, date, type)` → the one row or null.
- `listAttendance(gaId, from)` → the GA's attendances from `from` (today − 26 weeks), newest first.
- `saveAttendance(row)` → `upsert(..., { onConflict: "ga_id,service_date,service_type" }).select()`; returns
  `{ data, error }`, with `error: "not_found"` when no row comes back.
- `deleteAttendance(id)` → `delete().eq("id", id).select()` (admin only in the UI).

## UI — `src/sections/assistance/GaAttendanceTab.jsx`

Mobile-first; reads members, GAs and the user from `useAppDataContext()`. Two views, switched by a segmented control:

**Chamada / Take attendance**
- GA picker when more than one GA is in scope (admin: grouped by church).
- Date input (default today, `min` today − 14 for non-admins, `max` today) and service-type chips from
  `censusTypesFor(date)`; a type no longer valid for the new date falls back to the first one.
- On GA / date / type change, loads that attendance. Existing → pre-filled, with "Lançada por {name} em {date}".
- Member list: large checkbox rows (member name), "Marcar todos" /
  "Desmarcar todos". Members recorded on a past roster but no longer in the GA are not shown on new attendances.
  Opening an old attendance shows its own roster (names from the directory; unknown ids as "Membro removido").
- Visitors: text input + "Adicionar", list with remove buttons.
- Notes (optional) and **Salvar**: awaits the write (the leader needs to know it saved), toasts success or the error
  and keeps what was marked on failure. Admin also gets **Excluir** on an existing attendance (with confirm).
- Counter: "8 de 12 presentes · 2 visitantes".

**Acompanhamento / Follow-up**
- Loads the last 26 weeks of the selected GA.
- "Para cuidar primeiro" block with the `needsCare` members, then every member: name, `sinceLabel`, and 8 dots
  (● present, ○ absent, – not in the group yet), with a legend.
- Empty state when there are no attendances yet.

All strings in `src/i18n/strings.js`, PT and EN.

## Errors

- Load failure → inline message with retry; save failure → toast, form kept.
- Date outside the window → Salvar disabled with the reason.
- A unique-key race (two leaders of the same GA) cannot duplicate: the upsert corrects the existing row.

## Testing (Vitest; jsdom has no usable localStorage — stub it)

- `gaAttendance.test.js`: date window (14 days, future, admin), scope, roster order, `cleanVisitors`, `cleanPresent`,
  `followUp` (last presence, `none` for not-yet-members, needsCare after 3 absences, ordering), `sinceLabel`.
- `gaAttendanceTab.test.jsx`: tabs by role (ga_leader only GA; pastor/clerk only Frequência; admin both), roster
  rendering and toggling, save payload (mocked data module).
- Lint only the new/changed files (`react-hooks/set-state-in-effect`, `react-refresh/only-export-components` apply).

## Docs

CHANGELOG `[Unreleased]`, CLAUDE.md (table list, `/assistance` row), migrations README. Migration 047 is applied to
production only after the user's explicit OK.
