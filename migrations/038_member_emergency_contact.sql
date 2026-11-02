-- The member form (Diretório › Membros) saves emergency_contact and emergency_phone,
-- but the columns were never created, so every member save was rejected.
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_contact text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_phone text;

-- PostgREST picks up the new columns right away.
NOTIFY pgrst, 'reload schema';
