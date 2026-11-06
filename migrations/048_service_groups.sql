-- Culto Profético › Grupos: which group is responsible for each prophetic service, per church.
-- service_groups          one row per group of a church (name + leader picked from the directory; the name is
--                         copied so the public page never reads members).
-- service_group_workers   the group's workers (member_id + copied name), in order.
-- service_group_schedule  fixed weekly table: one group per church and slot
--                         (mon, tue, wed, thu, fri, sat, ebd = Sunday morning, noite = Sunday night).
CREATE TABLE IF NOT EXISTS service_groups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church            text        NOT NULL CHECK (char_length(church) BETWEEN 1 AND 120),
  name              text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  leader_member_id  text        REFERENCES members(id) ON DELETE SET NULL,
  leader_name       text        CHECK (leader_name IS NULL OR char_length(leader_name) <= 120),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_groups_name_uniq ON service_groups (church, lower(name));

CREATE TABLE IF NOT EXISTS service_group_workers (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid    NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  member_id  text    REFERENCES members(id) ON DELETE SET NULL,
  name       text    NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  position   integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS service_group_workers_uniq ON service_group_workers (group_id, lower(name));

CREATE TABLE IF NOT EXISTS service_group_schedule (
  church    text NOT NULL,
  slot      text NOT NULL CHECK (slot IN ('mon','tue','wed','thu','fri','sat','ebd','noite')),
  group_id  uuid NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (church, slot)
);

ALTER TABLE service_groups          DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_group_workers   DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_group_schedule  DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON service_groups, service_group_workers, service_group_schedule
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
