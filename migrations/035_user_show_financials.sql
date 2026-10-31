-- Whether a user (in practice, a pastor profile) sees payment figures and the Tesouraria tab.
-- Same story as 031: the admin screen "Usuários & PINs" already had the toggle and called
-- set_user_show_financials(), and the new-user insert sent show_financials, but neither the
-- column nor the function ever existed. So the toggle was never saved, and creating a new
-- user failed outright (PostgREST rejects an insert with an unknown column).
-- Default true keeps today's behaviour: everyone sees financials until an admin turns it off.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS show_financials boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION set_user_show_financials(p_id bigint, p_val boolean)
RETURNS void
LANGUAGE sql
AS $$ UPDATE app_users SET show_financials = COALESCE(p_val, true) WHERE id = p_id; $$;

GRANT EXECUTE ON FUNCTION set_user_show_financials(bigint, boolean) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
