// Vercel serverless function: members' phone and e-mail for signed-in staff.
// The contacts table is not readable from the browser (migration 039); the public
// pages only see whether a contact is on file (contact_status) and can only fill a
// missing one (fill_member_contact). Staff read and change them here.
//
//   POST { action: "get", memberIds: [...] }               → { contacts: { [id]: { phone, email } } }
//   POST { action: "set", memberId, phone, email }         → { contact: { phone, email } }
//        (an empty string clears that field)

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

    res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
