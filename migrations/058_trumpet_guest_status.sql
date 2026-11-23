-- Trombetas e Festas: a status per guest instead of only "came / didn't come".
--   invited   — Convidado (the start, pending)
--   confirmed — Confirmado (said they will come)
--   in_person — Presencial (came to the church)
--   zoom      — Online pelo Zoom
--   youtube   — Online pelo YouTube
-- in_person, zoom and youtube count as attended: attended_at keeps the moment the guest first joined, and every count
-- (tab, drill-down, panel, goal) still reads attended_at. Guests already marked as present become in_person.

ALTER TABLE trumpet_guests
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'invited'
  CHECK (status IN ('invited', 'confirmed', 'in_person', 'zoom', 'youtube'));

UPDATE trumpet_guests SET status = 'in_person' WHERE attended_at IS NOT NULL AND status = 'invited';

NOTIFY pgrst, 'reload schema';
