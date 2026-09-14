# MCC Newark Events — Project Notes

## App Purpose

Event registration and management app for **ICM Newark** (Igreja Cristã Maranatha). Handles participant sign-ups for church events across 15 US/Canada congregations, with capacity enforcement, waitlists, fee tracking, team rostering, and badge printing.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 19, no router |
| Backend / DB | Supabase (Postgres + Supabase JS v2) |
| Hosting | Vercel |
| Icons | lucide-react |
| PDF/badges | html2canvas + jspdf |
| QR codes | qrcode |
| Tests | Vitest + @testing-library/react |
| UI language | Portuguese (Brazilian), hardcoded `lang = "pt"` |

---

## Folder Structure

```
src/
  App.jsx                    # Root: session restore, view routing
  index.css                  # All styles (CSS vars for theming)
  constants/index.js         # Roles, categories, churches, helpers
  i18n/strings.js            # i18n PT/EN strings
  lib/supabase.js            # Supabase client (sb)
  hooks/
    useAppData.js            # Central data hook — all state + mutations
    useAuth.js               # PIN login/logout
  views/
    LoginScreen.jsx
    PublicPortal.jsx         # 4-step self-registration flow
    CheckInScreen.jsx        # URL-param: ?checkin=<regNumber>
    SelfCheckInScreen.jsx    # URL-param: ?selfcheckin=<eventId>
    AdminView.jsx            # Full admin panel
    ClerkView.jsx
    PastorView.jsx
    GALeaderView.jsx
    TeamLeaderView.jsx
    admin/
      BadgesTab.jsx
      EventsTab.jsx
      RegistrationsTab.jsx
      ReportsTab.jsx
      TeamsTab.jsx
  components/
    ApprovalsPanel, BadgePrint, CapBar, ChurchSearch
    DetailModal, FeeBox, ICMLogo, Modal, PinLogin
    RegModal, Sidebar, StatusBadge, Topbar
  dev/seeds.js
migrations/
  001–010 SQL migrations
```

---

## Key Architectural Decisions

### No router — view state in App.jsx
Views are rendered with conditional JSX based on a `view` string state. URL params (`?checkin=` and `?selfcheckin=`) bypass auth entirely for kiosk/QR use cases.

### PIN-based auth (no Supabase auth)
4-digit PINs stored in `app_users` table. Session persisted via `localStorage` (`mcc_pin`, `mcc_view`). `useAuth` handles login/logout. `userRef` pattern avoids stale closure in `useAppData`.

### Upfront data loading
All 12 tables loaded in a single `Promise.all` on mount in `useAppData`. No lazy loading, no pagination — entire DB in memory. Works fine at current data scale.

### Optimistic UI everywhere
All mutations update local React state immediately, then fire Supabase async. Errors are logged but not surfaced to the user (silent failure on DB errors).

### Derived state via `useMemo`
`activeRegs`, `wlRegs`, `exRegs`, `pendingApprovals`, `isFull` are memos off `regs + event`.

