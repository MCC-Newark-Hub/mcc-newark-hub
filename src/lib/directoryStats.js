// Diretório › Visão Geral: who may see what, and every number on the page. Pure functions, computed live from the
// directory — nothing here is stored.
import { CATEGORIES } from "@/constants";
import { familyIdOf } from "@/lib/family";
import { effectiveRoles, MINISTRY_LEVELS } from "@/lib/orgChart";

export const cityOf = (church) => String(church || "").split(",")[0].trim();
const byPt = (a, b) => String(a).localeCompare(String(b), "pt");

// Not a real church of the directory: nobody, or "Outra: Brasil".
export const isUnsetChurch = (church) => !church || /^sem igreja/i.test(church) || /^outra/i.test(church);

// Which churches a user sees on the overview. { all: true } or { all: false, cities: [...] } (city names).
//  - admin → everything
//  - a limited list (app_users.churches) → exactly those
//  - a pastor with no list (Pr Nairon) → everything
//  - anyone else (church secretary) → the church of their account
export function scopeFor(user) {
  const roles = user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean);
  if (roles.includes("admin")) return { all: true, cities: [] };
  const list = (user?.churches || []).map(cityOf).filter(Boolean);
  if (list.length) return { all: false, cities: list };
  if (roles.includes("pastor")) return { all: true, cities: [] };
  const own = cityOf(user?.church);
  return { all: false, cities: own ? [own] : [] };
}

// Directory churches (display names) the scope allows.
export function churchesInScope(churches, scope) {
  const names = (churches || []).map((c) => c.display || c).filter((d) => d && !isUnsetChurch(d));
  return scope.all ? names : names.filter((d) => scope.cities.some((c) => cityOf(d).toLowerCase() === c.toLowerCase()));
}

// Every overview number. `churchFilter` is "" (everything the user may see) or one church display name.
export function computeOverview({ members = [], gas = [], families = [], churches = [], scope, churchFilter = "", now = new Date() }) {
  const allowed = churchesInScope(churches, scope);
  const allowedSet = new Set(allowed);
  const visible = churchFilter ? new Set(allowedSet.has(churchFilter) ? [churchFilter] : []) : allowedSet;
  // Members with no real church (Sem Igreja, Outra…) only show for people who see everything and filter nothing.
  const includeUnset = scope.all && !churchFilter;
  const ms = members.filter((m) => (isUnsetChurch(m.church) ? includeUnset : visible.has(m.church)));

  const label = (m) => (isUnsetChurch(m.church) ? "—" : m.church);
  const count = (list, pred) => list.filter(pred).length;
  const male = count(ms, (m) => m.gender === "M");
  const female = count(ms, (m) => m.gender === "F");

  const perChurch = new Map();
  for (const m of ms) {
    const key = label(m);
    if (!perChurch.has(key)) perChurch.set(key, { church: key, total: 0, m: 0, f: 0 });
    const row = perChurch.get(key);
    row.total += 1;
    if (m.gender === "M") row.m += 1;
    if (m.gender === "F") row.f += 1;
  }
  // A church with nobody registered is left out (the directory has ~50), unless it is the one being filtered.
  if (churchFilter && visible.has(churchFilter) && !perChurch.has(churchFilter)) perChurch.set(churchFilter, { church: churchFilter, total: 0, m: 0, f: 0 });
  const byChurch = [...perChurch.values()].sort((a, b) => b.total - a.total || byPt(a.church, b.church));

  const cats = new Map();
  for (const m of ms) cats.set(m.category || "—", (cats.get(m.category || "—") || 0) + 1);
  const known = CATEGORIES.filter((c) => cats.has(c)).map((c) => ({ label: c, value: cats.get(c) }));
  const other = [...cats.entries()].filter(([c]) => !CATEGORIES.includes(c)).map(([c, v]) => ({ label: c, value: v }));
  const byCategory = [...known, ...other];

  const recent = now.getTime() - 30 * 86400000;
  const newest = count(ms, (m) => m.createdAt && new Date(m.createdAt).getTime() >= recent);

  const roleOf = (m) => effectiveRoles(m.roles || (m.role ? [m.role] : []));
  const ministry = MINISTRY_LEVELS.map((role) => ({ role, value: count(ms, (m) => roleOf(m).includes(role)) }));

  const gaInScope = gas.filter((g) => (isUnsetChurch(g.church) ? includeUnset : visible.has(g.church)));
  const sizes = new Map();
  for (const m of ms) if (m.gaId) sizes.set(m.gaId, (sizes.get(m.gaId) || 0) + 1);
  const leaderName = (g) => members.find((m) => m.id === g.leaderId)?.name || "";
  const gaList = gaInScope
    .map((g) => ({ id: g.id, name: g.name, church: g.church || "", size: sizes.get(g.id) || 0, leader: leaderName(g) }))
    .sort((a, b) => byPt(a.church, b.church) || a.name.localeCompare(b.name, "pt", { numeric: true }));

  const item = (m) => ({ id: m.id, name: m.name, church: m.church || "", ga: gas.find((g) => g.id === m.gaId)?.name || "" });
  const coverage = {
    noGa: ms.filter((m) => !m.gaId).map(item),
    noFamily: ms.filter((m) => !familyIdOf(m, families)).map(item),
    noChurch: ms.filter((m) => isUnsetChurch(m.church)).map(item),
    noImmigration: ms.filter((m) => !m.immigrationStatus).map(item),
    gasNoLeader: gaList.filter((g) => !g.leader),
  };

  const familyIds = new Set(ms.map((m) => familyIdOf(m, families)).filter(Boolean));

  // Churches × functions: ministry levels first, then the other functions by how many people hold them.
  const roleTotals = new Map();
  for (const m of ms) for (const r of roleOf(m)) roleTotals.set(r, (roleTotals.get(r) || 0) + 1);
  const others = [...roleTotals.entries()].filter(([r]) => !MINISTRY_LEVELS.includes(r)).sort((a, b) => b[1] - a[1] || byPt(a[0], b[0])).slice(0, 8).map(([r]) => r);
  const roleColumns = [...MINISTRY_LEVELS, ...others];
  const matrix = byChurch.filter((c) => c.church !== "—").map((c) => ({
    church: c.church,
    cells: roleColumns.map((r) => count(ms, (m) => m.church === c.church && roleOf(m).includes(r))),
  }));

  // Churches worth offering in the filter: the ones the user may see that have members.
  const withMembers = new Set(members.map((m) => m.church));
  const churchOptions = allowed.filter((d) => withMembers.has(d)).sort(byPt);

  return {
    churchOptions, total: ms.length, guests: count(ms, (m) => m.isGuest), male, female, newest,
    families: familyIds.size, gaCount: gaList.length, ministry, byChurch, byCategory, gaList, coverage, roleColumns, matrix,
  };
}
