// Who may open each Hub section. One list for both the Home tiles and the route guard, so a profile that has no
// tile also gets the "no access" message when it types the URL.
import { GL_TEAM } from "@/lib/praiseLists";

export const SECTION_ROLES = {
  events: ["admin", "clerk", "pastor", "ga_leader", "team_leader", "treasurer"],
  cms: ["admin", "clerk", "pastor", "ga_leader"],
  assistance: ["admin", "clerk", "pastor"],
  // GA leaders don't need Escalas or Culto Profético (they still see them through any other role they hold)
  schedule: ["admin", "clerk", "pastor", "treasurer"],
  worship: ["admin", "clerk", "pastor", "treasurer"],
  apprentice: ["admin", "clerk", "pastor"],
  settings: ["admin"],
};

export const rolesOf = (user) => (user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean));

export function canSeeSection(user, id) {
  const roles = rolesOf(user);
  if ((SECTION_ROLES[id] || []).some((r) => roles.includes(r))) return true;
  // team leaders only reach Culto Profético when they lead the Grupo de Louvor (they manage the praise lists)
  if (id === "worship" && roles.includes("team_leader")) return (user?.teamLeads || []).includes(GL_TEAM);
  return false;
}
