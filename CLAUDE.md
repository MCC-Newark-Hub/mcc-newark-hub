# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server at localhost:5173
npm run build        # Production build (Vite)
npm run lint         # ESLint
npm run format       # Prettier (JS/JSX)
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npm run preview      # Preview production build locally
```

Path alias: `@/` maps to `./src/` (configured in `vite.config.js`).

## Changelog

Every change (feature, fix, refactor) must be added to `CHANGELOG.md` under `[Unreleased]` in the same commit/session that makes it — not deferred. Use the categories already defined at the bottom of that file (Added/Changed/Fixed/Removed/Security/Database).

## Architecture

### Router

Uses React Router v6. `<BrowserRouter>` in `src/main.jsx`; full route tree in `src/App.jsx`.

**Public routes** (no PIN required):

| Path | Component |
|---|---|
| `/login` | HubLoginScreen |
| `/events/register` | PublicPortal |
| `/events/lookup` | RegistrationLookup |
| `/events/checkin?reg=<regNumber>` | CheckInScreen |
| `/events/selfcheckin/:eventId` | SelfCheckInScreen |
| `/24h-prayers/:id?` (aliases `/uninterrupted-prayers`, `/uninterrupted-prayer`) | PrayerPublicView — 24h prayer board; shows every active `prayer_periods` row as a tab (one period = one list, each with its own church scope). Deliberately outside `PublicLayout` so it stays open in maintenance mode |

**PIN-gated routes** (wrapped in `AuthGate` → `HubShell`):

| Path | Component |
|---|---|
| `/` | HubHome — section picker tile grid |
| `/events` | EventsSection — routes to staff view by `user.sysRole` |
| `/cms` | CMSSection — church/member management (Phase 4+) |
| `/schedule` | ScheduleSection — door/flower rotations, prayer agenda (Phase 3+) |
| `/apprentice` | ApprenticeSection — Projeto Aprendiz (TBD) |
| `/settings` | SettingsSection — users, PINs, audit (Phase 5+) |

**Staff view mapping** (inside EventsSection, by `sysRole`):

| sysRole | View |
|---|---|
| `admin` | AdminView — full system access |
| `clerk` | ClerkView — scoped to their church city |
| `pastor` | PastorView — approvals and oversight |
| `ga_leader` | GALeaderView — scoped to their assigned GA IDs |
| `team_leader` | TeamLeaderView — scoped to their team rosters |
| `treasurer` | TreasurerView — financial management |

Internal tab navigation **inside** sections (AdminView `setSec()`, etc.) stays `useState`-based — no sub-routes.

Vercel SPA rewrite in `vercel.json`: `/((?!api/).*)` → `/index.html` so deep-link refreshes don't 404.

Backward compat: old QR codes with `?checkin=` or `?selfcheckin=` query params are detected on mount in App.jsx and redirected to new route paths.

### Session & Auth

PIN-based. `useAuth.js` matches entered PIN against `app_users` table (falling back to `src/dev/seeds.js` INIT_USERS for offline/dev). All session state lives in `localStorage`: `mcc_pin`, `mcc_pin_ts`, `mcc_view`, `mcc_session_ttl_hours`. TTL is admin-configurable in the DB (`app_settings.session_ttl_hours`, default 2h) and cached locally so it's checked synchronously on mount before any async load completes.

### Data Loading & State (`useAppData.js`)

All 12+ tables load in a single `Promise.all` on mount. Results are mapped from snake_case DB columns to camelCase via `mapMember()`, `mapReg()`, `mapFamily()`, etc. The full data object (`appData`) is passed as props to every view — there is no global store or context for app data.

Real-time subscriptions on `registrations` and `approvals` keep those two tables live without polling.

### Mutation Pattern: Optimistic First

Every write updates React state immediately, then fires an async Supabase call. Failures are toasted but **the UI is not rolled back**. This is by design for the desk-clerk use case.

```js
setRegs(prev => [...prev, newReg]);           // 1. Update UI immediately
sb.from("registrations").insert(row)          // 2. Async DB write
  .then(({ error }) => { if (error) notify("…"); });
```

**Exception**: `PublicPortal`'s `addReg()` awaits `optimisticReg.confirmed` before showing the success screen, because a self-registrant needs to know their reg number actually saved.

### Registration Sequence Numbers

`seqRef` (a `useRef`) — not React state — holds the next reg number. This is critical: family submissions call `addReg()` multiple times synchronously in a loop, and state would give every call the same stale snapshot. The ref updates immediately on each call.

### Families: Bidirectional Sync

A family can be linked from either direction: `member.familyId` (FK) or `family.memberIds` (array). Always use `familyIdOf(member, families)` from `src/lib/family.js` — it checks both directions. Writing only one direction is a known data inconsistency that exists in production.

### Approval Workflow

Four types handled by PastorView: `capacity_override`, `late_registration`, `exemption`, `reactivation`, `deadline_extension`. Approvals store the full intended registration payload so they self-contain everything needed to create the real registration row on approval.

### Role Auto-Exemption

Pastors and Ungidos are automatically marked `exempt: true, fee: 0` at registration time (in `addReg`). Pastores, Ungidos, and Diáconos are also auto-added to their service team rosters on role assignment.

### i18n

`LangContext` (in `src/i18n/strings.js`) provides the current language string (`"pt"` or `"en"`). Use `useT()` to get the full `STRINGS[lang]` object, or `useLang()` for just the language key. All UI strings must have both PT and EN entries. Language persists in `localStorage.mcc_lang`.

### Supabase Tables

`churches`, `members`, `families`, `assistance_groups`, `events`, `registrations`, `rosters`, `teams`, `approvals`, `app_users`, `app_settings`, `audit_log`, `prayer_periods`, `schedule_oracao`, `church_groups`, `church_group_members`

**Critical — new tables**: RLS must be **explicitly disabled** on every new table or all writes will silently fail with no error. Always add:

```sql
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON your_table TO anon, authenticated, service_role;
```

Verify with: `SELECT relrowsecurity FROM pg_class WHERE relname = 'your_table';` → must return `false`.

Also: always verify UPDATE/DELETE actually changed rows by chaining `.select()` — Supabase returns no error when a row simply isn't found.

### Serverless Functions

`api/` contains Vercel serverless functions: `send-confirmation.js`, `daily-backup.js`, `auto-cancel-overdue.js`. These use server-side env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — distinct from the client-side `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY`. Keep both pairs in sync in `.env`; they point at the same project but are separate variables.

### Deployment

Vercel auto-deploys on push to `main` (team: `mcc-newark-dev-s-projects`, project: `newark-events-app`). The `dist/` folder is gitignored — Vercel builds from source. Live at `mcc-newark-hub.vercel.app` (new primary domain) — `mcc-newark-events.vercel.app` stays attached and unredirected so existing printed badge QR codes and shared links keep working.
