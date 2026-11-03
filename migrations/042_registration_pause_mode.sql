-- How a pause works: 'full' (nobody can register, not even to the waitlist) or
-- 'waitlist' (new registrations go to the waitlist and are moved to the main list,
-- while spots remain, when registrations resume). Default 'full', which is how a pause
-- already behaves.
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_pause_mode text NOT NULL DEFAULT 'full';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_registration_pause_mode_check;
ALTER TABLE events ADD CONSTRAINT events_registration_pause_mode_check
  CHECK (registration_pause_mode IN ('full', 'waitlist'));

-- The public dashboard also says whether the waitlist is open during a pause.
CREATE OR REPLACE FUNCTION event_public_stats(p_event_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT e.* FROM events e
    WHERE (p_event_id IS NOT NULL AND e.id = p_event_id)
       OR (p_event_id IS NULL AND e.id = coalesce(
             (SELECT u.id FROM events u WHERE u.status = 'active' AND u.date >= current_date ORDER BY u.date LIMIT 1),
             (SELECT l.id FROM events l ORDER BY l.date DESC NULLS LAST LIMIT 1)))
    LIMIT 1
  ),
  regs AS (
    SELECT r.category,
           coalesce(nullif(m.church, ''), nullif(r.church, ''), '') AS church,
           (NOT coalesce(r.cancelled, false) AND NOT coalesce(r.waitlisted, false)) AS active,
           (coalesce(r.waitlisted, false) AND NOT coalesce(r.cancelled, false))     AS waiting
    FROM registrations r
    JOIN ev ON ev.id = r.event_id
    LEFT JOIN members m ON m.id = r.member_id
  )
  SELECT jsonb_build_object(
    'event_id',              ev.id,
    'name',                  ev.name,
    'date',                  ev.date,
    'time',                  ev.time,
    'location',              ev.location,
    'capacity',              ev.capacity,
    'registration_deadline', ev.registration_deadline,
    'paused',                coalesce(ev.registration_paused, false),
    'pause_mode',            ev.registration_pause_mode,
    'locked',                coalesce(ev.registrations_locked, false),
    'active',                (SELECT count(*) FROM regs WHERE active),
    'waitlist',              (SELECT count(*) FROM regs WHERE waiting),
    'by_category',           coalesce((SELECT jsonb_object_agg(k, n) FROM (
                               SELECT coalesce(category, '') AS k, count(*) AS n FROM regs WHERE active GROUP BY 1) c), '{}'::jsonb),
    'waitlist_by_category',  coalesce((SELECT jsonb_object_agg(k, n) FROM (
                               SELECT coalesce(category, '') AS k, count(*) AS n FROM regs WHERE waiting GROUP BY 1) c), '{}'::jsonb),
    'by_church',             coalesce((SELECT jsonb_object_agg(k, n) FROM (
                               SELECT church AS k, count(*) AS n FROM regs WHERE active GROUP BY 1) c), '{}'::jsonb)
  )
  FROM ev;
$$;

REVOKE ALL ON FUNCTION event_public_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION event_public_stats(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
