// Culto Profético › Grupos: pure rules for the weekly responsible-group table.
import { norm } from "@/lib/praiseLists";
import { cityOf, scopeFor } from "@/lib/directoryStats";

// One responsible group per church and slot. Sunday has two services (EBD in the morning, Noite at night).
export const SLOTS = ["mon", "tue", "wed", "thu", "fri", "sat", "ebd", "noite"];
const WEEKDAY_SLOT = [null, "mon", "tue", "wed", "thu", "fri", "sat"];

// Slot of a service: Sunday by service type (anything but "ebd" is the Noite), other days by weekday.
export function slotFor(date, serviceType) {
  const [y, m, d] = String(date).split("-").map(Number);
  if (!y || !m || !d) return null;
  const weekday = new Date(y, m - 1, d).getDay();
  if (weekday === 0) return serviceType === "ebd" ? "ebd" : "noite";
  return WEEKDAY_SLOT[weekday];
}

// The group responsible for a church's service, with its leader and workers (in order); null when nobody is
// scheduled, the group is inactive or was deleted.
export function groupForService(data, church, date, serviceType) {
  const slot = slotFor(date, serviceType);
  if (!data || !church || !slot) return null;
  const row = (data.schedule || []).find((r) => r.church === church && r.slot === slot);
  const group = row && (data.groups || []).find((g) => g.id === row.group_id);
  if (!group || !group.is_active) return null;
  const workerNames = (data.workers || [])
    .filter((w) => w.group_id === group.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, "pt"))
    .map((w) => w.name);
  return { group, leaderName: group.leader_name || "", workerNames };
}

// "newark 2" is the same group as "Newark 2".
export const sameGroupName = (a, b) => !!norm(a) && norm(a) === norm(b);

// Error key (STRINGS) for a group form, or null when it can be saved. A group without a leader is valid.
export function validateGroup(form, groups = []) {
  const name = String(form?.name || "").trim();
  if (!name) return "sgNameRequired";
  const taken = groups.some((g) => g.id !== form.id && g.church === form.church && sameGroupName(g.name, name));
  return taken ? "sgNameTaken" : null;
}

const rolesOf = (user) => (user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean));

// Churches whose groups this user may edit: admins all, clerks those in their scope (by city), others none.
export function editableChurches(user, churchNames = []) {
  const roles = rolesOf(user);
  if (roles.includes("admin")) return churchNames;
  if (!roles.includes("clerk")) return [];
  const cities = scopeFor(user).cities.map((c) => c.toLowerCase());
  return churchNames.filter((c) => cities.includes(cityOf(c).toLowerCase()));
}
