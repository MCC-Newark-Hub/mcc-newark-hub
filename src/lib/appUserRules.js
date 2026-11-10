// The user profile an admin may save (Usuários & PINs), as app_users columns. Pure and imported by api/app-users.js,
// so relative imports only — no "@/".

export const SYS_ROLES = ["admin", "clerk", "pastor", "ga_leader", "team_leader", "treasurer"];
const GA_ID = /^[A-Za-z0-9_-]{1,40}$/;
const text = (v, max) => String(v ?? "").trim().slice(0, max);
const list = (v, max, each) => (Array.isArray(v) ? v : []).map((x) => text(x, each)).filter(Boolean).slice(0, max);

// { error } or { fields } — only these columns ever reach the table (never id, pin_hash, active, …).
export function cleanProfileInput(body = {}) {
  const name = text(body.name, 80);
  if (!name) return { error: "invalid_name" };
  const sysRoles = [...new Set(list(body.sysRoles, 6, 20))];
  const primary = text(body.primaryRole, 20) || sysRoles[0];
  const roles = sysRoles.length ? sysRoles : [primary].filter(Boolean);
  if (!roles.length || !roles.every((r) => SYS_ROLES.includes(r)) || !roles.includes(primary)) return { error: "invalid_roles" };
  const gaIds = roles.includes("ga_leader") ? list(body.gaIds, 50, 40) : [];
  if (!gaIds.every((id) => GA_ID.test(id))) return { error: "invalid_ga" };
  return {
    fields: {
      name,
      sys_role: primary,
      sys_roles: roles,
      primary_role: primary,
      initials: text(body.initials, 4) || name.slice(0, 2).toUpperCase(),
      church: text(body.church, 120) || null,
      ga_ids: gaIds,
      team_leads: roles.includes("team_leader") ? list(body.teamLeads, 30, 60) : [],
      churches: list(body.churches, 30, 60),
      show_financials: body.showFinancials !== false,
    },
  };
}
