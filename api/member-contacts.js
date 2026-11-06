// Vercel serverless function: members' phone and e-mail for signed-in staff.
// The contacts table is not readable from the browser (migration 039); the public
// pages only see whether a contact is on file (contact_status) and can only fill a
// missing one (fill_member_contact). Staff read and change them here.
//
//   POST { action: "get", memberIds: [...] }               → { contacts: { [id]: { phone, email } } }
//   POST { action: "set", memberId, phone, email }         → { contact: { phone, email } }
//        (an empty string clears that field)
//   POST { action: "requests", memberIds: [...] }           → { requests: [...] } pending changes
//        asked on the public form (contact_change_requests, migration 051)
//   POST { action: "resolve", id, approve }                 → { ok: true } approve writes the new
//        values to member_contacts and keeps the old ones on the request (server-only);
//        the audit log only says which fields changed, never the values

import { restClient, currentUser } from "./_lib/auth.js";
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "../src/lib/contact.js";

const ID = /^[A-Za-z0-9_-]{1,40}$/;

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
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (body.action === "get") {
      const ids = [...new Set(Array.isArray(body.memberIds) ? body.memberIds : [])].filter((id) => ID.test(String(id))).slice(0, 1000);
      if (!ids.length) {
        res.status(200).json({ contacts: {} });
        return;
      }
      const r = await rest(`member_contacts?member_id=in.(${ids.join(",")})&select=member_id,phone,email`);
      if (!r.ok) throw new Error(`contacts_read_failed:${r.status}`);
      const contacts = Object.fromEntries(r.data.map((c) => [c.member_id, { phone: c.phone || "", email: c.email || "" }]));
      res.status(200).json({ contacts });
      return;
    }

    if (body.action === "set") {
      const memberId = String(body.memberId || "");
      if (!ID.test(memberId)) {
        res.status(400).json({ error: "invalid_member" });
        return;
      }
      const phone = normalizePhone(body.phone);
      const email = normalizeEmail(body.email);
      if (phone && !isValidPhone(phone)) {
        res.status(400).json({ error: "invalid_phone" });
        return;
      }
      if (email && !isValidEmail(email)) {
        res.status(400).json({ error: "invalid_email" });
        return;
      }
      const row = { member_id: memberId, phone: phone || null, email: email || null, updated_at: new Date().toISOString(), updated_by: caller.name || String(caller.id) };
      const r = await rest("member_contacts?on_conflict=member_id&select=phone,email", {
        method: "POST",
        body: row,
        prefer: "resolution=merge-duplicates,return=representation",
      });
      if (!r.ok || !r.data?.[0]) throw new Error(`contact_save_failed:${r.status}`);
      res.status(200).json({ contact: { phone: r.data[0].phone || "", email: r.data[0].email || "" } });
      return;
    }

    if (body.action === "requests") {
      const ids = [...new Set(Array.isArray(body.memberIds) ? body.memberIds : [])].filter((id) => ID.test(String(id))).slice(0, 1000);
      if (!ids.length) {
        res.status(200).json({ requests: [] });
        return;
      }
      const r = await rest(`contact_change_requests?status=eq.pending&member_id=in.(${ids.join(",")})&select=id,member_id,phone,email,created_at,members(name)&order=created_at`);
      if (!r.ok) throw new Error(`requests_read_failed:${r.status}`);
      const reqIds = r.data.map((q) => q.member_id);
      const cur = reqIds.length ? await rest(`member_contacts?member_id=in.(${reqIds.join(",")})&select=member_id,phone,email`) : { ok: true, data: [] };
      if (!cur.ok) throw new Error(`contacts_read_failed:${cur.status}`);
      const curBy = Object.fromEntries(cur.data.map((c) => [c.member_id, c]));
      const requests = r.data.map((q) => ({
        id: q.id,
        memberId: q.member_id,
        memberName: q.members?.name || q.member_id,
        phone: q.phone || "",
        email: q.email || "",
        currentPhone: curBy[q.member_id]?.phone || "",
        currentEmail: curBy[q.member_id]?.email || "",
        createdAt: q.created_at,
      }));
      res.status(200).json({ requests });
      return;
    }

    if (body.action === "resolve") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const r = await rest(`contact_change_requests?id=eq.${id}&status=eq.pending&select=id,member_id,phone,email,members(name)`);
      const q = r.ok && r.data?.[0];
      if (!q) {
        res.status(404).json({ error: "request_not_found" });
        return;
      }
      const by = caller.name || String(caller.id);
      const cur = await rest(`member_contacts?member_id=eq.${encodeURIComponent(q.member_id)}&select=phone,email`);
      const before = (cur.ok && cur.data?.[0]) || {};
      if (body.approve) {
        const patch = { updated_at: new Date().toISOString(), updated_by: by };
        if (q.phone) patch.phone = q.phone;
        if (q.email) patch.email = q.email;
        const w = await rest(`member_contacts?member_id=eq.${encodeURIComponent(q.member_id)}&select=member_id`, { method: "PATCH", body: patch, prefer: "return=representation" });
        if (!w.ok || !w.data?.length) throw new Error(`contact_save_failed:${w.status}`);
      }
      const done = await rest(`contact_change_requests?id=eq.${id}&status=eq.pending&select=id`, {
        method: "PATCH",
        body: {
          status: body.approve ? "approved" : "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: by,
          previous_phone: before.phone || null,
          previous_email: before.email || null,
        },
        prefer: "return=representation",
      });
      if (!done.ok || !done.data?.length) throw new Error(`request_update_failed:${done.status}`);
      await rest("audit_log", {
        method: "POST",
        body: {
          actor_name: caller.name,
          actor_id: caller.id,
          actor_role: caller.sys_role,
          action: body.approve ? "contact_change_approved" : "contact_change_rejected",
          entity_type: "member",
          entity_id: q.member_id,
          entity_label: q.members?.name || q.member_id,
          // audit_log is readable by the browser: which fields, not the values.
          details: { fields: [q.phone && "phone", q.email && "email"].filter(Boolean), request_id: id },
        },
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
