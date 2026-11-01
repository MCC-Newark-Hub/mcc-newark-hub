// Shared by the local admin scripts. Run them through npm (`npm run rotate-pins`,
// `npm run reset-pin`), which loads .env. PIN_PEPPER must be the same value as in
// the Vercel production environment, or the PINs written here will not sign in.
import { restClient } from "../api/_lib/auth.js";

export function serverEnv() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER } = process.env;
  const missing = Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}`);
    process.exit(1);
  }
  return { rest: restClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), pepper: PIN_PEPPER };
}

export function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
