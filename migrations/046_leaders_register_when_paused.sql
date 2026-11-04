-- While registrations are paused, team leaders can still register the members of their teams
-- (Eventos › Equipe › "Inscrever membros da equipe") unless an admin turns this off for the event.
-- Closed registrations (registrations_locked) always block them.
ALTER TABLE events ADD COLUMN IF NOT EXISTS leaders_register_when_paused boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
