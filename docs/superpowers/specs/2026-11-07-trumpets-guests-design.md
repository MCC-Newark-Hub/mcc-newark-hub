# Trombetas e Festas — guest lists per GA and church

Date: 2026-11-07 · Status: design approved in chat, awaiting spec review

## Goal

Every year (late November / early December) the church holds *Trombetas e Festas*. Each GA lists the
people its members invite — name, contact, who invited them — and marks who actually came. The church
sees the sum of all its GAs.

Success:
- A GA leader adds a guest from a phone in a few taps.
- On the day, someone marks attendance with one toggle.
- Clerk / pastor see invited / attended / % per GA and the church total, and can export a CSV.

## Decisions (from the brainstorm)

| Question | Answer |
|---|---|
| Attendance | Once per edition (came / didn't come), not per night |
| Who edits | GA leaders for their own GAs; clerk / pastor / admin for any GA in their scope |
| Contact | Phone and e-mail, both optional |
| Storage | Own table, **server-only** (like `member_contacts`): guests are non-members' personal data and the repo is public |
| Where | New tab in `/assistance` |

Out of scope (YAGNI): turning a guest into a member, a public self-service link, per-night attendance,
sending invitations by SMS/e-mail.

## Data — migration `052_trumpet_guests.sql`

```sql
CREATE TABLE IF NOT EXISTS trumpet_guests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year                 int  NOT NULL,
  church               text NOT NULL,
  ga_id                text NOT NULL REFERENCES assistance_groups(id) ON DELETE RESTRICT,
  name                 text NOT NULL CHECK (length(trim(name)) > 0),
  phone                text,
  email                text,
  invited_by_member_id text REFERENCES members(id) ON DELETE SET NULL,
  attended_at          timestamptz,           -- null = did not come
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           text
);
CREATE INDEX IF NOT EXISTS trumpet_guests_year_ga ON trumpet_guests (year, ga_id);

-- Server-only, like member_contacts (039): RLS on, no policies, no browser privileges.
ALTER TABLE trumpet_guests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trumpet_guests FROM anon, authenticated;
GRANT ALL PRIVILEGES ON trumpet_guests TO service_role;
```

(Column types of `assistance_groups.id` / `members.id` must be checked against the live schema before
applying; `text` matches how they are used in the app.)

`church` is copied from the GA on create and rewritten when `ga_id` changes, so church totals don't
need a join and survive a GA being renamed.

## Server — `api/trumpet-guests.js`

Same shape as `api/member-contacts.js`: POST only, bearer token, `currentUser`, service-role REST.

| action | body | result |
|---|---|---|
| `list` | `{ year }` | `{ guests: [...] }`, only rows in the caller's scope |
| `create` | `{ year, gaId, name, phone?, email?, invitedByMemberId?, notes? }` | `{ guest }` |
| `update` | `{ id, ...same fields }` | `{ guest }` |
| `attend` | `{ id, attended: boolean }` | `{ guest }` (sets / clears `attended_at`) |
| `delete` | `{ id }` | `{ ok: true }` |

Scope (resolved on the server from `app_users`: `sys_roles`, `church`, `churches`, `ga_ids`):
- `admin`, `pastor` → everything.
- `clerk` → GAs whose church is in the clerk's `church` / `churches`.
- `ga_leader` → GAs in `ga_ids`.
- A user with several roles gets the union.

Rules:
- `create`/`update`: target `gaId` must be in scope, and so must the existing row on `update` /
  `attend` / `delete`; otherwise `403 forbidden`.
- Phone / e-mail normalized and validated with `normalizePhone` / `isValidPhone` /
  `normalizeEmail` / `isValidEmail` (`src/lib/contact.js`); invalid → `400 invalid_phone` /
  `invalid_email`. Empty name → `400 invalid_name`.
- Every write is verified (`Prefer: return=representation`) — no row back → `404 not_found`.
- Each write adds an `audit_log` entry with action and guest id; **never** phone or e-mail values.

`currentUser` today selects only `id,name,sys_role,sys_roles`; the handler fetches the extra scope
columns (`church,churches,ga_ids`) itself rather than widening the shared helper.

## Client

**`src/lib/trumpets.js`** (pure, unit-tested)
- `gaScope(user, gas)` → GA ids the user may see/edit (mirrors the server rule; UI only — the server
  is the authority).
- `totalsByGa(guests, gas)` → `[{ gaId, name, invited, attended, pct }]`; `churchTotals(...)`.
- `guestsCsv(guests, { gas, members, lang })` → CSV string (name, phone, e-mail, invited by, GA,
  attended).

**`src/lib/trumpetsApi.js`** — fetch wrapper around the API (like `contactApi.js`). In `npm run dev`
without serverless functions it falls back to an in-memory store seeded from `src/dev/seeds.js`;
production builds drop that branch.

**`src/sections/assistance/TrumpetsTab.jsx`**
- Header: year selector (current year default), GA selector (hidden when the user has one GA; "All"
  for church-scope users), church selector for users with several `churches`.
- Church view ("All"): one card per GA — invited / attended / % — plus the church total; tapping a
  card filters to that GA.
- List: search by name; stacked cards on phones, table on desktop. Name, phone (`tel:` link), invited
  by, GA, large attendance toggle.
- "+ Guest" modal: name, phone, e-mail, invited by (member search limited to the GA's church), notes;
  GA preset from the selector. **Create waits for the server** (the id is needed before editing or
  marking attendance); update / attend / delete are optimistic with a toast on failure, like the rest
  of the app.
- Export CSV of the current filter.
- All strings in PT and EN (`src/i18n/strings.js`); styling per `FRONTEND_SYSTEM_GUIDELINES.md`.

**Access**
- `SECTION_ROLES.assistance` gains `ga_leader`.
- `AssistanceSection` filters its `TABS` by role: Frequência stays admin / clerk / pastor; Trombetas
  is open to everyone who can enter the section. A GA leader lands on Trombetas.

## T&F panel (pastor and admin only)

Added 2026-11-07 after the first review: a big-screen dashboard like `/events/painel`, but **not
public** — it shows member names, so it sits behind the PIN and only admin / pastor open it.

- Route `/assistance/trombetas/painel/:year?` inside `AuthGate` but outside `HubShell` (full screen
  for the projector). Others get the no-access message. Admin / pastor get an "Open panel" button on
  the Trombetas tab.
- Data: `api/trumpet-guests.js` action `stats { year }` (admin / pastor only, else 403) returns
  aggregates only — never phone or e-mail. Polled every 20 s.
- Indicators: invited (big number), attended, attendance %; **goal** progress bar (overall) and per
  church; **year over year** (+/− and % vs `year - 1`, invited and attended); bars **per church**
  (invited / attended); **top 10 GAs** by invited; **top 10 members who invited the most** (name);
  **guests added per day** (bar chart, last 60 days up to today).
- Goals: table `trumpet_goals (year, church, goal)` — `church = ''` is the overall goal — in the
  same migration, server-only. Admin / pastor edit them on the Trombetas tab (actions `goals`,
  `setGoal`); `goals` is readable by anyone in the tab, `setGoal` only by admin / pastor.

## Errors

- API errors map to localized toasts (forbidden, invalid phone/e-mail, not found, offline).
- A GA leader with no `ga_ids` sees an empty state explaining that no GA is assigned.
- Failed create keeps the modal open with the typed values.

## Testing (Vitest)

- `trumpets.test.js`: `gaScope` per role and role union; totals and % (zero-guest GA → 0%); CSV
  escaping (commas, quotes, accents).
- `trumpetGuestsApi.test.js`: handler with a mocked `rest` — GA leader outside scope → 403; `list`
  filtered by scope; invalid phone → 400; audit entry has no contact values; missing row → 404.
- `TrumpetsTab.test.jsx`: add a guest, toggle attendance, totals update; GA leader doesn't see the
  Frequência tab.

## Docs

- `CHANGELOG.md` `[Unreleased]`: Added (Trombetas e Festas tab) + Database (052).
- `CLAUDE.md`: `trumpet_guests` in the table list as server-only; `api/trumpet-guests.js` in
  Serverless Functions; `/assistance` row mentions the new tab.
- `docs/PLAN.md` and `docs/pt/PLAN.md`.

---

## Revision 2 (2026-11-08) — member link, motivos, indicators at every level

Leonard's new requirements (2026-11-08), which **supersede** the sections above where they differ:

> Módulo nos grupos: um link para os membros do grupo cadastrarem seus convidados, e o líder acompanha;
> consolidado na visão da secretaria e do pastor. Líder vê seu grupo; secretaria todos os grupos da sua
> igreja; pastor todas as igrejas (por igreja). Lista: nome, telefone, e-mail (opcional), quem convidou,
> notas. Os motivos no topo, visíveis a todos e para download. O líder vê tudo e indicadores (total, total
> por membro, quem convidou mais…). Drill-down: pastor → igreja → grupo → membro.

### What changes

1. **Phone is required** (name + phone; e-mail optional; invited by; notes). `cleanGuestInput` returns
   `invalid_phone` when empty.
2. **Scope reuses `src/lib/clerkScope.js`** (from main, PR #68): clerk = `clerkCities(user)` with `"*"` =
   every church; pastor / admin = every church; GA leader = their `ga_ids`. Server and browser use the
   same function (it has no `@/` imports). The branch merges `origin/main` first.
3. **Member link per GA and year.** In the tab the GA leader (or staff) taps "Gerar link do grupo"; it
   creates a random 24-char token in a new server-only table `trumpet_links (token, year, ga_id, active,
   created_by, created_at)`. The leader can turn it off and make a new one. The public page
   `/trombetas/:token` (outside `PublicLayout`, like `/frequencia`) shows:
   - the **motivos** of the year at the top, with "Baixar imagem" (same look as the 24h prayer board,
     `ReasonsMarkdown` + an image export like `ReasonsImageButton`);
   - "Quem é você?": the member picks their own name from **their GA's members** (names only) — that is
     the "quem convidou";
   - a form: name, phone, e-mail (optional), notes → saved;
   - **what the member sees after that — decision for Leonard (Q1 below).**
   Public calls go through `api/trumpet-public.js` (no session; token checked on the server; inputs
   validated; at most 30 guests per token per hour). The guest tables stay server-only.
4. **Motivos per year**, PT and EN, markdown, written by pastor / admin (Q3) in a new table
   `trumpet_editions (year PK, reasons text, reasons_en text)`; shown at the top of the tab, the member
   page and the panel, all downloadable as an image.
5. **Indicators at every level, as a drill-down**, in the Trombetas tab:
   - **Pastor / admin:** all churches → cards per church (invited, attended, %, goal) → tap a church.
   - **Church (clerk lands here; for several churches, a church picker):** the same numbers for the
     church, then one card per GA → tap a GA.
   - **GA (GA leader lands here):** the GA's numbers, **total per member** (each member who invited, how
     many, how many came), **top inviters**, then the guest list (name, phone, e-mail, invited by, notes,
     attended toggle) with CSV.
   - **Member:** tap a member → only the guests they invited.
   A breadcrumb (Igrejas › Newark › GA Central › Ana) goes back up. Every level shows: invited,
   attended, %, goal (where set), top inviters, and the breakdown of the level below. All computed in
   the browser from the scoped guest list (one pure function `levelStats(guests, level)`).
6. The **big-screen panel** (pastor / admin) stays as designed.

### Data changes (migration 054, still unapplied, gets the new tables)

```
trumpet_links    (token text PK, year int, ga_id text FK, active bool, created_by text, created_at)
trumpet_editions (year int PK, reasons text, reasons_en text, updated_at, updated_by)
```
Both server-only like the others.

### Open decisions (asked to Leonard)

- **Q1 — what a member sees on the link:** (a) only the guests they added from that phone, plus the
  GA's total count *(recommended: the link is shared in WhatsApp groups, so anyone who gets it would
  otherwise see every guest's phone)*; (b) the whole GA list with phones.
- **Q2 — can a member fix or delete a guest from the link?** (a) only right after adding, on the same
  phone *(recommended)*; (b) no, the leader corrects; (c) yes, any guest of the GA.
- **Q3 — who writes the motivos:** (a) pastor / admin, one text for every church *(recommended)*;
  (b) each church's secretaria writes its own.

---

## Revision 3 (2026-11-09) — only the GA leader sees the list

Leonard, 2026-11-09: "Só o líder de grupo vê a lista no sistema. Ele pode exportar a lista pra postar no
grupo." Follow-up answers: no member link; secretaria and pastor see numbers only; the export for the
group carries the motivos and the names.

This **replaces Revision 2 items 3 and 5** and changes the original access rules:

| Who | Sees in the system | Can edit |
|---|---|---|
| GA leader | the full list of **their** GAs (name, phone, e-mail, invited by, notes, attended) + the GA's indicators | add / edit / delete / attendance in their GAs |
| Secretaria (clerk, `clerkCities`, `"*"` = all) | **numbers only**: church → GA → member drill-down | nothing on guests |
| Pastor / admin | **numbers only**: all churches → church → GA → member; the big-screen panel; goals; motivos | goals, motivos |

- **No member link** (`trumpet_links` and the public page are dropped). Members get the list from the
  leader in the WhatsApp group.
- **Server rule:** `list`, `create`, `update`, `attend`, `delete` only for a caller with the `ga_leader`
  role, limited to their `ga_ids` (a GA leader who is also clerk / pastor still sees only their own GAs'
  lists). New action `summary { year }` for clerk / pastor / admin / GA leader returns aggregates only in
  the caller's scope:
  `{ churches: [{ church, invited, attended, goal, gas: [{ gaId, name, invited, attended,
  members: [{ memberId, name, invited, attended }] }] }] }` — inviter names are members, never guests.
  No guest name, phone or e-mail leaves the server through `summary` or `stats`.
- **Drill-down (numbers):** pastor / admin start at all churches, clerk at their church (picker if
  several), GA leader at their GA. Each level: invited, attended, %, goal, top inviters, and the cards of
  the level below; the member level shows that member's counts. The GA leader's GA level also shows the
  list.
- **Export for the group (GA leader):** "Baixar imagem para o grupo" — a light, 600 px sheet like
  `ReasonsImageButton`: the year's motivos on top, then each guest's **name and who invited**, no phone,
  e-mail or notes. On a phone it opens the share sheet. The leader also keeps a full CSV for their own
  use.
- **Phone required** on add / edit (Revision 2 item 1 stands).
- **Motivos:** one text per year, PT and EN, written by pastor / admin (`trumpet_editions`), shown at the
  top of the tab and on the panel, with "Baixar imagem" for everyone who opens the tab. *(Default chosen
  on 2026-11-09; Leonard didn't pick — change if each church should write its own.)*
- Clerk scope uses `clerkCities` / `inClerkScope` from `src/lib/clerkScope.js` (merge `origin/main`).
- Panel unchanged (pastor / admin, numbers only — it never had contacts; top inviters are member names).

Data: migration 054 (still unapplied) keeps `trumpet_guests` and `trumpet_goals` and adds
`trumpet_editions (year int PK, reasons text, reasons_en text, updated_at, updated_by)`, server-only.
