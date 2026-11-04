// "Trocar Função": someone with several profiles works in one at a time. The chosen profile
// (localStorage mcc_view) becomes the user's only role for every screen, so each profile sees
// just what belongs to it. `allRoles` keeps the real list for the switcher itself.
export function viewAs(user, role) {
  if (!user) return user;
  const roles = user.sysRoles?.length ? user.sysRoles : [user.sysRole].filter(Boolean);
  const active = roles.includes(role) ? role : user.primaryRole && roles.includes(user.primaryRole) ? user.primaryRole : roles[0];
  if (!active || roles.length < 2) return { ...user, allRoles: roles };
  return { ...user, sysRole: active, primaryRole: active, sysRoles: [active], allRoles: roles };
}
