// Phone and e-mail rules for registrations. Pure (no Supabase): used by the public
// form, the lookup page, the staff screens and api/member-contacts.js.
//
// When an event has "Telefone e e-mail obrigatórios" (events.require_contact), every
// Jovem and Adulto gives their own phone and e-mail; children are covered by their
// parents' contact. A submission with no Jovem/Adulto asks the first person.

export const CONTACT_CATEGORIES = ["Jovem", "Adulto"];

export const eventRequiresContact = (event) => !!(event?.require_contact ?? event?.requireContact);

export const needsOwnContact = (person) => CONTACT_CATEGORIES.includes(person?.category);

// The people of one submission who should give a contact.
export function contactTargets(people) {
  const list = (people || []).filter(Boolean);
  const own = list.filter(needsOwnContact);
  return own.length ? own : list.slice(0, 1);
}

export const normalizeEmail = (s) => String(s || "").trim().toLowerCase();
export const normalizePhone = (s) => String(s || "").trim();

export const isValidEmail = (s) => {
  const e = normalizeEmail(s);
  return e.length > 0 && e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
};
export const isValidPhone = (s) => {
  const p = normalizePhone(s);
  return p.length > 0 && p.length <= 40 && p.replace(/\D/g, "").length >= 10;
};

// Problems with what a person typed: { phone?: "required" | "invalid", email?: … }.
// `onFile` ({ hasPhone, hasEmail }) skips what the directory already has.
export function contactErrors({ phone, email }, { required = false, onFile = {} } = {}) {
  const errors = {};
  if (normalizePhone(phone)) { if (!isValidPhone(phone)) errors.phone = "invalid"; }
  else if (required && !onFile.hasPhone) errors.phone = "required";
  if (normalizeEmail(email)) { if (!isValidEmail(email)) errors.email = "invalid"; }
  else if (required && !onFile.hasEmail) errors.email = "required";
  return errors;
}

// contact_status rows → { [memberId]: { hasPhone, hasEmail } }.
export const contactStatusMap = (rows) =>
  Object.fromEntries((rows || []).map((r) => [r.member_id, { hasPhone: !!r.has_phone, hasEmail: !!r.has_email }]));

export const hasFullContact = (status) => !!(status?.hasPhone && status?.hasEmail);
