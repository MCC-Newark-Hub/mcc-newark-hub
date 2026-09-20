-- 24h prayer board: "Período de Orações Ininterruptas".
-- Several periods happen during the year, numbered like events: oracao24h-001, oracao24h-002, ...
-- A period usually comes from a circular (optional number like 150/26), has a title, start/end
-- dates and a list of prayer intentions. Its board is a single 24h grid of 96 fifteen-minute
-- slots (index 0-95) that repeats for the whole period.
-- Admins create a period (inactive) and then activate it; only the active period shows on the portal.

CREATE TABLE IF NOT EXISTS prayer_periods (
  id          text        PRIMARY KEY,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  circular    text        CHECK (circular IS NULL OR char_length(circular) <= 30),
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  reasons     text[]      NOT NULL DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- One person per slot: the unique constraint is what stops two people taking the same slot.
CREATE TABLE IF NOT EXISTS schedule_oracao (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id    text        NOT NULL REFERENCES prayer_periods(id) ON DELETE CASCADE,
  slot_index   int         NOT NULL CHECK (slot_index BETWEEN 0 AND 95),
  slot_time    text        NOT NULL,
  member_id    text        REFERENCES members(id) ON DELETE SET NULL,
  member_name  text        NOT NULL CHECK (char_length(member_name) BETWEEN 1 AND 80),
  church       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, slot_index)
);

ALTER TABLE prayer_periods DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON prayer_periods TO anon, authenticated, service_role;

ALTER TABLE schedule_oracao DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON schedule_oracao TO anon, authenticated, service_role;

-- First period. Created inactive: add the circular number and the list of prayer
-- intentions (Escalas > Oração 24h > Editar), then click "Ativar no portal".
INSERT INTO prayer_periods (id, title, start_date, end_date)
VALUES ('oracao24h-001', 'ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA', '2026-09-21', '2026-09-27')
ON CONFLICT (id) DO NOTHING;
