// Vercel serverless function: an admin generates a new PIN for a user (new account,
// forgotten PIN, reactivation). Only the hash is stored; the plain PIN is returned
// once, in this response, for the admin to pass on privately.

import { restClient, currentUser, hasRole, assignNewPin } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER, SESSION_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PIN_PEPPER || !SESSION_SECRET) {
    res.status(500).json({ error: "server_not_configured" });
    return;
  }
  const rest = restClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const caller = await currentUser(req, rest, SESSION_SECRET);
    if (!caller) {
      res.status(401).json({ error: "not_signed_in" });
      return;
    }
    if (!hasRole(caller, "admin")) {
      res.status(403).json({ error: "admin_only" });
      return;
    }

    const userId = Number(req.body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "missing_user_id" });
      return;
    }

    const pin = await assignNewPin(rest, userId, PIN_PEPPER);
    res.status(200).json({ pin });
  } catch (err) {
    const notFound = err?.message === "user_not_found";
    res.status(notFound ? 404 : 500).json({ error: notFound ? "user_not_found" : "unexpected_error" });
  }
}
