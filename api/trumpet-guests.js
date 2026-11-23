// Vercel serverless function: Trombetas e Festas guests and goals (migration 054, server-only tables).
// Only GA leaders see and edit guest lists, of their own GAs (listGaIds). Staff get numbers only: summary for
// admin / pastor (all), clerk (their churches, "*" = all) and GA leaders (summaryGaIds); stats for the panel.
// No guest name, phone or e-mail leaves through summary / stats, and the audit log never gets them.
//
//   POST { action: "list",    year }                         → { guests }
//   POST { action: "create",  year, gaId, name, phone?, email?, invitedByMemberId?, notes? } → { guest }
//   POST { action: "import",  year, guests: [{ gaId, name, phone, ... }] } → { guests, skipped }  all or nothing;
//        rows already on file (same name + phone, guestKey) or repeated in the batch are skipped, not errors
//   POST { action: "update",  id, gaId, name, ... }          → { guest }
//   POST { action: "status",  id, status }                   → { guest }   invited | confirmed | in_person | zoom | youtube
//        (migration 058); in_person / zoom / youtube set attended_at (kept when moving between them), others clear it
//   POST { action: "attend",  id, attended }                 → { guest }   older form: in_person or invited
//   POST { action: "delete",  id }                           → { ok: true }
//   POST { action: "goals",   year }                         → { goals: [{ church, goal }] }
//   POST { action: "setGoal", year, church, goal }           → { ok: true }   admin / pastor; goal 0 removes it
//   POST { action: "stats",   year }                         → { stats }      admin / pastor
//   POST { action: "summary", year }                         → { summary }    numbers church → GA → member
//   POST { action: "edition", year }                         → { edition: { reasons, reasonsEn } }
//   POST { action: "setEdition", year, reasons, reasonsEn }  → { ok: true }   admin / pastor
//   POST { action: "shareGet",    year, gaId }               → { link: { token, createdAt } | null }  GA leader of the GA
//   POST { action: "shareCreate", year, gaId }               → { link }   a new token; the old link stops working
//   POST { action: "shareRevoke", year, gaId }               → { ok: true }  the link stops working
//   POST { action: "shared", token }                         → { list: { year, ga, church, guests: [{ name, invitedBy,
//        attended }] } }  NO sign-in: the public page of the link (migration 057). Names only, no phones / e-mails / notes.

