-- 052: the browser lost write access to `teams` (INSERT/UPDATE/DELETE were revoked outside
-- a migration), so Diretório › Voluntários › Equipes failed with "permission denied for
-- table teams" when saving a team or its leader. Restore what migration 017 granted.
-- RLS stays off on this table, as on the other catalog tables (instruments, voice_types).

GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO anon, authenticated;
GRANT ALL PRIVILEGES ON teams TO service_role;

-- Check: both must be true.
-- SELECT has_table_privilege('anon', 'public.teams', 'UPDATE'), has_table_privilege('anon', 'public.teams', 'INSERT');
