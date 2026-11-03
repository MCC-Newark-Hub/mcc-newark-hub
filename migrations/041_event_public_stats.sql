-- Numbers for the public registration dashboard (/painel), projected in church to show
-- how registrations are going. Aggregates only: no names, fees or payment status.
--
-- p_event_id NULL picks the event the way the app does (src/lib/eventId.js
-- pickCurrentEvent without a stored choice): the next upcoming active event, else the
-- latest one. "Active" registrations follow the app's capacity rule: not cancelled and
-- not on the waitlist. A person's church is their current directory church, else the
-- church saved on the registration.
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
    'locked',                coalesce(ev.registrations_locked, false),
    'active',                (SELECT count(*) FROM regs WHERE active),
    'waitlist',              (SELECT count(*) FROM regs WHERE waiting),
    'by_category',           coalesce((SELECT jsonb_object_agg(k, n) FROM (
                               SELECT coalesce(category, '') AS k, count(*) AS n FROM regs WHERE active GROUP BY 1) c), '{}'::jsonb),
    'waitlist_by_category',  coalesce((SELECT jsonb_object_agg(k, n) FROM (
                               SELECT coalesce(category, '') AS k, count(*) AS n FROM regs WHERE waiting GROUP BY 1) c), '{}'::jsonb),
    'by_church',            coalesce((SELECT jsonb_object_agg(k, n) FROM (
                               SELECT church AS k, count(*) AS n FROM regs WHERE active GROUP BY 1) c), '{}'::jsonb)
  )
  FROM ev;
$$;

REVOKE ALL ON FUNCTION event_public_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION event_public_stats(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
