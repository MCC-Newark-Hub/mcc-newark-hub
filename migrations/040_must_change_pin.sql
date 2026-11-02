-- After signing in with a PIN someone else handed them (a new account, a forgotten PIN,
-- or the PINs issued when sign-in moved to the server), the user picks their own
-- before using the hub. api/user-pin.js and the PIN scripts set the flag again on
-- every new PIN; api/change-pin.js clears it. Server-only: not in the browser grants
-- of migration 037.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false;

-- Everyone who has a PIN today was given it by someone else.
UPDATE app_users SET must_change_pin = true WHERE active AND pin_hash IS NOT NULL;

NOTIFY pgrst, 'reload schema';
