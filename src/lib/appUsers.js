// The app_users columns the browser may read (see migrations/037_drop_plain_pin.sql).
// PIN data never leaves the server, so never use select("*") on this table.
export const APP_USER_COLUMNS =
  "id,name,sys_role,initials,church,ga_ids,team_leads,created_at,sys_roles,primary_role,churches,active,show_financials";

// Raw app_users row → the signed-in user object the views use.
export function mapAppUser(u) {
  const sysRole = u.sys_role || u.sysRole;
  return {
    id: u.id,
    name: u.name,
    sysRole,
    sysRoles: u.sys_roles?.length ? u.sys_roles : [sysRole],
    primaryRole: u.primary_role || u.primaryRole || sysRole,
    initials: u.initials || u.name.slice(0, 2).toUpperCase(),
    church: u.church,
    churches: u.churches || [],
    gaIds: u.ga_ids || u.gaIds || [],
    teamLeads: u.team_leads || u.teamLeads || [],
    showFinancials: u.show_financials !== false,
  };
}
