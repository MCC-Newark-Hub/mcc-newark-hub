import { sb } from "@/lib/supabase";

// One line of the audit log (Configurações › Auditoria). Best effort: a failure to write the log is reported in the console and
// never blocks the action itself.
//
// Staff actions carry the signed-in user. Actions through a public link have no login, so the actor is the name the person typed
// with the role "public", plus the device (browser) in the details — a trail, not proof of identity.
export function logAuditEvent({ actor, action, entityType, entityId = null, entityLabel = null, details = null }) {
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
    .then((res) => { if (res?.error) console.error("audit error:", res.error); })
    .catch((err) => console.error("audit error:", err));
}

export const staffActor = (user) => (user ? { name: user.name, id: user.id, role: user.sysRole || user.primaryRole || "staff" } : null);
export const publicActor = (name) => ({ name: String(name || "").trim() || "Público", id: null, role: "public" });
export const deviceInfo = () => (typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent.slice(0, 140) : null);
