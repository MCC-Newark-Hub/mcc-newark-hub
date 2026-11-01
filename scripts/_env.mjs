// Shared by the local admin scripts. Run them through npm (`npm run rotate-pins`,
// `npm run reset-pin`), which loads .env. PIN_PEPPER must be the same value as in
// the Vercel production environment, or the PINs written here will not sign in.
import { restClient } from "../api/_lib/auth.js";

export function serverEnv() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER } = process.env;
  const missing = Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}`);
    process.exit(1);
  }
  return { rest: restClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), pepper: PIN_PEPPER };
}

export function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// Same labels as the Usuários & PINs screen.
const ROLE_LABELS = {
  admin: "Admin",
  clerk: "Atendente",
  pastor: "Pastor",
  ga_leader: "Líder de GA",
  team_leader: "Líder de Equipe",
  treasurer: "Tesoureiro(a)",
};

// Everything that decides what a user sees: every role (the default one marked),
// the teams they lead, their assistance groups and the churches they are limited to.
export async function describeUsers(rest, filter = "active=is.true") {
  const [users, groups] = await Promise.all([
    rest(`app_users?${filter}&select=id,name,sys_role,sys_roles,primary_role,team_leads,ga_ids,church,churches&order=name`),
    rest("assistance_groups?select=id,name"),
  ]);
  if (!users.ok) throw new Error(`Could not read app_users (${users.status})`);
  const groupName = new Map((groups.ok ? groups.data : []).map((g) => [String(g.id), g.name]));
  return users.data.map((u) => {
    const roles = u.sys_roles?.length ? u.sys_roles : [u.sys_role];
    const primary = u.primary_role || u.sys_role;
    return {
      id: u.id,
      name: u.name,
      roles: roles.map((r) => `${ROLE_LABELS[r] || r}${roles.length > 1 && r === primary ? " (padrão)" : ""}`).join("; "),
      teams: (u.team_leads || []).join("; "),
      groups: (u.ga_ids || []).map((id) => groupName.get(String(id)) || id).join("; "),
      church: u.church || "",
      churches: (u.churches || []).join("; ") || "todas",
    };
  });
}
