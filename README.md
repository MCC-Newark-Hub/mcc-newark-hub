# mcc-newark-hub

Event registration system for **Igreja Cristã Maranata — Newark, NJ**.

Built to replace manual spreadsheet-based registration with a self-service portal for members and an internal management dashboard for staff.

---

## What it does

- Public registration portal (4-step flow with PDF badge auto-download)
- PIN-based internal access for five roles: Admin, Atendente, Pastor, GA Leader, Team Leader
- Payment tracking with family-level exemptions and deadline management
- Waitlist management and bulk registration mode
- Confirmation emails sent to both the registrations inbox and the participant
- Thermal label badge printing (3"×2" landscape, B&W)
- CSV import for members, churches, families, assistance groups, and categories

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React (Vite, JavaScript) |
| Backend/DB | Supabase (PostgreSQL + REST API) |
| Auth | PIN-based (no OAuth) |
| Email | Resend |
| Hosting | Vercel |
| Icons | lucide-react |
| PDF/Badges | jspdf + html2canvas |

---

## Project structure

```
mcc-newark-hub/
├── src/
│   ├── assets/
│   │   └── images/
│   │       ├── logo/          # ICM logo
│   │       └── custom-icons/  # Future custom SVGs
│   ├── components/            # Reusable UI components
│   ├── constants/             # App-wide constants and seed data
│   ├── i18n/                  # PT/EN strings and language context
│   ├── lib/
│   │   └── supabase.js        # Supabase REST client
│   └── views/                 # Page-level views (PublicPortal, AdminDashboard, etc.)
├── docs/                      # User-facing documentation (MkDocs)
├── .env                       # Local env vars — never commit this
├── .env.example               # Template for env setup
└── mkdocs.yml                 # MkDocs config for the docs site
```

---

## Getting started (local dev)

**Prerequisites:** Node.js v18+, Git

```bash
# Clone the repo
git clone https://github.com/MCC-Newark-Hub/mcc-newark-hub.git
cd mcc-newark-hub

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your Supabase URL and anon key

# Run locally
npm run dev
```

App runs at `http://localhost:5173`.

---

## Environment variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_KEY` | Supabase legacy anon key (eyJ... format) |

> ⚠️ Use the legacy `eyJ...` JWT format for the anon key, not the newer `sb_publishable...` format. The custom Supabase client expects the JWT.

---

## Database

Supabase project: `mcc-newark-hub`
Schema version: v2 — 11 tables

| Table | Purpose |
|---|---|
| `categories` | Age/registration categories |
| `functions` | SGI functions |
| `churches` | Church list including "Outra / Not Listed" and "Sem Igreja" |
| `families` | Family units with payment exemption flags |
| `assistance_groups` | Assistance group assignments |
| `members` | Member records |
| `events` | Events |
| `app_users` | PIN-based internal users |
| `registrations` | Event registrations |
| `approvals` | Approval workflow records |
| `rosters` | Roster assignments |

---

## Deployment

The app deploys automatically to Vercel on every push to `main`.

Live URL: `https://mcc-newark-hub.vercel.app` (`https://mcc-newark-events.vercel.app` also stays live for existing badge QR codes and shared links)

For first-time Vercel setup, see [docs/dev/deployment.md](docs/dev/deployment.md).

---

## Documentation

User docs are published via MkDocs Material at [link TBD].

To run the docs site locally:

```bash
pip install mkdocs-material
mkdocs serve
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Architecture decisions

See [docs/architecture/](docs/architecture/) for ADRs covering authentication, permissions, and database design choices.

---

## License

Private — internal use only for Igreja Cristã Maranata, Newark, NJ.
