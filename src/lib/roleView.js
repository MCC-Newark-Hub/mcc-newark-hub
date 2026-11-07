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

// "Ver como": an admin looks at the app as another user, without their PIN. Only someone whose real
// profiles include admin may do it. The screens get that user (one profile at a time, like viewAs);
// `viewedBy` keeps the admin, so whatever is done meanwhile is recorded under the admin's name.
export const canSeeAs = (realUser) => (realUser?.sysRoles || [realUser?.sysRole]).includes("admin");

export function seeAs(realUser, target, role) {
  if (!canSeeAs(realUser) || !target || target.id === realUser.id) return null;
  return { ...viewAs(target, role), viewedBy: { id: realUser.id, name: realUser.name } };
}

// Name for timelines and the audit log while seeing as someone: "Admin Geral (como Marcos Martins)".
export const actingName = (user) => (user?.viewedBy ? `${user.viewedBy.name} (como ${user.name})` : user?.name);

// Names of the profiles, as the switcher shows them.
const ROLE_NAMES = {
  pt: { admin: "Administrador", clerk: "Secretaria", pastor: "Pastores", ga_leader: "Líder de GA", team_leader: "Líder de Equipe", treasurer: "Tesouraria" },
  en: { admin: "Admin", clerk: "Secretary", pastor: "Pastors", ga_leader: "GA Leader", team_leader: "Team Leader", treasurer: "Treasury" },
};
export const roleName = (role, lang = "pt") => (ROLE_NAMES[lang] || ROLE_NAMES.pt)[role] || ROLE_NAMES.pt[role] || role;
