-- app_users profiles are written only by the server (api/app-users.js, admins only).
-- Since 037 the browser roles could INSERT / UPDATE the profile columns, so anyone signed in could PATCH their own
-- sys_roles / ga_ids / churches — e.g. make themselves GA leader of every GA and read every Trombetas e Festas guest
-- list (054). The browser keeps SELECT on the profile columns (APP_USER_COLUMNS). The two helpers the admin screen
-- used to call from the browser are closed too; api/app-users.js writes those columns directly.
--
-- Apply together with (or right after) the deploy that ships api/app-users.js: before it, the Usuários & PINs
-- screen still writes from the browser and would fail.

REVOKE INSERT, UPDATE ON app_users FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION set_user_churches(bigint, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_user_show_financials(bigint, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_user_churches(bigint, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION set_user_show_financials(bigint, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
