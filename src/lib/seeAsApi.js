// "Ver como": the server (api/see-as.js) checks that the caller is an admin and writes the
// start and the end to the audit log. The admin keeps their own token the whole time.
import { authHeaders, getSessionToken } from "@/lib/session";
import { logAuditEvent } from "@/lib/auditEvent";

// `vite dev` has no serverless functions: with a dev seed session (see useAuth) the audit
// line is written from the browser instead. Vite drops this branch from production builds.
const devFallback = (action, admin, target) => {
  logAuditEvent({
    actor: { name: admin.name, id: admin.id, role: "admin" },
    action: action === "start" ? "see_as_started" : "see_as_ended",
    entityType: "app_user",
    entityId: target.id,
    entityLabel: target.name,
    details: { roles: target.sysRoles },
  });
  return { ok: true };
};

// Resolves to { ok: true } or { error: "admin_only" | "not_signed_in" | "user_not_found" | "unavailable" | ... }.
export async function requestSeeAs(action, admin, target) {
  let res;
  try {
    res = await fetch("/api/see-as", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action, userId: target.id }),
    });
  } catch {
    res = null;
  }
  if ((!res || res.status === 404) && import.meta.env.DEV && getSessionToken()?.endsWith(".dev")) {
    return devFallback(action, admin, target);
  }
  if (!res) return { error: "unavailable" };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { error: data.error || "unavailable" };
}
