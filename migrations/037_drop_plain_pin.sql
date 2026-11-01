-- Apply only AFTER the server sign-in (036 + api/login.js) is deployed and every
-- active user has a pin_hash. Removes the old plain-text column and limits what the
-- browser roles can touch on app_users to the profile columns.
--
-- Column privileges: anon/authenticated can no longer use `select("*")` on app_users
-- (PostgREST expands * to every column, including pin_hash). The app selects the
-- columns by name (APP_USER_COLUMNS in src/lib/appUsers.js). A new app_users column
-- must be added to that list AND granted below, or the browser cannot see it.

ALTER TABLE app_users DROP COLUMN IF EXISTS pin;

REVOKE SELECT, INSERT, UPDATE ON app_users FROM anon, authenticated;
GRANT SELECT (id, name, sys_role, initials, church, ga_ids, team_leads, created_at, sys_roles, primary_role, churches, active, show_financials)
  ON app_users TO anon, authenticated;
GRANT INSERT (name, sys_role, initials, church, ga_ids, team_leads, sys_roles, primary_role, churches, active, show_financials)
  ON app_users TO anon, authenticated;
GRANT UPDATE (name, sys_role, initials, church, ga_ids, team_leads, sys_roles, primary_role, churches, active, show_financials)
  ON app_users TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
