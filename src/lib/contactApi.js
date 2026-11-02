// Reading and saving members' phone and e-mail (see migration 039).
// Public pages: contact_status (on file or not, no values) and fill_member_contact
// (fills only what is missing). Staff: /api/member-contacts (values; can change them).
import { sb } from "@/lib/supabase";
import { authHeaders } from "@/lib/session";
import { contactStatusMap, normalizeEmail, normalizePhone } from "@/lib/contact";

// { [memberId]: { hasPhone, hasEmail } }; members with nothing on file are absent.
export async function fetchContactStatus(memberIds) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await sb.rpc("contact_status", { p_member_ids: ids });
  if (error) {
    console.error("contact_status error:", error);
    return {};
  }
  return contactStatusMap(data);
}

// Returns null on success, or an error message.
export async function fillContact(memberId, { phone, email }) {
  const p = normalizePhone(phone);
  const e = normalizeEmail(email);
  if (!memberId || (!p && !e)) return null;
  const { error } = await sb.rpc("fill_member_contact", { p_member_id: memberId, p_phone: p || null, p_email: e || null });
  return error ? error.message : null;
}

async function staffCall(body) {
  const res = await fetch("/api/member-contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http_${res.status}`);
  return data;
}

// { [memberId]: { phone, email } } for signed-in staff; {} when unavailable
// (e.g. `npm run dev`, which has no serverless functions).
export async function staffGetContacts(memberIds) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (!ids.length) return {};
  try {
    return (await staffCall({ action: "get", memberIds: ids })).contacts || {};
  } catch (err) {
    console.error("member contacts read failed:", err);
    return {};
  }
}

// Saves (or clears, with "") a member's phone and e-mail. Throws on failure.
export async function staffSetContact(memberId, { phone, email }) {
  return (await staffCall({ action: "set", memberId, phone: phone || "", email: email || "" })).contact;
}
