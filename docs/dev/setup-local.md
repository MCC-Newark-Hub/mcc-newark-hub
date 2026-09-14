# Local Development Setup

## Prerequisites

- Node.js 18+ (`node -v` to verify)
- npm 9+ (bundled with Node)
- A [Supabase](https://supabase.com/) account (free tier)
- Git access to this repository

---

## 1. Clone and install

```bash
git clone https://github.com/mcc-newark-hub/mcc-newark-hub.git
cd mcc-newark-hub
npm install
```

---

## 2. Create a Supabase project

1. Log in to [supabase.com](https://supabase.com/)
2. Click **New project** — name it `mcc-newark-hub-local` (or similar)
3. Wait for provisioning (~1 minute)
4. Go to **Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public** key → `VITE_SUPABASE_KEY`

---

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key-here
```

> `.env.local` is gitignored and never committed.

---

## 4. Create the base schema

The base schema (all 12 core tables) is not in the migrations folder — it was created interactively via the Supabase dashboard. You'll need to recreate it.

Go to **Supabase → SQL Editor** and create the tables listed below, then run the migrations.

### Core tables (create in this order)

```sql
-- events
CREATE TABLE IF NOT EXISTS events (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  date        text,
  time        text,
  location    text,
  prefix      text,
  capacity    integer DEFAULT 0,
  fees        jsonb DEFAULT '{}',
  payment_deadline_days integer,
  created_at  timestamptz DEFAULT now()
);

-- members
CREATE TABLE IF NOT EXISTS members (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  category    text,
  church      text,
  role        text,
  gender      text,
  family_id   text,
  ga_id       text,
  created_at  timestamptz DEFAULT now()
);

-- families
CREATE TABLE IF NOT EXISTS families (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  created_at  timestamptz DEFAULT now()
);

-- assistance_groups
CREATE TABLE IF NOT EXISTS assistance_groups (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  leader_id   text REFERENCES members(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

-- registrations
CREATE TABLE IF NOT EXISTS registrations (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id        text REFERENCES events(id) ON DELETE CASCADE,
  member_id       text,
  member_name     text,
  badge_name      text,
  category        text,
  church          text,
  role            text,
  family_id       text REFERENCES families(id) ON DELETE SET NULL,
  team            text DEFAULT 'Participante',
  fee             numeric DEFAULT 0,
  paid            boolean DEFAULT false,
  exempt          boolean DEFAULT false,
  cancelled       boolean DEFAULT false,
  waitlisted      boolean DEFAULT false,
  waitlist_reason text,
  excedente       boolean DEFAULT false,
  needs_translation boolean DEFAULT false,
  note            text,
  badge_printed   boolean DEFAULT false,
  timeline        jsonb DEFAULT '[]',
  reg_number      text,
  registered_at   timestamptz DEFAULT now(),
  registered_by   text,
  checked_in_at   timestamptz,
  checkin_method  text,
  presence        text DEFAULT 'unknown'
);

-- approvals
CREATE TABLE IF NOT EXISTS approvals (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id    text REFERENCES events(id) ON DELETE CASCADE,
  reg_id      text REFERENCES registrations(id) ON DELETE CASCADE,
  type        text,
  status      text DEFAULT 'pending',
  requested_by text,
  note        text,
  created_at  timestamptz DEFAULT now()
);

-- rosters
CREATE TABLE IF NOT EXISTS rosters (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id    text REFERENCES events(id) ON DELETE CASCADE,
  member_id   text REFERENCES members(id) ON DELETE CASCADE,
  team        text,
  created_at  timestamptz DEFAULT now()
);

-- churches
CREATE TABLE IF NOT EXISTS churches (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  display     text,
  created_at  timestamptz DEFAULT now()
);

-- app_users
CREATE TABLE IF NOT EXISTS app_users (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  pin         text,
  role        text,
  created_at  timestamptz DEFAULT now()
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  sort_order  integer,
  created_at  timestamptz DEFAULT now()
);

-- functions (ministry roles)
CREATE TABLE IF NOT EXISTS functions (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  created_at  timestamptz DEFAULT now()
);

-- teams
CREATE TABLE IF NOT EXISTS teams (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text,
  created_at  timestamptz DEFAULT now()
);
```

### Disable RLS on all tables

```sql
ALTER TABLE events               DISABLE ROW LEVEL SECURITY;
ALTER TABLE members              DISABLE ROW LEVEL SECURITY;
ALTER TABLE families             DISABLE ROW LEVEL SECURITY;
ALTER TABLE assistance_groups    DISABLE ROW LEVEL SECURITY;
ALTER TABLE registrations        DISABLE ROW LEVEL SECURITY;
ALTER TABLE approvals            DISABLE ROW LEVEL SECURITY;
ALTER TABLE rosters              DISABLE ROW LEVEL SECURITY;
ALTER TABLE churches             DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users            DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories           DISABLE ROW LEVEL SECURITY;
ALTER TABLE functions            DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams                DISABLE ROW LEVEL SECURITY;
```

---

## 5. Run migrations

In the Supabase SQL Editor, run each migration file from `migrations/` in order:

```
migrations/001_member_fields.sql
migrations/002_teams_table.sql
migrations/003_presence.sql
migrations/004_checkin_fields.sql
migrations/005_churches_schema.sql
migrations/006_teams_enrich.sql
migrations/007_churches_pastor.sql
migrations/008_member_roles.sql
migrations/009_id_defaults.sql
migrations/010_families_member_ids.sql
```

---

## 6. Seed test data

Create a test user in `app_users` so you can log in:

```sql
INSERT INTO app_users (name, pin, role) VALUES
  ('Admin Teste',   '0000', 'admin'),
  ('Atendente',     '1111', 'clerk'),
  ('Pastor',        '2222', 'pastor'),
  ('Líder GA',      '3333', 'ga_leader'),
  ('Líder Equipe',  '4444', 'team_leader');
```

Create a test event:

```sql
INSERT INTO events (name, date, time, location, prefix, capacity, fees, payment_deadline_days)
VALUES (
  'Evento Teste',
  '2026-12-31',
  '09:00',
  'Newark, NJ',
  'TST',
  100,
  '{"Adulto": 50, "Jovem": 40, "Adolescente": 30, "Criança": 0, "Bebê": 0}',
  7
);
```

---

## 7. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

- Click **Fazer minha inscrição** to test the public portal (no login needed)
- Click **Consultar inscrição** to test registration lookup
- Enter PIN `0000` for admin access

---

## Useful dev commands

```bash
npm run dev          # Dev server with HMR
npm run build        # Production build (catches TS/JSX errors)
npm run preview      # Preview the production build locally
npm test             # Run Vitest unit tests
npm run test:watch   # Watch mode
npm run lint         # ESLint
npm run format       # Prettier (auto-formats src/**/*.{js,jsx})
```