import { randomBytes } from "node:crypto";
import { restClient, currentUser } from "./_lib/auth.js";
import { listGaIds, summaryGaIds, canManagePanel, toGuest, cleanGuestInput, buildStats, buildSummary, guestKey, IMPORT_MAX, isShareToken, toSharedList, isGuestStatus, isAttendedStatus, statusOf } from "../src/lib/trumpets.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id,year,church,ga_id,name,phone,email,invited_by_member_id,attended_at,status,notes,created_at,updated_at";
const PAGE = 1000;
const yearOf = (v) => {
  const y = Number(v);
  return Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : null;
};
const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// PostgREST caps a response at 1000 rows: read page by page. Every paged query orders by a unique key (… ,id),
// or tied rows could repeat or go missing between pages.
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
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    res.setHeader?.("Cache-Control", "no-store");

    // The public page of a shared link: no sign-in, the token is the key.
    if (body.action === "shared") {
      if (!isShareToken(body.token)) return fail(404, "link_not_found");
      const l = await rest(`trumpet_share_links?token=eq.${body.token}&select=year,ga_id`);
      if (!l.ok) throw new Error(`share_read_failed:${l.status}`);
      const link = l.data?.[0];
      if (!link) return fail(404, "link_not_found");
      const ga = await rest(`assistance_groups?id=eq.${encodeURIComponent(link.ga_id)}&select=id,name,church`);
      if (!ga.ok) throw new Error(`gas_read_failed:${ga.status}`);
      const rows = await fetchAll(rest, `trumpet_guests?year=eq.${link.year}&ga_id=eq.${encodeURIComponent(link.ga_id)}&select=name,invited_by_member_id,attended_at,status&order=name,id`);
      const inviterIds = [...new Set(rows.map((r) => r.invited_by_member_id).filter(Boolean))];
      const members = inviterIds.length ? await fetchAll(rest, `members?id=in.(${inviterIds.join(",")})&select=id,name&order=id`) : [];
      return res.status(200).json({ list: toSharedList(rows, { members, ga: ga.data?.[0], year: link.year }) });
    }

    const caller = await currentUser(req, rest, SESSION_SECRET);
    if (!caller) return fail(401, "not_signed_in");

    const me = await rest(`app_users?id=eq.${Number(caller.id)}&select=church,churches,ga_ids`);
    const extra = (me.ok && me.data?.[0]) || {};
    const roles = caller.sys_roles?.length ? caller.sys_roles : [caller.sys_role].filter(Boolean);
    const profile = { roles, church: extra.church || "", churches: extra.churches || [], gaIds: extra.ga_ids || [] };
    const g = await rest("assistance_groups?select=id,name,church");
    if (!g.ok) throw new Error(`gas_read_failed:${g.status}`);
    const gas = g.data || [];
    const gaById = Object.fromEntries(gas.map((x) => [x.id, x]));
    const allowed = new Set(listGaIds(profile, gas)); // lists and edits
    const seen = new Set(summaryGaIds(profile, gas)); // numbers
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
      const rows = await fetchAll(rest, `trumpet_guests?year=eq.${year}&ga_id=in.(${[...allowed].join(",")})&select=${COLS}&order=name,id`);
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

    if (body.action === "import") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const list = Array.isArray(body.guests) ? body.guests : null;
      if (!list || !list.length || list.length > IMPORT_MAX) return fail(400, "invalid_import");
      const cleaned = [];
      for (let i = 0; i < list.length; i++) {
        const { error, fields } = cleanGuestInput(list[i] || {});
        if (error) return res.status(400).json({ error, row: i });
        if (!allowed.has(fields.ga_id)) return res.status(403).json({ error: "forbidden", row: i });
        cleaned.push(fields);
      }
      const gaIds = [...new Set(cleaned.map((f) => f.ga_id))];
      const onFile = await fetchAll(rest, `trumpet_guests?year=eq.${year}&ga_id=in.(${[...allowed].join(",")})&select=name,phone,id&order=id`);
      const seenKeys = new Set(onFile.map((r) => guestKey(r.name, r.phone)));
      const fresh = cleaned.filter((f) => {
        const k = guestKey(f.name, f.phone);
        if (seenKeys.has(k)) return false;
        seenKeys.add(k);
        return true;
      });
      const skipped = cleaned.length - fresh.length;
      if (!fresh.length) return res.status(200).json({ guests: [], skipped });
      // one insert: PostgREST runs it as a single statement, so either every row is saved or none is
      const r = await rest(`trumpet_guests?select=${COLS}`, {
        method: "POST",
        body: fresh.map((f) => ({ ...f, year, church: gaById[f.ga_id].church || "", created_by: by, updated_by: by })),
        prefer: "return=representation",
      });
      if (!r.ok || (r.data || []).length !== fresh.length) throw new Error(`guest_import_failed:${r.status}`);
      for (const gaId of gaIds) {
        const count = r.data.filter((x) => x.ga_id === gaId).length;
        if (count) await audit("trumpet_guests_imported", gaId, gaId, { year, count }); // counts only, no names or phones
      }
      return res.status(200).json({ guests: r.data.map(toGuest), skipped });
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

    if (body.action === "status" || body.action === "attend") {
      const status = body.action === "attend" ? (body.attended ? "in_person" : "invited") : body.status;
      if (!isGuestStatus(status)) return fail(400, "invalid_status");
      const own = await loadOwned(body.id);
      if (own.error) return fail(...own.error);
      const now = new Date().toISOString();
      const wasAttended = isAttendedStatus(statusOf(own.row)) && own.row.attended_at;
      const attendedAt = isAttendedStatus(status) ? (wasAttended ? own.row.attended_at : now) : null;
      const r = await rest(`trumpet_guests?id=eq.${own.row.id}&select=${COLS}`, {
        method: "PATCH",
        body: { status, attended_at: attendedAt, updated_at: now, updated_by: by },
        prefer: "return=representation",
      });
      if (!r.ok || !r.data?.[0]) return fail(404, "not_found");
      await audit("trumpet_guest_status", own.row.id, own.row.ga_id, { from: statusOf(own.row), to: status });
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

    if (body.action === "summary") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const scoped = gas.filter((x) => seen.has(x.id));
      const rows = scoped.length
        ? await fetchAll(rest, `trumpet_guests?year=eq.${year}&ga_id=in.(${scoped.map((x) => x.id).join(",")})&select=church,ga_id,invited_by_member_id,attended_at&order=ga_id,id`)
        : [];
      const inviterIds = [...new Set(rows.map((r) => r.invited_by_member_id).filter(Boolean))];
      const members = inviterIds.length ? await fetchAll(rest, `members?id=in.(${inviterIds.join(",")})&select=id,name&order=id`) : [];
      const gr = scoped.length ? await rest(`trumpet_goals?year=eq.${year}&select=church,goal`) : { ok: true, data: [] };
      if (!gr.ok) throw new Error(`goals_read_failed:${gr.status}`);
      const rowsOnly = rows.map(({ church, ga_id, invited_by_member_id, attended_at }) => ({ church, ga_id, invited_by_member_id, attended_at }));
      return res.status(200).json({ summary: buildSummary(rowsOnly, { gas: scoped, members, goals: gr.data || [] }) });
    }

    if (body.action === "edition") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      if (!seen.size) return res.status(200).json({ edition: { reasons: "", reasonsEn: "" } });
      const r = await rest(`trumpet_editions?year=eq.${year}&select=reasons,reasons_en`);
      if (!r.ok) throw new Error(`edition_read_failed:${r.status}`);
      const e = r.data?.[0] || {};
      return res.status(200).json({ edition: { reasons: e.reasons || "", reasonsEn: e.reasons_en || "" } });
    }

    if (body.action === "setEdition") {
      if (!canManagePanel(roles)) return fail(403, "forbidden");
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const reasons = String(body.reasons || "");
      const reasonsEn = String(body.reasonsEn || "");
      if (reasons.length > 4000 || reasonsEn.length > 4000) return fail(400, "invalid_reasons");
      const w = await rest("trumpet_editions?on_conflict=year&select=year", {
        method: "POST",
        body: { year, reasons, reasons_en: reasonsEn, updated_at: new Date().toISOString(), updated_by: by },
        prefer: "resolution=merge-duplicates,return=representation",
      });
      if (!w.ok || !w.data?.[0]) throw new Error(`edition_save_failed:${w.status}`);
      await rest("audit_log", {
        method: "POST",
        body: { actor_name: caller.name, actor_id: caller.id, actor_role: caller.sys_role, action: "trumpet_edition_set", entity_type: "trumpet_edition", entity_id: String(year), entity_label: String(year), details: {} },
      });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "goals") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      if (!seen.size) return res.status(200).json({ goals: [] });
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
      const rows = await fetchAll(rest, `trumpet_guests?year=in.(${year},${year - 1})&select=year,church,ga_id,invited_by_member_id,attended_at,status,created_at&order=created_at,id`);
      const inviterIds = [...new Set(rows.filter((r) => r.year === year).map((r) => r.invited_by_member_id).filter(Boolean))];
      const members = inviterIds.length ? await fetchAll(rest, `members?id=in.(${inviterIds.join(",")})&select=id,name&order=id`) : [];
      const gr = await rest(`trumpet_goals?year=eq.${year}&select=church,goal`);
      if (!gr.ok) throw new Error(`goals_read_failed:${gr.status}`);
      const stats = buildStats(rows, { year, gas, members, goals: gr.data || [], today: todayNY() });
      return res.status(200).json({ stats });
    }

    if (body.action === "shareGet" || body.action === "shareCreate" || body.action === "shareRevoke") {
      const year = yearOf(body.year);
      if (!year) return fail(400, "invalid_year");
      const gaId = String(body.gaId || "");
      if (!allowed.has(gaId)) return fail(403, "forbidden");
      const key = `trumpet_share_links?year=eq.${year}&ga_id=eq.${encodeURIComponent(gaId)}`;
      const toLink = (r) => (r ? { token: r.token, createdAt: r.created_at } : null);
      if (body.action === "shareGet") {
        const r = await rest(`${key}&select=token,created_at`);
        if (!r.ok) throw new Error(`share_read_failed:${r.status}`);
        return res.status(200).json({ link: toLink(r.data?.[0]) });
      }
      const shareAudit = (action) => rest("audit_log", {
        method: "POST",
        body: { actor_name: caller.name, actor_id: caller.id, actor_role: caller.sys_role, action, entity_type: "trumpet_share_link", entity_id: gaId, entity_label: gaById[gaId]?.name || gaId, details: { year } },
      });
      if (body.action === "shareRevoke") {
        const d = await rest(key, { method: "DELETE" });
        if (!d.ok) throw new Error(`share_delete_failed:${d.status}`);
        await shareAudit("trumpet_share_link_revoked");
        return res.status(200).json({ ok: true });
      }
      const token = randomBytes(18).toString("base64url");
      const w = await rest("trumpet_share_links?on_conflict=year,ga_id&select=token,created_at", {
        method: "POST",
        body: { year, ga_id: gaId, token, created_at: new Date().toISOString(), created_by: by },
        prefer: "resolution=merge-duplicates,return=representation",
      });
      if (!w.ok || !w.data?.[0]) throw new Error(`share_save_failed:${w.status}`);
      await shareAudit("trumpet_share_link_created");
      return res.status(200).json({ link: toLink(w.data[0]) });
    }

    return fail(400, "unknown_action");
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
