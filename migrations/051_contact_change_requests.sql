-- 051: People can ask to change a phone or e-mail already on file from the public form.
--
-- The public form is open to anyone and fill_member_contact (039) never overwrites, so
-- a stranger can't redirect someone else's registration e-mails. A change typed on the
-- public form is stored here as a request; staff approve it (the new value goes to
-- member_contacts) or reject it, through api/member-contacts.js.
--
-- Personal data, server-only like member_contacts: RLS on with no policies, no browser
-- privileges. The browser only calls request_contact_change, which returns nothing.

CREATE TABLE IF NOT EXISTS contact_change_requests (
  id          bigserial PRIMARY KEY,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_id    text,
  phone       text,
  email       text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  -- What was on file when staff resolved it (the audit log never holds the values).
  previous_phone text,
  previous_email text
);
-- One pending request per member: a new one replaces what was asked before.
CREATE UNIQUE INDEX IF NOT EXISTS contact_change_requests_one_pending
  ON contact_change_requests (member_id) WHERE status = 'pending';

ALTER TABLE contact_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contact_change_requests FROM anon, authenticated;
GRANT ALL PRIVILEGES ON contact_change_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE contact_change_requests_id_seq TO service_role;

-- Asks to change a phone and/or e-mail already on file. A field that is empty on file is
-- not a change (fill_member_contact fills it); a field equal to what is on file is ignored.
CREATE OR REPLACE FUNCTION request_contact_change(p_member_id text, p_phone text, p_email text, p_event_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  cur     member_contacts%ROWTYPE;
BEGIN
  IF v_phone IS NOT NULL AND (length(v_phone) > 40 OR length(regexp_replace(v_phone, '\D', '', 'g')) < 10) THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  SELECT * INTO cur FROM member_contacts WHERE member_id = p_member_id;
  IF coalesce(cur.phone, '') = '' OR v_phone = cur.phone THEN v_phone := NULL; END IF;
  IF coalesce(cur.email, '') = '' OR v_email = cur.email THEN v_email := NULL; END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO contact_change_requests (member_id, event_id, phone, email)
  VALUES (p_member_id, nullif(btrim(coalesce(p_event_id, '')), ''), v_phone, v_email)
  ON CONFLICT (member_id) WHERE status = 'pending' DO UPDATE SET
    phone      = coalesce(EXCLUDED.phone, contact_change_requests.phone),
    email      = coalesce(EXCLUDED.email, contact_change_requests.email),
    event_id   = coalesce(EXCLUDED.event_id, contact_change_requests.event_id),
    created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION request_contact_change(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_contact_change(text, text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
