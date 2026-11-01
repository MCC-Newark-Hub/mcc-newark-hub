// Vercel serverless function: who is the saved session? Verifies the token's
// signature and expiry and returns the user's current profile, so a page reload
// picks up role changes and deactivations, and a hand-made token gets nowhere.

import { restClient, verifyToken, bearerToken } from "./_lib/auth.js";
import { APP_USER_COLUMNS } from "../src/lib/appUsers.js";

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
    res.status(500).json({ error: "server_not_configured" });
    return;
  }

  const claims = verifyToken(bearerToken(req), SESSION_SECRET);
  if (!claims?.sub) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }

  try {
    const rest = restClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const r = await rest(`app_users?id=eq.${Number(claims.sub)}&active=is.true&select=${APP_USER_COLUMNS}`);
    if (!r.ok) throw new Error(`user_read_failed:${r.status}`);
    if (!r.data[0]) {
      res.status(401).json({ error: "not_signed_in" });
      return;
    }
    res.status(200).json({ user: r.data[0] });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
