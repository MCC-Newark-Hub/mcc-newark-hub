-- Phone and e-mail for each member, and a per-event switch that makes them mandatory
-- on registration.
--
-- Contacts are personal data, so they live in their own table that the browser
-- roles cannot read: the public pages only ask "does this person have a phone /
-- e-mail on file?" (contact_status) and can only fill a missing one
-- (fill_member_contact). Signed-in staff read and change them through
-- api/member-contacts.js (service role).

ALTER TABLE events ADD COLUMN IF NOT EXISTS require_contact boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS member_contacts (
  member_id  text PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  phone      text,
  email      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
-- Server-only, like login_attempts (036): RLS on with no policies, no browser privileges.
ALTER TABLE member_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON member_contacts FROM anon, authenticated;
GRANT ALL PRIVILEGES ON member_contacts TO service_role;

-- Which of these members have a phone / e-mail on file (no values returned).
CREATE OR REPLACE FUNCTION contact_status(p_member_ids text[])
RETURNS TABLE (member_id text, has_phone boolean, has_email boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.member_id,
         coalesce(c.phone, '') <> '',
         coalesce(c.email, '') <> ''
  FROM member_contacts c
  WHERE c.member_id = ANY (p_member_ids[1:300]);
$$;

-- Fills a member's phone and/or e-mail where they are still empty. Never overwrites:
-- changing a contact on file is done by staff.
CREATE OR REPLACE FUNCTION fill_member_contact(p_member_id text, p_phone text, p_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
BEGIN
  IF v_phone IS NOT NULL AND (length(v_phone) > 40 OR length(regexp_replace(v_phone, '\D', '', 'g')) < 10) THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO member_contacts (member_id, phone, email, updated_by)
  VALUES (p_member_id, v_phone, v_email, 'public')
  ON CONFLICT (member_id) DO UPDATE SET
    phone      = coalesce(nullif(member_contacts.phone, ''), EXCLUDED.phone),
    email      = coalesce(nullif(member_contacts.email, ''), EXCLUDED.email),
    updated_at = now(),
    updated_by = 'public';
END;
$$;

REVOKE ALL ON FUNCTION contact_status(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION fill_member_contact(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contact_status(text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fill_member_contact(text, text, text) TO anon, authenticated, service_role;

-- Seed from the contacts typed on past public registrations ("Tel: … | Email: …" in
-- the note, one per submission): they belong to the person who filled in the form,
-- i.e. the first registration of each submission, when that person is a Jovem or Adulto.
WITH batch AS (
  SELECT DISTINCT ON (substring(note FROM '\[(B\d+)\]'))
         member_id, category,
         nullif(btrim(substring(note FROM 'Tel:\s*([^|]+)')), '')            AS phone,
         nullif(lower(btrim(substring(note FROM 'Email:\s*([^\s|]+)'))), '') AS email
  FROM registrations
  WHERE note ~ '\[B\d+\]' AND (note ~* 'Tel:\s*\S' OR note ~* 'Email:\s*\S')
  ORDER BY substring(note FROM '\[(B\d+)\]'), created_at
)
INSERT INTO member_contacts (member_id, phone, email, updated_by)
SELECT DISTINCT ON (b.member_id) b.member_id, b.phone, b.email, 'registration note'
FROM batch b
JOIN members m ON m.id = b.member_id
WHERE b.category IN ('Jovem', 'Adulto')
ORDER BY b.member_id
ON CONFLICT (member_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
