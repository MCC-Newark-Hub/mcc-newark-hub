// Vercel serverless function: "Ver como". An admin starts or ends seeing the app as
// another user, without that user's PIN. The admin keeps their own session token (no
// token is issued for the other user); this checks the caller is an admin, writes the
// start and the end to the audit log, and returns the user's profile — only the
// browser-safe columns, never PIN data.
//
//   POST { action: "start", userId }  → { user }
//   POST { action: "stop", userId }   → { ok: true }
//   (Authorization: Bearer <session token>)

import { restClient, currentUser, hasRole } from "./_lib/auth.js";
import { APP_USER_COLUMNS } from "../src/lib/appUsers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
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

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = body.action;
    const userId = Number(body.userId);
    if (action !== "start" && action !== "stop") {
      res.status(400).json({ error: "invalid_action" });
      return;
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "missing_user_id" });
      return;
    }
    if (userId === Number(caller.id)) {
      res.status(400).json({ error: "same_user" });
      return;
    }

    const r = await rest(`app_users?id=eq.${userId}&select=${APP_USER_COLUMNS}`);
    if (!r.ok) throw new Error(`user_read_failed:${r.status}`);
    const target = r.data?.[0];
    // Starting needs an active user; ending is still logged if the user was deactivated meanwhile.
    if (!target || (action === "start" && target.active === false)) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const log = await rest("audit_log", {
      method: "POST",
      body: {
        actor_name: caller.name,
        actor_id: caller.id,
        actor_role: "admin",
        action: action === "start" ? "see_as_started" : "see_as_ended",
        entity_type: "app_user",
        entity_id: String(target.id),
        entity_label: target.name,
        details: { roles: target.sys_roles?.length ? target.sys_roles : [target.sys_role] },
      },
    });
    // Seeing as someone must leave a trace: no log, no start.
    if (!log.ok && action === "start") throw new Error(`audit_write_failed:${log.status}`);

    res.status(200).json(action === "start" ? { user: target } : { ok: true });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
