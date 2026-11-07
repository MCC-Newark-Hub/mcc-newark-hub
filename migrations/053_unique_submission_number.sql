-- 053: a submission number (NNN in PREFIX-MMDD-NNN-P) is unique per event, whatever the day.
--
-- Until now only the whole reg_number was unique (registrations_reg_number_key). The day
-- (MMDD) is part of it, so a device whose counters were stale could reuse a submission
-- number on a later day without any conflict: on 2026-11-06 a team leader's page that had
-- not seen the registrations of the evening before issued PA202612-1106-050-1 … -057-1,
-- while PA202612-1105-050-1 … -057-1 already existed.
--
-- This trigger refuses such an insert with the same error code as the unique index
-- (23505) and a message that names reg_number, so the browser's retry in addReg
-- (src/lib/regInsert.js) moves to the next free number.
--   person 1 (a new submission): the submission number must not exist in the event at all.
--   person 2+ (joining a submission): that person number must be free in the submission.
-- Old-format numbers (PREFIX-YYYYMMDD-NNNN) are not checked. Rows already in the table are
-- not touched, so the pairs reused before this migration stay as they are.
-- An advisory lock per event serialises concurrent inserts, so two devices can't both pass
-- the check with the same number.

CREATE OR REPLACE FUNCTION registrations_unique_submission() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parts text[];
  sub int;
  person int;
BEGIN
  -- An update that keeps the number (even one that sets it to itself) is not a new number.
  IF TG_OP = 'UPDATE' AND NEW.reg_number = OLD.reg_number AND NEW.event_id = OLD.event_id THEN
    RETURN NEW;
  END IF;
  parts := string_to_array(NEW.reg_number, '-');
  IF array_length(parts, 1) <> 4 OR parts[2] !~ '^\d{4}$' OR parts[3] !~ '^\d+$' OR parts[4] !~ '^\d+$' THEN
    RETURN NEW;
  END IF;
  sub := parts[3]::int;
  person := parts[4]::int;

  PERFORM pg_advisory_xact_lock(hashtext('registrations:' || NEW.event_id));

  IF EXISTS (
    SELECT 1 FROM registrations r
    WHERE r.event_id = NEW.event_id
      AND r.id IS DISTINCT FROM NEW.id
      AND r.reg_number ~ '^[^-]+-\d{4}-\d+-\d+$'
      AND split_part(r.reg_number, '-', 3)::int = sub
      AND (person = 1 OR split_part(r.reg_number, '-', 4)::int = person)
  ) THEN
    RAISE EXCEPTION 'duplicate key value violates unique constraint "registrations_submission_key": reg_number % reuses submission % of event %',
      NEW.reg_number, lpad(sub::text, 3, '0'), NEW.event_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrations_unique_submission ON registrations;
CREATE TRIGGER trg_registrations_unique_submission
  BEFORE INSERT OR UPDATE OF reg_number, event_id ON registrations
  FOR EACH ROW EXECUTE FUNCTION registrations_unique_submission();

-- Check (must fail with 23505 while PA202612-1105-050-1 exists; run inside a transaction and roll back):
-- BEGIN; INSERT INTO registrations (reg_number, event_id, member_id, member_name, category)
--   SELECT 'PA202612-1107-050-1', event_id, 'GUEST', 'test', 'Adulto' FROM registrations WHERE reg_number = 'PA202612-1105-050-1';
-- ROLLBACK;
