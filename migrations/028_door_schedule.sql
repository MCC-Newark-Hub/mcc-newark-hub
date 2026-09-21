-- Escala de Portaria: obreiros da portaria, disponibilidade por dia de culto e a escala mensal gerada.
-- door_workers      one row per worker on door duty; `days` holds the service days they can cover
--                   (mon, tue, wed, thu, sat, ebd, sun).
-- door_months       one row per generated month ('YYYY-MM'): people per service and published_at
--                   (NULL = draft, only the admin sees it; set = public page /portaria/YYYY-MM is open).
-- door_assignments  who is on the door on each service of the month.

CREATE TABLE IF NOT EXISTS door_workers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   text        REFERENCES members(id) ON DELETE SET NULL,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  days        text[]      NOT NULL DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS door_months (
  month         text        PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  per_service   int         NOT NULL DEFAULT 1 CHECK (per_service BETWEEN 1 AND 6),
  generated_at  timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);

CREATE TABLE IF NOT EXISTS door_assignments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  month         text        NOT NULL REFERENCES door_months(month) ON DELETE CASCADE,
  service_date  date        NOT NULL,
  slot          text        NOT NULL CHECK (slot IN ('mon','tue','wed','thu','sat','ebd','sun')),
  worker_id     uuid        REFERENCES door_workers(id) ON DELETE SET NULL,
  worker_name   text        NOT NULL CHECK (char_length(worker_name) BETWEEN 1 AND 80),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS door_assignments_month_idx ON door_assignments (month, service_date);
-- The same person can't be twice on the same service.
CREATE UNIQUE INDEX IF NOT EXISTS door_assignments_person_uniq
  ON door_assignments (month, service_date, slot, lower(worker_name));

ALTER TABLE door_workers DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON door_workers TO anon, authenticated, service_role;
ALTER TABLE door_months DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON door_months TO anon, authenticated, service_role;
ALTER TABLE door_assignments DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON door_assignments TO anon, authenticated, service_role;
