// Vercel serverless function: admins create and change user profiles (roles, GAs, teams, churches, active).
// Migration 055 takes INSERT / UPDATE on app_users (and the set_user_* helpers) away from the browser roles:
// before it, anyone signed in could PATCH their own sys_roles / ga_ids and, for example, read every GA's
// Trombetas e Festas guest list. The PIN is still issued by api/user-pin.js.
//
//   POST { action: "create", name, primaryRole, sysRoles, initials, church, gaIds, teamLeads, churches, showFinancials } → { user }
//   POST { action: "update", id, ...same }                                                                          → { user }
//   POST { action: "setActive", id, active }                                                                        → { ok: true }
//   POST { action: "delete", ids: [..] }                                                                            → { deleted: [ids] }

import { restClient, currentUser, hasRole } from "./_lib/auth.js";
import { cleanProfileInput } from "../src/lib/appUserRules.js";

const COLS = "id,name,sys_role,initials,church,ga_ids,team_leads,created_at,sys_roles,primary_role,churches,active,show_financials";
const rolesOf = (u) => (u?.sys_roles?.length ? u.sys_roles : [u?.sys_role].filter(Boolean));

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
  const fail = (code, error) => res.status(code).json({ error });

  try {
    const caller = await currentUser(req, rest, SESSION_SECRET);
    if (!caller) return fail(401, "not_signed_in");
    if (!hasRole(caller, "admin")) return fail(403, "admin_only");
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const audit = (action, user, details = {}) =>
      rest("audit_log", {
        method: "POST",
        body: { actor_name: caller.name, actor_id: caller.id, actor_role: caller.sys_role, action, entity_type: "app_user", entity_id: String(user.id), entity_label: user.name, details },
      });

    const loadTarget = async (rawId) => {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) return { error: [400, "invalid_id"] };
      const r = await rest(`app_users?id=eq.${id}&select=${COLS}`);
      const row = r.ok && r.data?.[0];
      return row ? { row } : { error: [404, "user_not_found"] };
    };
    // True when `target` is the only active admin: it may not be switched off or lose the admin role.
    const isLastAdmin = async (target) => {
      if (!rolesOf(target).includes("admin") || target.active === false) return false;
      const r = await rest("app_users?active=is.true&sys_roles=cs.{admin}&select=id");
      if (!r.ok) throw new Error(`admins_read_failed:${r.status}`);
      return (r.data || []).filter((u) => u.id !== target.id).length === 0;
    };

    if (body.action === "create" || body.action === "update") {
      const { error, fields } = cleanProfileInput(body);
      if (error) return fail(400, error);
      if (body.action === "create") {
        const r = await rest(`app_users?select=${COLS}`, { method: "POST", body: fields, prefer: "return=representation" });
        if (!r.ok || !r.data?.[0]) throw new Error(`user_create_failed:${r.status}`);
        await audit("app_user_created", r.data[0], { sysRole: fields.sys_role, church: fields.church });
        return res.status(200).json({ user: r.data[0] });
      }
      const t = await loadTarget(body.id);
      if (t.error) return fail(...t.error);
      if (!fields.sys_roles.includes("admin") && (await isLastAdmin(t.row))) return fail(409, "last_admin");
      const r = await rest(`app_users?id=eq.${t.row.id}&select=${COLS}`, { method: "PATCH", body: fields, prefer: "return=representation" });
      if (!r.ok || !r.data?.[0]) return fail(404, "user_not_found");
      await audit("app_user_updated", r.data[0], { sysRole: fields.sys_role, church: fields.church });
      return res.status(200).json({ user: r.data[0] });
    }

    if (body.action === "setActive") {
      const t = await loadTarget(body.id);
      if (t.error) return fail(...t.error);
      const active = !!body.active;
      if (!active && (await isLastAdmin(t.row))) return fail(409, "last_admin");
      const r = await rest(`app_users?id=eq.${t.row.id}&select=id`, { method: "PATCH", body: { active }, prefer: "return=representation" });
      if (!r.ok || !r.data?.length) return fail(404, "user_not_found");
      await audit(active ? "app_user_reactivated" : "app_user_deactivated", t.row);
      return res.status(200).json({ ok: true });
    }

    // Removes accounts for good (e.g. the old shared PINs, now that everyone has their own). The audit log keeps
    // each name. Never the caller's own account, and never so that no active admin is left.
    if (body.action === "delete") {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number))];
      if (!ids.length || ids.length > 200 || ids.some((id) => !Number.isInteger(id) || id <= 0)) return fail(400, "invalid_ids");
      if (ids.includes(Number(caller.id))) return fail(409, "cannot_delete_self");
      const list = `(${ids.join(",")})`;
      const found = await rest(`app_users?id=in.${list}&select=${COLS}`);
      if (!found.ok) throw new Error(`users_read_failed:${found.status}`);
      const rows = found.data || [];
      if (!rows.length) return fail(404, "user_not_found");
      if (rows.some((u) => rolesOf(u).includes("admin") && u.active !== false)) {
        const r = await rest("app_users?active=is.true&sys_roles=cs.{admin}&select=id");
        if (!r.ok) throw new Error(`admins_read_failed:${r.status}`);
        if (!(r.data || []).some((u) => !ids.includes(Number(u.id)))) return fail(409, "last_admin");
      }
      const del = await rest(`app_users?id=in.(${rows.map((u) => u.id).join(",")})&select=id`, { method: "DELETE", prefer: "return=representation" });
      if (!del.ok) throw new Error(`users_delete_failed:${del.status}`);
      const deleted = (del.data || []).map((u) => u.id);
      for (const u of rows.filter((x) => deleted.includes(x.id))) await audit("app_user_deleted", u, { sysRole: u.sys_role, church: u.church });
      return res.status(200).json({ deleted });
    }

    return fail(400, "unknown_action");
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
