-- Chamada do GA: which members of an assistance group were at each church service, marked by the GA leader in
-- Assistência › Chamada do GA. One row per GA + date + service type; the roster is frozen as it was that day, so later
-- moves between groups never rewrite history. Follow-up numbers are computed by the app, never stored.
CREATE TABLE IF NOT EXISTS ga_attendance (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ga_id               text        NOT NULL,
  church              text        NOT NULL CHECK (char_length(church) BETWEEN 1 AND 120),
  service_date        date        NOT NULL,
  service_type        text        NOT NULL CHECK (service_type IN ('ebd', 'noite', 'outro')),
  roster_ids          text[]      NOT NULL DEFAULT '{}',
  present_ids         text[]      NOT NULL DEFAULT '{}',
  visitors            text[]      NOT NULL DEFAULT '{}',
  notes               text        CHECK (notes IS NULL OR char_length(notes) <= 2000),
  entered_by_user_id  text,
  entered_by_name     text        NOT NULL CHECK (char_length(entered_by_name) BETWEEN 1 AND 120),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ga_attendance_one_per_service UNIQUE (ga_id, service_date, service_type),
  CONSTRAINT ga_attendance_ebd_sunday CHECK (service_type <> 'ebd' OR extract(dow FROM service_date) = 0),
  CONSTRAINT ga_attendance_present_in_roster CHECK (present_ids <@ roster_ids),
  CONSTRAINT ga_attendance_visitors_max CHECK (cardinality(visitors) <= 50)
);
CREATE INDEX IF NOT EXISTS ga_attendance_ga_date_idx ON ga_attendance (ga_id, service_date DESC);

ALTER TABLE ga_attendance DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON ga_attendance TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
