# Implementation Plan — MCC Newark Hub

**Retroactive + next cycle** · 2026-10-19 · Part 1 lists, in small steps and in the right order, **how v1 should be built** (and essentially was), with the test for each step. Part 2 organizes what is left to close v1 and open v2.
**Other languages:** [Português](pt/PLAN.md)

✅ done and in production · ⚠️ half done · ⬜ not yet

---

## Part 1 — v1, step by step

| # | Step | Deliverable | How to test before moving on | Status |
|---|---|---|---|---|
| 1 | **Foundation** | React + Vite project, routes, light/dark theme, PT/EN | `npm run build` passes; `/login` opens in both languages | ✅ |
| 2 | **Database** | Supabase, tables for people, churches, events, registrations; numbered migrations | Query each table through the API; `relrowsecurity` = `false` on new tables; rebuild the database from scratch with the migrations | ✅ |
| 3 | **PIN login** | `app_users`, session with a lifetime, profiles, scope by church | Right PIN gets in, wrong one does not; session expires at the configured time; each profile sees only its own menu | ✅ |
| 4 | **Directory** | Members, families, groups, functions, spreadsheet import | Create, edit, delete a member; import a spreadsheet with an error and see the review; the family has both ends | ✅ |
| 5 | **Public registration** | 5-step portal, registration number, own lookup | Register one person and one family on a phone; the number is unique; repeating the same person is blocked | ✅ |
| 6 | **Secretary panel** | List with filters, record payment, exempt, cancel, reactivate, scope by church | Record a payment and see the summary change; a Newark secretary does **not** see New York | ✅ |
| 7 | **Event rules** | Capacity, waiting list, deadline, automatic exemption | Fill the event and see the waiting list; pass the deadline and see "overdue" | ✅ |
| 8 | **Pastor approvals** | Request and decision flow | Request an extra seat → pastor approves → the registration is created | ✅ |
| 9 | **Audit log** | Record of who made each change | Change something and find the line with the name, action and date | ✅ |
| 10 | **Event day** | QR check-in and self-service, PDF badges | Scan a QR; scan again and see "already"; print a badge | ✅ |
| 11 | **Teams and kitchen** | Service teams, kitchen planning | Assign a leader and see their scope; the kitchen calculates by attendance | ✅ |
| 12 | **Treasury** | Balance, expenses, other income | Total collected = sum of paid; an expense with a receipt link | ✅ |
| 13 | **Schedules** | Monthly door duty, 24h prayer, flowers | Generate the month; publish; open the link without a PIN; book a prayer slot | ✅ |
| 14 | **Praise Song List** | Catalogue, list per service, public link, export | Create the list, publish, open without a PIN, download image/PDF, lock at the end | ✅ |
| 15 | **Org chart and Overview** | Tree and diagram by function, directory numbers, access by church | A pastor with limited access sees only their churches; totals match the Directory | ✅ |
| 16 | **Backup and email** | Daily copy; resending the receipt | Run the backup in `dryRun`; resend and receive the email | ⚠️ email manual only |
| 17 | **Named accounts** | One account per person, deactivate without erasing | A deactivated person cannot sign in; the audit log shows the name | ⚠️ shared accounts still active |

**Golden rule for every step:** `npm run test` and `npm run build` green, `CHANGELOG.md` updated, migration applied **before** the deploy. All new code, comments, docs and names are in English; every user-facing string is added to the i18n files (PT and EN).

---

## Part 2 — Close v1 and prepare v2

Each step is small and can go to production on its own.

### 2A. Close v1 (suggested order)

| # | Step | How to test | Depends on |
|---|---|---|---|
| A1 | **Login security:** remove the test PINs from the code | A test PIN no longer signs in; real PINs still do | a decision on the emergency "Admin" account (currently kept) |
| A2 | **Rotate the exposed service key** and remove it from the local file | Backup and email keep working with the new key | access to the Supabase dashboard |
| A3 | **Hand over named PINs** to the secretaries and deactivate the shared accounts | Each secretary signs in; the audit log shows the name | A1 |
| A4 | **Turn off maintenance mode** | Secretaries and pastors sign in; the public portal keeps working | A1, A3 |
| A5 | **Automatic email on registration** | Register with an email and receive it without the secretary clicking | A4 |
| A6 | **Email when payment is recorded** (payment receipt) | Record a payment and receive the email saying "Paid" | A5 |
| A7 | **Church secretary on the receipt** (screen and email) | Each church shows the right contact | names and contacts per church |
| A8 | **Schedule the automatic waiting list** | `?dryRun=true` is checked against reality before scheduling | A4 |
| A9 | **Move hard-coded UI text to i18n** as each screen is touched (e.g. `AdminView`, `ClerkView`, `TreasurerView`, role switcher) | Switch to EN and PT: no untranslated text remains on that screen | — |

### 2B. Prepare v2

| # | Step | Output |
|---|---|---|
| B1 | **v2 interview** (one question at a time) | **PRD v2**: problem, who it is for, features, what stays out |
| B2 | **TRD v2** | Decisions on real login, RLS, online payment, off-site backup |
| B3 | **Flow, design, backend and plan for v2** | The same document set, built from the PRD v2 |
| B4 | **Measurement** | The PRD's minimum counters (payment-recording time, registration source) |

**v2 candidates already raised** (to decide in the interview): online payment; real login with database-level permissions (RLS); a phone app or installable web app; event calendar and service attendance; WhatsApp/SMS notifications; seminar programme; the Apprentice Project.

---

## How to use this plan
1. Do **one step at a time**, in order.
2. Move on only after the step's test passes.
3. Keep the PRD as the ruler: if a step does not serve a PRD feature, it does not go in.
