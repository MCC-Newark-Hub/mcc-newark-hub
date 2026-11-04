-- Frequência de Culto (church part): the headcount of each service, one row per church + date + service type.
-- Recorded through the public link /frequencia (the recorder picks their own name from the directory) and corrected by
-- staff in Assistência › Frequência. Totals are computed by the app, never stored.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS service_census (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church                text        NOT NULL CHECK (char_length(church) BETWEEN 1 AND 120),
  service_date          date        NOT NULL,
  service_type          text        NOT NULL CHECK (service_type IN ('ebd', 'noite', 'outro')),
  members_cia           int         NOT NULL DEFAULT 0 CHECK (members_cia    BETWEEN 0 AND 5000),
  members_adult         int         NOT NULL DEFAULT 0 CHECK (members_adult  BETWEEN 0 AND 5000),
  visitors_cia          int         NOT NULL DEFAULT 0 CHECK (visitors_cia   BETWEEN 0 AND 5000),
  visitors_adult        int         NOT NULL DEFAULT 0 CHECK (visitors_adult BETWEEN 0 AND 5000),
  notes                 text        CHECK (notes IS NULL OR char_length(notes) <= 2000),
  entered_by_member_id  text,
  entered_by_name       text        NOT NULL CHECK (char_length(entered_by_name) BETWEEN 1 AND 120),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_census_one_per_service UNIQUE (church, service_date, service_type),
  CONSTRAINT service_census_ebd_sunday CHECK (service_type <> 'ebd' OR extract(dow FROM service_date) = 0)
);
CREATE INDEX IF NOT EXISTS service_census_date_idx ON service_census (service_date DESC);

ALTER TABLE service_census DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON service_census TO anon, authenticated, service_role;

-- Name search for the public page: at most 10 members of the church, accent- and case-insensitive.
-- Fewer than 3 characters returns nothing, so the page can never list the directory.
CREATE OR REPLACE FUNCTION census_member_search(p_church text, p_query text)
RETURNS TABLE (id text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT m.id, m.name
  FROM members m
  WHERE char_length(trim(coalesce(p_query, ''))) >= 3
    AND m.church = p_church
    AND unaccent(lower(m.name)) LIKE '%' || unaccent(lower(trim(p_query))) || '%'
  ORDER BY m.name
  LIMIT 10;
$$;

-- Public save: only the service day (today in New York, or yesterday for a late service further west), only a member
-- of that church, and the recorder's name comes from the directory. Upserts the one row of the service.
CREATE OR REPLACE FUNCTION census_save(p_church text, p_date date, p_type text, p_member_id text, p_counts jsonb, p_notes text)
RETURNS service_census
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/New_York')::date;
  v_name  text;
  v_row   service_census;
  c       jsonb := coalesce(p_counts, '{}'::jsonb);
BEGIN
  IF p_date NOT IN (v_today, v_today - 1) THEN
    RAISE EXCEPTION 'census_date_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  SELECT m.name INTO v_name FROM members m WHERE m.id = p_member_id AND m.church = p_church;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'census_member_not_in_church' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO service_census AS s (church, service_date, service_type, members_cia, members_adult, visitors_cia,
                                   visitors_adult, notes, entered_by_member_id, entered_by_name)
  VALUES (p_church, p_date, p_type,
          coalesce((c->>'members_cia')::int, 0), coalesce((c->>'members_adult')::int, 0),
          coalesce((c->>'visitors_cia')::int, 0), coalesce((c->>'visitors_adult')::int, 0),
          nullif(trim(coalesce(p_notes, '')), ''), p_member_id, v_name)
  ON CONFLICT ON CONSTRAINT service_census_one_per_service DO UPDATE SET
    members_cia = EXCLUDED.members_cia, members_adult = EXCLUDED.members_adult,
    visitors_cia = EXCLUDED.visitors_cia, visitors_adult = EXCLUDED.visitors_adult,
    notes = EXCLUDED.notes, entered_by_member_id = EXCLUDED.entered_by_member_id,
    entered_by_name = EXCLUDED.entered_by_name, updated_at = now()
  RETURNING s.* INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION census_member_search(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION census_save(text, date, text, text, jsonb, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
