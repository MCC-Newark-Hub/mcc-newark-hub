import { sb } from "@/lib/supabase";
import { slotRange } from "@/lib/prayerSlots";

// Everything done on a prayer list goes to the audit log (Configurações › Auditoria), by staff or through the public link.
// Best effort: a failure to write the log is reported in the console and never blocks the action itself.
//
// Staff actions carry the signed-in user. Actions through the public link have no login, so the actor is the name the person
// typed (booking: the name of the booking; removal: what was typed in the search box) with the role "public", plus the
// device (browser) in the details — a trail, not proof of identity.
export function logPrayerAudit({ actor, action, entityType = "prayer_slot", entityId = null, entityLabel = null, details = null }) {
  const row = {
    actor_name: actor?.name || "Público",
    actor_id: actor?.id ?? null,
    actor_role: actor?.role || "public",
    action,
    entity_type: entityType,
    entity_id: entityId != null ? String(entityId) : null,
    entity_label: entityLabel,
    details,
  };
  return Promise.resolve(sb.from("audit_log").insert(row))
    .then((res) => { if (res?.error) console.error("prayer audit error:", res.error); })
    .catch((err) => console.error("prayer audit error:", err));
}

export const staffActor = (user) => (user ? { name: user.name, id: user.id, role: user.sysRole || user.primaryRole || "staff" } : null);
export const publicActor = (name) => ({ name: String(name || "").trim() || "Público", id: null, role: "public" });
export const deviceInfo = () => (typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent.slice(0, 140) : null);

// The common details of an action on one entry of a list.
export const slotDetails = (period, entry, extra = {}) => ({
  list: period?.list_name || period?.title || null,
  period_id: period?.id || null,
  slot: entry?.slot_index != null ? slotRange(entry.slot_index) : null,
  person: entry?.member_name || null,
  church: entry?.church || null,
  ...extra,
});
