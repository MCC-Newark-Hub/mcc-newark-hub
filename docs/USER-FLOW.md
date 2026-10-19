# App User Flow — MCC Newark Hub (v1)

**Retroactive document** · 2026-10-19 · Describes the screens that exist today and each person's path.
**Other languages:** [Português](pt/USER-FLOW.md)

Notation: **[Button]** = click · → = next screen. Addresses are in `code`.

---

## 1. Screen map

### Public (no PIN)

| # | Screen | Address |
|---|---|---|
| P1 | Sign in (PIN) | `/login` |
| P2 | Registration portal (5 steps + success) | `/events/register` |
| P3 | Look up a registration | `/events/lookup` |
| P4 | QR check-in | `/events/checkin?reg=…` |
| P5 | Self-service check-in | `/events/selfcheckin/:eventId` |
| P6 | Door-duty schedule of the month | `/portaria/:month` (or `/door-schedule`) |
| P7 | 24h prayer board | `/24h-prayers/:id?` |
| P8 | Praise Song List (enter / view) | `/culto-profetico/:id?` (or `/prophetic-service`) |
| P9 | Songs of the day | `/songs/:date` |

### With a PIN (secretary and staff portal)

| # | Screen | Address |
|---|---|---|
| H1 | Home (pick a module) | `/` |
| H2 | **Events**: one view per profile (see §3) | `/events` |
| H3 | **Directory** | `/cms` |
| H4 | **Schedules** | `/schedule` |
| H4b | **Prophetic Service** (praise song lists, catalogue, history) | `/worship` |
| H5 | **Settings** (administrator only) | `/settings` |
| H6 | Apprentice (shown as "coming soon", no screen) | — |

Every PIN screen redirects to `/login` when the session has ended. Any unknown address redirects to `/login`.

---

## 2. Participant flows (public)

### 2.1 Register (P2)
1. Open `/events/register`. **Step 0:** see the event (date, place, fees, seats) and accept the payment notice → **[Start]**.
   - If the event has already happened, only a notice appears, with no form.
2. **Step 1 — Identification:** search for your own name in the directory (or enter as new/visitor) and choose a church → **[Next]** (advances only when the required fields are valid).
3. **Step 2 — Family:** optionally add relatives (search the directory or type) → **[Next: Health →]** or **[Back]**.
4. **Step 3 — Health and needs:** allergies, special needs, translation, accessibility → **[Next: Contact & Terms →]**.
5. **Step 4 — Contact and terms:** contact (required for minors), acceptance of the terms → **[Submit]**.
6. **Success:** shows the registration number and the status. The portal waits for the database to confirm before showing this screen.
   - Full event or overdue deadline: the registration becomes an **approval request** (goes to the pastor) or a **waiting-list entry**.
7. At any step, **[Language PT/EN]** switches the text; **[Look up my registration]** → P3.

> Today the email is **not** sent automatically; the receipt stays on screen only (see PRD, step 3).

### 2.2 Look up your registration (P3)
`/events/lookup` → type your name → see status, fee and deadline → you may fix your data or register, depending on the case → **[Back]** → `/login`.

### 2.3 Check-in
- **P4 (attendant):** scan the badge QR → the page opens with the result:
  `loading` → `found` → **[Confirm]** → `done`; or `already`, `not found`, `locked`.
- **P5 (self-service):** the person types their name and confirms their own presence.

### 2.4 Read-only pages
- **P6 Door duty:** month calendar with previous/next month arrows.
- **P7 24h prayer:** without `:id`, shows one card per active list → **[card]** → time-slot board → choose a slot, church and name → **[Confirm]**.
- **P8 Praise Song List:** the person entering the list picks the date and service, fills it in, searches songs, **[Save]**, **[Publish link]**. With a published list's `/:id`, it shows only the sheet, with **[Download image]** and **[Download PDF]**.

---

## 3. Staff flows (with a PIN)

### 3.1 Sign in (P1 → H1)
1. Type the PIN (4 digits) → **[Sign in]**.
   - Wrong PIN: an error message and the field clears.
   - Maintenance mode: only the administrator (and Pr Nairon) get in; everyone else sees the notice.
