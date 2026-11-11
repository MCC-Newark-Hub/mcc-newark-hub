// Assistance groups always belong to a church, so they are listed grouped by church — never as a loose list.
const byPt = (a, b) => String(a).localeCompare(String(b), "pt");
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { numeric: true }); // "Newark 2" before "Newark 10"

// [{ church, gas: [ga…], members: n }] — churches A-Z, groups of a church in natural name order,
// and groups without a church (they should not exist) last, under church "".
export function groupGasByChurch(gas = [], members = []) {
  const perGa = new Map();
  for (const m of members) if (m.gaId) perGa.set(m.gaId, (perGa.get(m.gaId) || 0) + 1);
  const map = new Map();
  for (const ga of gas) {
    const key = (ga.church || "").trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ga);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : byPt(a, b)))
    .map(([church, list]) => {
      const sorted = [...list].sort(byName);
      return { church, gas: sorted, members: sorted.reduce((n, g) => n + (perGa.get(g.id) || 0), 0) };
    });
}

// Member lists (Diretório › Membros of a church secretary): filter and group by the member's GA (`member.gaId`).
// Ids are compared as strings because they come as text or number.
export const GA_NONE = "__none__";
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// The GA of a member, or null when it has none or points to a group that is not in `gas`.
export function gaOf(member, gas) {
  if (member?.gaId == null || member.gaId === "") return null;
  return (gas || []).find((g) => sameId(g.id, member.gaId)) || null;
}

// filter: "" (everyone), GA_NONE (members without a known group) or a GA id.
export function filterByGa(members, gas, filter) {
  if (!filter) return members || [];
  if (filter === GA_NONE) return (members || []).filter((m) => !gaOf(m, gas));
  return (members || []).filter((m) => sameId(gaOf(m, gas)?.id, filter));
}

// [{ gaId, gaName, members }] — groups in natural name order, members in the given order, the ones without a group last.
export function groupByGa(members, gas, noneLabel) {
  const byId = new Map();
  const none = [];
  for (const m of members || []) {
    const ga = gaOf(m, gas);
    if (!ga) { none.push(m); continue; }
    const key = String(ga.id);
    if (!byId.has(key)) byId.set(key, { gaId: ga.id, name: ga.name || "—", members: [] });
    byId.get(key).members.push(m);
  }
  const groups = [...byId.values()].sort(byName).map(({ gaId, name, members: list }) => ({ gaId, gaName: name, members: list }));
  if (none.length) groups.push({ gaId: null, gaName: noneLabel, members: none });
  return groups;
}