### Supabase RLS disabled
All 12 tables have RLS disabled (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`). The app uses PIN-based auth (not Supabase Auth), so all users share the same anon key — RLS cannot distinguish between roles. Security is enforced entirely at the app layer.

---

## Business Logic

### Roles
- **System roles** (for login/views): `admin`, `clerk`, `pastor`, `ga_leader`, `team_leader`, `treasurer`
- **Church roles** (on members/regs): 30+ ministry roles (Pastor, Ungido, Diácono, Obreiro, Grupo de Louvor, etc.)

### Auto-exempt
Pastors and Ungidos are automatically fee-exempt on registration (`addReg`) and when role is updated (`updateReg`).

### Deadline exemptions (`isDeadlineExempt`)
A reg is exempt from payment deadline if: already paid/exempt/cancelled/waitlisted, role is an Obreiro role, assigned to a service team, or belongs to a family that has an obreiro or service team member.

### Capacity flow
1. Event has a `capacity` number
2. `isFull = activeCount >= capacity`
3. When full: new regs go to **waitlist** automatically (unless exempt)
4. Clerk can force **excedente** (over-capacity) — triggers approval workflow
5. Pastor approves/denies capacity overrides via `ApprovalsPanel`
6. Cancellations notify clerk if there's a waitlisted person

### Registration number format
`{event.prefix}-{YYYYMMDD}-{0001}` — sequence tracked via `seqRef` (useRef), derived from max reg number on load.

### Public Portal (4-step flow)
1. Search member by name (translation needs moved to step 4)
2. Add family members (verified from DB or manual unverified)
3. Health info (allergies, special needs)
4. Contact info (phone optional, email optional) + translation needs + terms acceptance + submit

---

## Database Schema (14 tables)

| Table | Purpose |
|-------|---------|
| `events` | Event details, fees by category, capacity, prefix |
| `registrations` | Core reg records with all status flags |
| `members` | Member directory (name, category, church, role, family_id, ga_id) |
| `families` | Family groups with `member_ids[]` |
| `assistance_groups` | GA (Grupo de Assistência) groups |
| `approvals` | Capacity override / exemption requests |
| `rosters` | Team rosters per event |
| `churches` | Church list (overrides `CHURCH_LIST` constant if populated) |
| `app_users` | PIN-authenticated users with system roles |
| `categories` | Age categories (overrides `CATEGORIES` constant if populated) |
| `functions` | Ministry roles (overrides `ROLE_OPTIONS` if populated) |
| `teams` | Service teams (overrides `TEAMS` constant if populated) |
| `treasury_expenses` | Event expenses logged by Treasurer (category, amount, Google Drive receipt link) |
| `treasury_collections` | Extra income entries (donations, offerings, collections) per event |

Migrations in `migrations/001–010`.

---

## What's Working

- Full registration flow (public portal + admin desk)
- Capacity enforcement with waitlist and excedente
- Pastor approval workflow
- Fee tracking with auto-exempt for Pastor/Ungido
- Payment deadline tracking with family/team exemptions
- Badge printing (html2canvas → PDF)
- QR code check-in (`?checkin=` and `?selfcheckin=` URL params)
- CSV bulk import (members, families, GA, teams, churches)
- Directory CRUD (churches, members, families, GA, rosters, teams)
- PIN user management
- Role-based view routing
- Session persistence across page reloads
- Dark/light theme toggle
- Bilingual UI (PT/EN strings in `i18n/strings.js`)
- Real-time sync between clerks (Supabase postgres_changes on registrations + approvals)
- Admin bulk delete (checkbox column + confirmation modal in RegistrationsTab)
- **Consultar Inscrição** — self-service lookup by reg number OR name; cancel individual or full family group; add a new family member to an existing registration; batch-token grouping keeps family submissions together even without contact info; paid regs blocked from self-cancel with "fale com um atendente" message
- **Terms of Acceptance** — rich formatting (headings, bold, bullets, italic); pt/en language tabs; payment deadline callout (⚠️ highlighted, shows actual days from event config); separate amber acknowledgement checkbox required before submit
- **Tesouraria** — `treasurer` sys_role with TreasurerView: Balanço (summary + breakdown by expense category), Inscrições (read-only payment status), Despesas (add/edit expenses with Google Drive receipt links), Outras Entradas (donations, offerings). Pastor sees read-only version; Admin has full access.

---

## Fixed Bugs — Session 2026-06-13/14

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Public portal "Nenhum membro encontrado" | `LoginScreen` rendered its own internal `PublicPortal` with `SAMPLE_EVENT` and no `members`/`regs`/`addReg` props — bypassing App.jsx entirely | Wired "Fazer minha inscrição" button to `onPublicRegister` callback → App.jsx renders the real PublicPortal with live data |
| Family registration 409 Conflict | `famId = "FAM-" + Date.now()` violated FK constraint `registrations_family_id_fkey` (must reference `families.id`) | Set `famId = null` in portal submit |
| Registration sequence duplicates | `addReg` read stale `seq` state in concurrent family submissions | Replaced `seq` state reads with `seqRef.current` (useRef) |
| Pastor/Ungido not auto-exempt on role change | `updateReg` didn't apply exempt/fee=0 when role was updated to Pastor/Ungido | Added `autoExempt` object merged into the updated reg |
| Admin directory column filters caused crash | `FilterTh` factory pattern broke React hook rules | Refactored to `makeTh` helper |
| Admin bulk delete missing | No way to delete multiple registrations at once | Added checkbox column + bulk delete with confirmation modal in RegistrationsTab |
| All DB writes silently failing (Pago not saving) | Supabase RLS enabled on all 12 tables with no anon write policies; optimistic UI hid the failure | Disabled RLS on all 12 tables (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) |
| `updateReg` crashing with `sb.from(...).eq is not a function` | Supabase JS v2 requires `.update(data).eq(col, val)` — code had `.eq().update()` (reversed) | Swapped to `.update(dbUpd).eq("id", id)` in both `updateReg` and `resolveApproval` |
| `promoteFromWaitlist` not persisting | Only updated local state; no DB write | Added `sb.from("registrations").update(...)` |
| Real-time not delivering events | RLS blocked SELECT for anon role; Realtime checks RLS before delivering events | Fixed by disabling RLS entirely |
| Portal shows "not found" for already-registered members | `primaryResults` filtered out members in `existingMemberIds`, so searching your name returned nothing | Removed exclusion filter from primary search; now shows "Já inscrito" card with reg number, date, and status (Pago/Pendente/Isento/Excedente/Lista de Espera) |
| Portal phone field blocked registration | Phone was marked required in step 1 | Made phone optional; moved phone + email + translation needs to step 4 ("Contato & Termos") so step 1 is just name search |
| No self-service cancellation | Participants had no way to cancel without contacting a clerk | Added "Consultar inscrição" on home screen: enter reg number → see status → cancel (individual or full family group). Paid regs blocked from self-cancel with "fale com um atendente" message |
| Family grouping broken when phone omitted | Batch token `[B{ts}]` approach meant empty `note` field when no phone provided, breaking `resolveRelated` | Batch token now always prepended; falls back to `note === note` match for legacy regs |
| "Notificação Atualizado!" shown on public cancel | `updateReg` always called `notify("Atualizado!")` | Added `opts.silent` 4th param; public-facing calls pass `{ silent: true }` |
| Terms text unformatted, no deadline emphasis | Plain string constant, no deadline integration | Replaced with `TermsContent` JSX component: pt/en tabs, rich formatting, ⚠️ deadline callout with amber checkbox |
| Build crash (vite:oxc syntax error line 61) | Typographic `"..."` curly-quote characters inside a JSX string literal broke the parser | Replaced both branches of the JSX ternary with `<>...</>` fragments using `<em>` for emphasis |

---

## Known Patterns / Gotchas

- `CHURCH_LIST` constant is the fallback — DB `churches` table overrides it if populated
- Same for `categories`, `functions`, `teams` tables overriding their constants
- `mapReg` uses `reg.presence || 'unknown'` — presence can be `present`, `absent`, or `unknown`
- `member_id: "GUEST"` is used for unverified/manual registrants
- `registrations.family_id` is a FK to `families.id` — do NOT use temp string IDs here
- Optimistic temp IDs: `"tmp-" + n` for regs, `"tmp-apr-" + Date.now()` for approvals
- `seqRef.current` (not `seq` state) is the authoritative sequence counter in `addReg`
- Supabase JS v2: always `.update(data).eq(col, val)` — filter AFTER mutation, never before
- RLS is disabled on all tables — if Supabase Auth is ever added, re-evaluate policies

---

## Vercel Dev/Staging Setup (manual steps — not yet done)

To avoid testing against production data:
1. Create a second Supabase project (e.g. "mcc-newark-hub-staging")
2. Run all migrations from `migrations/` on the staging project
3. In Vercel Dashboard → Project → Settings → Environment Variables:
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` for the **Preview** environment pointing to the staging Supabase project
   - Keep Production env vars pointing to the real project
4. Feature branches auto-deploy as Vercel Preview URLs and will use staging DB; `master` deploys to Production

---

## Test Coverage

- **41 tests passing** as of 2026-06-14
- `src/test/constants.test.js` — `fmt`, `daysSince`, `isDeadlineExempt`, `deadlineStatus`, `churchDisplay`, `churchCode`
- `src/test/registration.test.js` — `mapReg`, `extractBatchId`, `dateFromRegNumber`, `getRegStatus`
- Run with: `npx vitest run`
- Not yet covered: `addReg` (requires Supabase mock), portal submit flow (requires React Testing Library)

---

## Next Steps

1. **Paid status on portal confirmation** — fee amount and payment instructions could be more prominent on the post-submit screen; include payment method / who to pay
2. **Vercel staging** — set up staging Supabase project and wire Preview env vars (steps above); defer non-critical merges until after staging is in place
3. **`addReg` / portal submit tests** — requires mocking the Supabase client; defer until staging env is set up
