-- Which churches a user may see (pastors with a limited scope, secretaries of one church).
-- The admin screen "Usuários & PINs" already had the church picker and called set_user_churches(), but neither
-- the column nor the function ever existed in the database, so the choice was never saved.
-- Values are city names, as the picker writes them ("Newark", "New York"…). Empty = no extra restriction:
-- a pastor with none sees every church, a secretary falls back to the church of their account.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS churches text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION set_user_churches(p_id bigint, p_val text[])
RETURNS void
LANGUAGE sql
AS $$ UPDATE app_users SET churches = COALESCE(p_val, '{}') WHERE id = p_id; $$;

GRANT EXECUTE ON FUNCTION set_user_churches(bigint, text[]) TO anon, authenticated, service_role;

-- Initial scopes (editable in Usuários & PINs). Pr Nairon keeps the empty list = sees everything.
UPDATE app_users SET churches = ARRAY['Newark', 'Philadelphia']
  WHERE name = 'Jairo Oliveira' AND sys_role = 'pastor' AND churches = '{}';
UPDATE app_users SET churches = ARRAY['New York']
  WHERE name = 'Dilton Rodrigues' AND sys_role = 'pastor' AND churches = '{}';

NOTIFY pgrst, 'reload schema';
