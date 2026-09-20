# Changelog

All notable changes to `mcc-newark-hub` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- **`/24h-prayers` landing page** — when more than one prayer list is active, `/24h-prayers` shows a card per list (name, title, dates, scope, slots taken with progress bar, status badge) linking to `/24h-prayers/<list>`; with a single active list it still opens that board directly. Boards opened by link show "← Todas as listas" when other lists exist. Replaces the list tabs.
- All texts of the public prayer page (board, landing, church picker) now live in `src/i18n/strings.js` (PT + EN, `prayer*` keys, `fill()` helper for `{placeholders}`) instead of inline `pt ? … : …` ternaries, as the project convention asks.
- **Tesouraria module** — new `treasurer` sys_role with dedicated TreasurerView. Tabs: Balanço (financial summary), Inscrições (read-only payment status), Despesas (expense tracking), Outras Entradas (donations, collections). Accessible read-only by Pastor; full edit by Treasurer and Admin.
- `treasury_expenses` and `treasury_collections` Supabase tables (RLS disabled).
- Receipt attachments stored as Google Drive share links (replaced Supabase Storage).
- Registration access rules — clerks blocked from registering after deadline or when event is full/paused/locked; admin override routes to Pastor approval queue with mandatory comment.
- Emergency contact fields on member records (required for minors: Criança, Intermediário, Adolescente).
- Trilingual docs (PT/EN/ES) via mkdocs-static-i18n; in-app Help modal (iframe of GH Pages docs) with per-view contextual routing.
- **MCC Newark Hub refactor** — migrated to React Router v6 with section-based navigation (`/events`, `/cms`, `/schedule`, `/apprentice`, `/settings`); old `?checkin=`/`?selfcheckin=` QR links auto-redirect to the new route paths.
- **`/schedule` module** — Portaria (weekly door duty), Flores (flower rotation), Oração 24h (96-slot 15-min prayer grid) tabs.
- **Músicas tab** — staff setlist entry (Número + Título) per date/culto with autocomplete, use-count and 7-day recency badges; public PIN-free `/songs/:date` view for musicians, shareable by link.
- **CIA report** — dedicated Relatórios tab for CIA teacher/class leaders, Acessibilidade field, class dropdown for Coordenação, financials visibility toggle (`show_financials` per pastor profile).
- **Admin Listas tab** — manage lookup lists (expense categories, income types, etc.) without editing code constants.
- Badge redesign (3×2in, left-aligned text, larger QR) with QR code linking to per-registration check-in URL.
- **Maintenance mode** — `MAINTENANCE_MODE` flag in `src/constants/index.js`; while on, only admin PINs can log in (non-admin logins blocked, cached non-admin sessions kicked to `/login` via `AuthGate`), and all public routes (`/events/register`, `/events/lookup`, `/events/checkin`, `/events/selfcheckin/:eventId`, `/songs/:date`) show a bilingual maintenance notice instead of their normal content. Login screen shows the same notice as a banner above the PIN form. Added ahead of upcoming structural changes; flip the flag back to `false` to reopen.
- `MAINTENANCE_ALLOWED_USER_IDS` — small allowlist of non-admin `app_users.id`s permitted to log in while maintenance mode is on, for staff who need access without lifting the lockdown for everyone (currently: Nairon Pimentel, pastor).
- **Public 24h prayer board (`/24h-prayers`)** — members pick their own 15-minute slots with no PIN: enter name (free text) and church in a single searchable field (the four main churches first — Newark, Toms River, New York, Philadelphia — then the rest of the churches directory, accent-insensitive, with "Usar '…' (minha igreja não está na lista)" for a church that isn't listed), tap one or several free slots and confirm. The person prays at the same slot every day of the period. One person per slot, enforced by the database; trying a taken slot shows "already taken — choose another slot", including when two people race for the same slot. Free slots show an empty circle, taken ones a checkmark with the first name, a colored church label (city) and the rest of the name below in smaller type (nothing is cut off); the person's own slots (remembered per device) can be removed. The page shows the period as announced by the circular: title, optional circular number ("Circular Nº 150/26"), "De 00:00 de 21/09/2026 até 00:00 de 27/09/2026", the list of "Motivos de Oração" (with **bold**, *italic* and [links](https://…)), then "Períodos" (`00:00-00:15 - LIVRE / NOME`, last slot `23:45-00:00`) in two columns on desktop/tablet (00:00-12:00 | 12:00-00:00) and one column on phones. Fully bilingual: interface and content (English title and intentions are written in the admin; Portuguese shows if there is no English text). Several lists can be active at once (one period per list, e.g. Newark / Philadelphia / Texas): they appear as tabs, each restricted to the churches in its scope (single-church lists fill the church automatically), and `/24h-prayers/<code>` opens one list only. **Each list has a permanent link by name** — `/24h-prayers/newark`, `/philadelphia`, `/texas` (any case, accents ignored: `São Paulo` → `sao-paulo`) — that always shows the list of that name running today, moving on to the next circular's list by itself once the current one ends; `/24h-prayers/<code>` (e.g. `oracao24h-001`) also works, and `/24h-prayers` shows every list as tabs (one tab per list name). The admin tab shows and copies each list's link. Refreshes every 20s. Aliases: `/uninterrupted-prayers`, `/uninterrupted-prayer`. The route is deliberately outside `PublicLayout`, so it stays open during maintenance mode.
- **Diretório › Polos e Áreas** — create polos, áreas and regiões (named groups of churches; a church can be in several) with a filterable church picker; used to define the scope of a prayer period. Seeded with the three polos: Newark (Newark, Philadelphia, New York, Toms River), Texas (Austin, Houston) and Costa Oeste (Provo, Las Vegas, Haleiwa, Chino Hills) — editable in the UI.
- **Oração 24h admin tab rebuilt around "Períodos de Orações Ininterruptas"** — an admin creates a period (title, optional English title, optional circular number like `150/26`, list name, scope, start/end date, prayer intentions in Portuguese and English with a live markdown preview) and gets a sequential code (`oracao24h-001`, `-002`, …, like events). Each period is one list with its own **scope**: all churches, one or more polos/áreas/regiões (which expand to their churches), or specific churches — e.g. `-001` Newark (Newark, New York, Toms River), `-002` Philadelphia, `-003` Texas (all TX churches). "Nova lista deste período" duplicates the circular's title/dates/intentions for another list. A period is inactive until the admin clicks "Ativar no portal"; any number can be active (they show as tabs; finished periods hide unless nothing else is live). Also: edit/delete, **import from the previous period** (copies names + churches into the same slots, keeping slots already taken), "Copiar link público" (permanent `/24h-prayers`), "Copiar link só desta lista", "Copiar lista (WhatsApp)" (plain-text board in the circular's layout, bold/italic converted to WhatsApp syntax, English when the interface is in English), and the admin cannot overwrite a taken slot (must remove the name first). Fully translated PT/EN.

### Database
- `migrations/022_schedule_oracao.sql` — creates `prayer_periods` (text id `oracao24h-NNN`, title, optional `circular`, start/end date, `reasons text[]`, `is_active`) and `schedule_oracao` (one row per slot per period, unique on `period_id` + `slot_index`, cascade on period delete), both with RLS disabled, and seeds the first period (`oracao24h-001`, "ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA", 21/09/2026 – 27/09/2026, inactive). The Oração 24h tab shipped in 558fe0b but its table was never created in production (API returns 404), so every load came back empty and every save failed silently. Applied to the production database on 2026-09-20 with `supabase db query --linked -f migrations/022_schedule_oracao.sql` (run from a terminal: the app's project lives in the Supabase organization `mcc-newark`, which the dashboard login used in the browser cannot open). The `schedule_rotations`, `songs` and `setlist_entries` tables (Portaria/Flores/Músicas) are missing the same way.

- `migrations/023_church_groups.sql` — creates `church_groups` (polo / area / regiao, unique per kind + name) and `church_group_members` (cascade on group or church delete), seeds the three polos, and adds to `prayer_periods`: `list_name`, `title_en`, `reasons_en`, `scope_kind` (`all` | `groups` | `churches`, default `all`), `scope_group_ids`, `scope_churches`. Additive: the deployed code keeps working before it is applied (the new admin fields are only sent when used; the public page tolerates missing columns), but polos/scopes need it. **Not yet applied** — run `supabase db query --linked -f migrations/023_church_groups.sql` from a terminal (validated locally against a Postgres engine: idempotent, constraints and cascades behave as the app expects).

### Changed
- Admin Oração 24h: "Copiar link público" now copies the selected list's own link (`/24h-prayers/newark`); the link to the all-lists landing page moved to its own button "Copiar link de todas as listas".
- **Renamed project** from `events-app` to `mcc-newark-hub` for consistency with the app's own branding: GitHub repo (`MCC-Newark-Hub/mcc-newark-hub`, auto-redirected from the old name), package name (already `mcc-newark-hub`), Supabase project display name, docs (README, CONTRIBUTING, mkdocs.yml, docs/dev/*), and CHANGELOG title. `mcc-newark-hub.vercel.app` added as a new Vercel domain (production, no redirect) alongside the existing `mcc-newark-events.vercel.app`, which stays live indefinitely so already-printed badge QR codes and shared links keep working unchanged.

### Fixed
- Badge CSV/PDF showing empty team for roster-assigned members.
- Waitlist filter and member category sync on class move (CIA report work).
- Middle dot rendering as literal `·` in ClerkView stats.
- In-app Help modal and login screen tutorial link pointed at the old GitHub Pages docs URL (`.../events-app/`), which started 404ing the moment the repo was renamed — updated both to `.../mcc-newark-hub/`.
- Anyone with a saved staff session (e.g. an admin testing a link) was redirected to `/events` when opening any public page — `/24h-prayers`, `/songs/:date`, `/events/register`… — because the session-restore effect in `App.jsx` navigated unconditionally. It now only redirects from `/login` and `/`; members without a session were never affected.
- Oração 24h tab swallowed every database error (empty agenda on load failure, modal closing as if a save worked); failures now show a message. The assign modal also showed "23:45 — 23:45" for the last slot (now `23:45-00:00`), and the default date came from `toISOString()` (UTC), which flips to "tomorrow" in the evening in Newark.
- Balanço's "Arrecadado" total excluded paid registrations that were later cancelled, undercounting real revenue (cancellation doesn't refund a payment already collected) — `paid` in `TreasurerView.jsx`'s `BalanceTab` no longer filters out cancelled rows.

### In progress
- Password reset flow for internal users
- **CMS section** (`/cms`) — church/member management (Phase 4, placeholder live)
- **Settings section** (`/settings`) — users, PINs, audit log (Phase 5, placeholder live)
- **Apprentice section** (`/apprentice`) — Projeto Aprendiz (placeholder live, scope TBD)

---

## [1.0.0] — 2026-06-15

### Added
- Public registration portal (4-step flow)
- PDF badge auto-download on registration completion
- PIN-based internal access with 5 roles: Admin, Atendente, Pastor, GA Leader, Team Leader
- Payment tracking with family-level exemptions and deadline management
- Waitlist management
- Bulk registration mode
- Confirmation emails via Resend (sent to registrations inbox + participant)
- Thermal label badge printing (3"×2" landscape, B&W, BY48BT printer)
- CSV import module for members, churches, families, assistance groups, categories
- Supabase schema v2 (11 tables)
- Bilingual support — Portuguese (PT) primary, English (EN) available
- Vercel deployment with GitHub Actions integration
- MkDocs Material documentation site

### Database
- Initial schema with: `categories`, `functions`, `churches`, `families`, `assistance_groups`, `members`, `events`, `app_users`, `registrations`, `approvals`, `rosters`
- "Outra / Not Listed" and "Sem Igreja" church options included in seed data
- `church_custom` and `is_visitor` fields added to `members`

---

## How to add an entry

When you ship something, add it here under `[Unreleased]` first. On release, move it under the new version with the date.

Use these categories:
- **Added** — new features
- **Changed** — changes to existing features
- **Fixed** — bug fixes
- **Removed** — removed features
- **Security** — security patches
- **Database** — schema changes
