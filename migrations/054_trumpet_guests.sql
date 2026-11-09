-- Trombetas e Festas: the guests each GA invites every year, the goals and the year's motivos.
-- Only GA leaders see guest lists (their GAs); staff get numbers only (api/trumpet-guests.js).
-- Guests are non-members' personal data, so both tables are server-only (like member_contacts, 039):
-- the browser reaches them only through api/trumpet-guests.js, which checks the caller's scope.

CREATE TABLE IF NOT EXISTS trumpet_guests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year                 int  NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  church               text NOT NULL,
  ga_id                text NOT NULL REFERENCES assistance_groups(id) ON DELETE RESTRICT,
  name                 text NOT NULL CHECK (length(trim(name)) > 0),
  phone                text,
  email                text,
  invited_by_member_id text REFERENCES members(id) ON DELETE SET NULL,
  attended_at          timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           text
);
CREATE INDEX IF NOT EXISTS trumpet_guests_year_ga ON trumpet_guests (year, ga_id);

-- church = '' is the overall goal of the year.
CREATE TABLE IF NOT EXISTS trumpet_goals (
  year       int  NOT NULL,
  church     text NOT NULL DEFAULT '',
  goal       int  NOT NULL CHECK (goal > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (year, church)
);

-- The year's "motivos" (markdown, PT and EN), written by pastor / admin, shown at the top of the tab and the panel.
CREATE TABLE IF NOT EXISTS trumpet_editions (
  year       int  PRIMARY KEY,
  reasons    text NOT NULL DEFAULT '',
  reasons_en text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE trumpet_guests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trumpet_guests FROM anon, authenticated;
GRANT ALL PRIVILEGES ON trumpet_guests TO service_role;

ALTER TABLE trumpet_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trumpet_goals FROM anon, authenticated;
GRANT ALL PRIVILEGES ON trumpet_goals TO service_role;

ALTER TABLE trumpet_editions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trumpet_editions FROM anon, authenticated;
GRANT ALL PRIVILEGES ON trumpet_editions TO service_role;

NOTIFY pgrst, 'reload schema';
