-- Prayer lists: several people per slot, configurable per list.
-- Until now every slot took exactly one person (UNIQUE (period_id, slot_index)). What matters is that
-- someone is praying in every slot, but not everyone can pray at any time, so each list (period) now
-- has a capacity: how many people one 15-minute slot accepts (default 1 = the old behaviour).

ALTER TABLE prayer_periods
  ADD COLUMN IF NOT EXISTS slot_capacity int NOT NULL DEFAULT 1 CHECK (slot_capacity BETWEEN 1 AND 20);

-- The one-per-slot rule goes away...
ALTER TABLE schedule_oracao DROP CONSTRAINT IF EXISTS schedule_oracao_period_id_slot_index_key;
CREATE INDEX IF NOT EXISTS schedule_oracao_slot_idx ON schedule_oracao (period_id, slot_index);

-- ...but the same person still can't be twice in the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS schedule_oracao_person_slot_uniq
  ON schedule_oracao (period_id, slot_index, lower(member_name), lower(coalesce(church, '')));

-- The capacity is enforced here, not in the browser, so two people taking the last place at the same
-- moment can't both get it. Locking the period row serializes inserts per list. A full slot raises
-- unique_violation (23505), the same error the app already treats as "slot taken".
CREATE OR REPLACE FUNCTION enforce_prayer_slot_capacity() RETURNS trigger AS $$
DECLARE
  cap int;
  taken int;
BEGIN
  SELECT slot_capacity INTO cap FROM prayer_periods WHERE id = NEW.period_id FOR UPDATE;
  SELECT count(*) INTO taken FROM schedule_oracao WHERE period_id = NEW.period_id AND slot_index = NEW.slot_index;
  IF taken >= COALESCE(cap, 1) THEN
    RAISE EXCEPTION 'prayer slot % of % is full (% of %)', NEW.slot_index, NEW.period_id, taken, COALESCE(cap, 1)
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schedule_oracao_capacity ON schedule_oracao;
CREATE TRIGGER schedule_oracao_capacity BEFORE INSERT ON schedule_oracao
  FOR EACH ROW EXECUTE FUNCTION enforce_prayer_slot_capacity();