2. Always goes to **H1** (the Home with the cards of the person's profile). The top bar shows the name, language, light/dark theme and **[Sign out]**.
3. Anyone with more than one profile sees **[Switch role]** and chooses which profile to use.

### 3.2 Home (H1)
Shows one card per module, depending on the profile:

| Module | Who sees it |
|---|---|
| Events | admin, secretary, pastor, GA leader, team leader, treasurer |
| Directory | admin, secretary, pastor |
| Schedules | all profiles |
| Prophetic Service | all profiles (editing: administrators and the Praise Group leader) |
| Apprentice (coming soon) | admin, secretary, pastor |
| Settings | admin |

### 3.3 Events (H2): side menu of each profile

| Profile | Menu items |
|---|---|
| **Administrator** | Overview · Summary · Registrations · Teams · Approvals (with counter) · Reports · Events · Treasury · Kitchen · Badges |
| **Secretary** | Summary · Registrations · Reports · Members · Families · Groups · Members with Functions (all limited to their church) |
| **Pastor** | Dashboard · Summary · Registrations · Approvals · Reports · Treasury (if allowed) · Members with Functions · Org chart (only users in `ORG_CHART_USER_IDS`) |
| **GA leader** | A view limited to their groups |
| **Team leader** | Team · Members with Functions, plus tabs specific to each team (CIA: Classes, Team, Teachers, Reports; Kitchen: Planning; Translation; Praise) |
| **Treasurer** | Balance · Registrations · Expenses · Other Income |

**Secretary's main path (Registrations):**
1. **[Registrations]** → list with filters (paid, pending, overdue, waiting list, cancelled) and search.
2. **[New registration]** (for someone who did not use the portal) → choose the person → confirm.
3. On a row: **[Record payment]** (marks as paid) · **[Exempt]** · **[Cancel]** (asks for a reason) · **[Reactivate]** · **[Edit]** · **[Resend email]** → opens the detail.
4. Sold-out seats, overdue deadline, exemption or reactivation: creates a request under **Approvals**.

**Pastor's path (Approvals):** **[Approvals]** → see the request (type, reason, note) → **[Approve]** or **[Decline]** (with a note) → the registration is created or adjusted.

### 3.4 Directory (H3), tabs
**Overview** (first) · **Directory** (Members, Families, Churches, Hubs and Areas, Org chart) · **Assistance Groups** (grouped by church) · **Functions** · **Import**.
- Pastors and secretaries see the **Overview** only for the church(es) of their access; the rest of the Directory belongs to the administrator.
- **Overview:** church filter · switch **Visual / Simple** · **[Download image/PDF]** · clicking "What is missing in the directory" opens the list of who it is.
- **Org chart:** **Tree** or **Diagram** (from 768 px) · open/close functions · **[Download image]** · **[Download PDF]**.
- **Import:** upload the spreadsheet → review → confirm.

### 3.5 Schedules (H4), tabs
**Door duty** (generate the month, adjust by hand, **[Publish]** → P6) · **Flowers** · **24h Prayer** (create a period, activate on the portal, import a spreadsheet, copy for WhatsApp).

### 3.5b Prophetic Service (H4b), tabs
**Pending songs** · **Catalogue** (totals that double as category filters, search, edit the number, title and category) · **Lists** (every service list; open and edit any one, **[Finalize]**). Songs are shown by number only (`198 · TITLE`); the prefix is internal.

### 3.6 Settings (H5), tabs
**Users & PINs** (create, **[Edit]**, **[Deactivate/Reactivate]**, choose profiles and churches) · **Lists** (immigration status, expense categories, income types, instruments, voices) · **Audit log** (who did what and when).

---

## 4. Common error and empty states
- **Expired session:** back to `/login`, then to the address that was being opened.
- **Save failure:** a notice (toast) appears for 3.5 s; the screen does not undo what it showed (optimistic mode).
- **No permission for a module:** its card does not even appear on Home.
- **No data:** "none found" messages in lists; "not published yet" on the praise list.
