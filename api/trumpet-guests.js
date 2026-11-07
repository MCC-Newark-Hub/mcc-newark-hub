// Vercel serverless function: Trombetas e Festas guests and goals (migration 054, server-only tables).
// Scope: admin / pastor all GAs; clerk the GAs of their church(es); GA leader their own GAs
// (gaIdsInScope in src/lib/trumpets.js). The audit log never gets phone, e-mail or the guest's name.
//
//   POST { action: "list",    year }                         → { guests }
//   POST { action: "create",  year, gaId, name, phone?, email?, invitedByMemberId?, notes? } → { guest }
//   POST { action: "update",  id, gaId, name, ... }          → { guest }
//   POST { action: "attend",  id, attended }                 → { guest }
//   POST { action: "delete",  id }                           → { ok: true }
//   POST { action: "goals",   year }                         → { goals: [{ church, goal }] }
//   POST { action: "setGoal", year, church, goal }           → { ok: true }   admin / pastor; goal 0 removes it
//   POST { action: "stats",   year }                         → { stats }      admin / pastor

import { restClient, currentUser } from "./_lib/auth.js";
import { gaIdsInScope, canManagePanel, toGuest, cleanGuestInput, buildStats } from "../src/lib/trumpets.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id,year,church,ga_id,name,phone,email,invited_by_member_id,attended_at,notes,created_at,updated_at";
const PAGE = 1000;
const yearOf = (v) => {
  const y = Number(v);
  return Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : null;
};
const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// PostgREST caps a response at 1000 rows: read page by page.
async function fetchAll(rest, path) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const r = await rest(`${path}&limit=${PAGE}&offset=${offset}`);
    if (!r.ok) throw new Error(`read_failed:${r.status}`);
    out.push(...(r.data || []));
    if ((r.data || []).length < PAGE) return out;
  }
}

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
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const me = await rest(`app_users?id=eq.${Number(caller.id)}&select=church,churches,ga_ids`);
    const extra = (me.ok && me.data?.[0]) || {};
    const roles = caller.sys_roles?.length ? caller.sys_roles : [caller.sys_role].filter(Boolean);
    const profile = { roles, church: extra.church || "", churches: extra.churches || [], gaIds: extra.ga_ids || [] };
    const g = await rest("assistance_groups?select=id,name,church");
    if (!g.ok) throw new Error(`gas_read_failed:${g.status}`);
    const gas = g.data || [];
    const gaById = Object.fromEntries(gas.map((x) => [x.id, x]));
    const allowed = new Set(gaIdsInScope(profile, gas));
    const by = caller.name || String(caller.id);

    const audit = (action, guestId, gaId, details = {}) =>
      rest("audit_log", {
        method: "POST",
        body: {
          actor_name: caller.name, actor_id: caller.id, actor_role: caller.sys_role, action,
          entity_type: "trumpet_guest", entity_id: guestId, entity_label: gaById[gaId]?.name || gaId,
          details,
        },
      });

    const loadOwned = async (id) => {
      if (!UUID.test(String(id || ""))) return { error: [400, "invalid_id"] };
      const r = await rest(`trumpet_guests?id=eq.${id}&select=${COLS}`);
      const row = r.ok && r.data?.[0];
      if (!row) return { error: [404, "not_found"] };
      if (!allowed.has(row.ga_id)) return { error: [403, "forbidden"] };
      return { row };
    };

    if (body.action === "list") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      if (!allowed.size) return res.status(200).json({ guests: [] });
      const rows = await fetchAll(rest, `trumpet_guests?year=eq.${year}&ga_id=in.(${[...allowed].join(",")})&select=${COLS}&order=name`);
      return res.status(200).json({ guests: rows.map(toGuest) });
    }

    if (body.action === "create") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const { error, fields } = cleanGuestInput(body);
      if (error) return fail(400, error);
      if (!allowed.has(fields.ga_id)) return fail(403, "forbidden");
      const r = await rest(`trumpet_guests?select=${COLS}`, {
        method: "POST",
        body: { ...fields, year, church: gaById[fields.ga_id].church || "", created_by: by, updated_by: by },
        prefer: "return=representation",
      });
      if (!r.ok || !r.data?.[0]) throw new Error(`guest_create_failed:${r.status}`);
      await audit("trumpet_guest_created", r.data[0].id, fields.ga_id, { year });
      return res.status(200).json({ guest: toGuest(r.data[0]) });
    }

    if (body.action === "update") {
      const own = await loadOwned(body.id);
      if (own.error) return fail(...own.error);
      const { error, fields } = cleanGuestInput(body);
      if (error) return fail(400, error);
      if (!allowed.has(fields.ga_id)) return fail(403, "forbidden");
      const r = await rest(`trumpet_guests?id=eq.${own.row.id}&select=${COLS}`, {
        method: "PATCH",
        body: { ...fields, church: gaById[fields.ga_id].church || "", updated_at: new Date().toISOString(), updated_by: by },
        prefer: "return=representation",
      });
      if (!r.ok || !r.data?.[0]) return fail(404, "not_found");
      const changed = ["ga_id", "name", "phone", "email", "invited_by_member_id", "notes"].filter((k) => (own.row[k] || null) !== (fields[k] || null));
      await audit("trumpet_guest_updated", own.row.id, fields.ga_id, { fields: changed });
      return res.status(200).json({ guest: toGuest(r.data[0]) });
    }

    if (body.action === "attend") {
      const own = await loadOwned(body.id);
      if (own.error) return fail(...own.error);
      const now = new Date().toISOString();
      const r = await rest(`trumpet_guests?id=eq.${own.row.id}&select=${COLS}`, {
        method: "PATCH",
        body: { attended_at: body.attended ? now : null, updated_at: now, updated_by: by },
        prefer: "return=representation",
      });
      if (!r.ok || !r.data?.[0]) return fail(404, "not_found");
      await audit(body.attended ? "trumpet_guest_attended" : "trumpet_guest_unattended", own.row.id, own.row.ga_id);
      return res.status(200).json({ guest: toGuest(r.data[0]) });
    }

    if (body.action === "delete") {
      const own = await loadOwned(body.id);
      if (own.error) return fail(...own.error);
      const r = await rest(`trumpet_guests?id=eq.${own.row.id}&select=id`, { method: "DELETE", prefer: "return=representation" });
      if (!r.ok || !r.data?.length) return fail(404, "not_found");
      await audit("trumpet_guest_deleted", own.row.id, own.row.ga_id, { year: own.row.year });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "goals") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      if (!allowed.size) return res.status(200).json({ goals: [] });
      const r = await rest(`trumpet_goals?year=eq.${year}&select=church,goal&order=church`);
      if (!r.ok) throw new Error(`goals_read_failed:${r.status}`);
      return res.status(200).json({ goals: r.data || [] });
    }

    if (body.action === "setGoal") {
      if (!canManagePanel(roles)) return fail(403, "forbidden");
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const church = String(body.church || "").slice(0, 120);
      const goal = Number(body.goal);
      if (!Number.isInteger(goal) || goal < 0 || goal > 100000) return fail(400, "invalid_goal");
      if (goal === 0) {
        const d = await rest(`trumpet_goals?year=eq.${year}&church=eq.${encodeURIComponent(church)}`, { method: "DELETE" });
        if (!d.ok) throw new Error(`goal_delete_failed:${d.status}`);
      } else {
        const w = await rest("trumpet_goals?on_conflict=year,church&select=year,church,goal", {
          method: "POST",
          body: { year, church, goal, updated_at: new Date().toISOString(), updated_by: by },
          prefer: "resolution=merge-duplicates,return=representation",
        });
        if (!w.ok || !w.data?.[0]) throw new Error(`goal_save_failed:${w.status}`);
      }
      await rest("audit_log", {
        method: "POST",
        body: { actor_name: caller.name, actor_id: caller.id, actor_role: caller.sys_role, action: "trumpet_goal_set", entity_type: "trumpet_goal", entity_id: String(year), entity_label: church || "*", details: { goal } },
      });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "stats") {
      if (!canManagePanel(roles)) return fail(403, "forbidden");
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const rows = await fetchAll(rest, `trumpet_guests?year=in.(${year},${year - 1})&select=year,church,ga_id,invited_by_member_id,attended_at,created_at&order=created_at`);
      const inviterIds = [...new Set(rows.filter((r) => r.year === year).map((r) => r.invited_by_member_id).filter(Boolean))];
      const members = inviterIds.length ? await fetchAll(rest, `members?id=in.(${inviterIds.join(",")})&select=id,name&order=id`) : [];
      const gr = await rest(`trumpet_goals?year=eq.${year}&select=church,goal`);
      if (!gr.ok) throw new Error(`goals_read_failed:${gr.status}`);
      const stats = buildStats(rows, { year, gas, members, goals: gr.data || [], today: todayNY() });
      return res.status(200).json({ stats });
    }

    return fail(400, "unknown_action");
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
