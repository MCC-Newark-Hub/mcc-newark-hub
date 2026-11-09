// Vercel serverless function: who is the saved session? Verifies the token's
// signature and expiry and returns the user's current profile, so a page reload
// picks up role changes and deactivations, and a hand-made token gets nowhere.
//
//   GET                          → { user }
//   POST { primaryRole }         → { user }  the role this user opens with at sign-in
//                                  ("Ao entrar, abrir como"); must be one of their own roles.

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
    const r = await rest(`app_users?id=eq.${Number(claims.sub)}&active=is.true&select=${APP_USER_COLUMNS},must_change_pin`);
    if (!r.ok) throw new Error(`user_read_failed:${r.status}`);
    const me = r.data[0];
    if (!me) {
      res.status(401).json({ error: "not_signed_in" });
      return;
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const role = String(body.primaryRole || "");
      const roles = me.sys_roles?.length ? me.sys_roles : [me.sys_role];
      if (!roles.includes(role)) {
        res.status(400).json({ error: "role_not_allowed" });
        return;
      }
      const u = await rest(`app_users?id=eq.${Number(me.id)}&select=${APP_USER_COLUMNS}`, {
        method: "PATCH",
        body: { primary_role: role },
        prefer: "return=representation",
      });
      if (!u.ok || !Array.isArray(u.data) || u.data.length !== 1) throw new Error(`user_update_failed:${u.status}`);
      res.status(200).json({ user: { ...u.data[0], must_change_pin: me.must_change_pin } });
      return;
    }
    if (req.method !== "GET") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    res.status(200).json({ user: me });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
