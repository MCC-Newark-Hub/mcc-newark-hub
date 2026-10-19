# TRD — MCC Newark Hub (v1)

**Retroactive technical document** · 2026-10-19 · Based on the [PRD](PRD.md); it describes what is **already in production**, not a plan.
**Other languages:** [Português](pt/TRD.md)

Each choice has a one-sentence reason. Where today's choice is a weakness it is marked ⚠️ with the proposed way out.

---

## 1. Architecture overview

```
Browser (React) ──► Supabase (Postgres database, public "anon" key)
        │
        └──► Vercel (hosts the site + 3 functions) ──► Resend (email)
                         └──► Supabase (service key, server side only)
```

There is no server of our own: the browser talks straight to the database, and three small Vercel functions handle what cannot be done in the browser (email and backup).

---

## 2. Choices

### 2.1 Database

| Choice | Why |
|---|---|
| **Supabase (Postgres)**, project `mcc-newark-hub` | A full database with a ready-made API and a free plan; no server to build and run. |
| Realtime only on `registrations` and `approvals` | Only those two screens must update by themselves when another secretary works; everything else loads once and stays light. |
| Numbered migrations in `migrations/` (001 to 032) | The database design lives in the repository and can be rebuilt from scratch. ⚠️ Some tables once existed only in code; the rule today is: no new table without a migration. |
| **RLS off** on all 34 tables | It was the simplest way to start. ⚠️ Anyone with the public key can read and change everything (see §3). |

### 2.2 Login

| Choice | Why |
|---|---|
| **4-digit PIN** per person, in the `app_users` table | Secretaries do not use corporate email or strong passwords at the desk; a PIN is fast. |
| Multiple profiles per person (`sys_roles`) plus a primary profile | One person can be secretary and treasurer without two accounts. |
| Scope by church (`church`, `churches`) | A secretary sees only their own church; a pastor only the ones assigned to them. |
| Session in `localStorage` with an adjustable lifetime (default 2 h, in `app_settings`) | Shared devices sign out on their own. |
| **Deactivatable** account (`active`) instead of deletion | Keeps the audit history. |
| ⚠️ The PIN is checked **in the browser**, the table is readable with the public key, and test PINs in `src/dev/seeds.js` (public repository) still sign in | Known **high-severity** weakness. Way out: verify the PIN in a server function and drop `seeds.js`. |
| **Maintenance mode** (`MAINTENANCE_MODE`, currently on) | A switch in the code so only the administrator can sign in during changes. |

### 2.3 Payment

| Choice | Why |
|---|---|
| **In person**, recorded by hand by the secretary (`paid`, `exempt`, `fee`) | The church receives cash or transfers; it avoids fees and a card-processor signup. |
| **No online payment** | A PRD decision: no solution yet that suits the churches. |
| Dedicated treasury (`treasury_expenses`, `treasury_collections`) | Closes the event with expected × collected, expenses and other income, with no spreadsheet. |
| Expense receipts as a **Google Drive link** | Avoids paying for file storage. |

### 2.4 Hosting

| Choice | Why |
|---|---|
| **Vercel**, automatic deploy on every push to `main` | No server to look after; a pull request already gets a preview. |
| Site at `mcc-newark-hub.vercel.app`; the old address `mcc-newark-events.vercel.app` stays active | Does not break QR codes on printed badges and links already sent. |
| SPA rewrite (`vercel.json`) | Refreshing a deep link does not return a 404. |
| **One cron**: `daily-backup`, 09:00 UTC | Daily backup, since the free Supabase plan has no managed backup. |
| GitHub repository (`MCC-Newark-Hub/mcc-newark-hub`), **public** | ⚠️ It made starting easy, but exposes the code and the test PINs; see §3. |

### 2.5 Front end

| Choice | Why |
|---|---|
| **React 19 + Vite** | Quick to develop, with a light build and easy tests. |
| **React Router 6** for routes; tabs inside each screen use `useState` | Routes serve public links; inner tabs do not need an address. |
| Data loaded at once (`useAppData`) and passed as props | Simple for a small app; no global state library. |
| **Optimistic writes**: the screen changes at once and the database saves afterwards; a failure only shows a notice | A secretary at the desk cannot wait for the server. (Exception: the public portal waits for confirmation before showing success.) |
| **PT and EN** (`src/i18n/strings.js`), every text in both languages | Participants and staff use both languages. English is the source language; Portuguese is a translation. |
| **Vitest + Testing Library**, 231 tests | A safety net for changing code without breaking it. |

### 2.6 Integrations

| Integration | Used for | Why |
|---|---|---|
| **Resend** (`api/send-confirmation.js`) | Resending the receipt by email | Cheap, simple API. The function looks the registration up on the server and only emails an address already on file, so it cannot become an open relay. Today it is **manual** (a "resend" button). |
| **Supabase Storage** (private `db-backups` bucket) | Keeping the daily backup (30 days) | Lives in the same project at no extra cost. ⚠️ Does not protect against the whole project being deleted. |
| `qrcode` | QR codes for badges and self-service | Small library, runs in the browser. |
| `html2canvas` + `jspdf` | Exporting image and PDF (praise list, org chart, overview) | Runs in the browser, no server. Loaded only when used. |
| `read-excel-file` | Importing spreadsheets (members and 24h prayer) | Reads `.xlsx` in the browser. |
| `lucide-react` and Google Fonts (Lora, Montserrat) | Icons and typography | Free. |
| **mkdocs** docs (PT/EN/ES), opened in a modal inside the app | In-app help | Publishes to GitHub Pages at no cost. |
| `api/auto-cancel-overdue.js` | Moving people to the waiting list after the deadline | ⚠️ It exists but is **not scheduled**; the secretary does it by hand. |

---

## 3. Technical risks (and the way out of each)

| # | Risk | Severity | Way out |
|---|---|---|---|
| 1 | The public key reads and changes every table (RLS off) | High | Turn RLS on with per-profile policies, which requires real login (Supabase Auth or a server function) |
| 2 | PINs are readable and checked in the browser | High | Server-side verification; store only a hash of the PIN |
| 3 | Test PINs in the public repository | High | Turn off the fallback access outside development |
| 4 | The Supabase service key appeared in a local configuration file | High | Remove it from the file and **rotate the key** in Supabase |
| 5 | Backup lives in the same project | Medium | Weekly off-site copy (e.g. Google Drive) |
| 6 | Automatic waiting list has no schedule | Low | Schedule it after testing with `?dryRun=true` |
| 7 | Email is sent manually only | Low | Triggers on registration and on payment |

---

## 4. Environment variables

| Where | Variables |
|---|---|
| Browser | `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (public key) |
| Server (Vercel) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` |

The two Supabase pairs point to the same project and must stay equal.

---

## 5. Internationalization rule

English is the source language for code, comments, documentation and file names. Every user-facing string lives in `src/i18n/strings.js` with PT and EN entries (read with `useT()` / `useLang()`); no text is hard-coded in components. Dates, numbers and currency use locale formatting. Adding a language means adding one set of entries, with no component changes.

---

## 6. Open decisions for v2

- How to do real login (Supabase Auth with email, or a PIN verified on the server)?
- Which path to **online payment** (payment link, manual Zelle with reconciliation, a processor)?
- Should the repository become **private**?
- Off-Supabase backup: where and how often?
