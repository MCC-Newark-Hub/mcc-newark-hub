-- Sign-in moves to the server (api/login.js). PINs are stored as a keyed hash
-- (HMAC-SHA256 with PIN_PEPPER, which lives only in the server environment), never
-- as plain text. Additive only: the current app keeps working until the new one is
-- deployed, and 037 removes the old column afterwards.

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pin_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_pin_hash_key ON app_users (pin_hash);

-- New users are created without a PIN; the admin generates one afterwards.
ALTER TABLE app_users ALTER COLUMN pin DROP NOT NULL;

-- Failed sign-ins per IP, used to slow down guessing. Only the server functions
-- (service role) touch this table, so unlike the app tables RLS stays ON with no
-- policies and the browser roles get no privileges at all.
CREATE TABLE IF NOT EXISTS login_attempts (
  id bigserial PRIMARY KEY,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_time ON login_attempts (ip, created_at);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_attempts FROM anon, authenticated;
GRANT ALL ON login_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE login_attempts_id_seq TO service_role;

NOTIFY pgrst, 'reload schema';
