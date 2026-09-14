# Changelog

All notable changes to `events-app` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
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

### Fixed
- Badge CSV/PDF showing empty team for roster-assigned members.
- Waitlist filter and member category sync on class move (CIA report work).
- Middle dot rendering as literal `·` in ClerkView stats.

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
