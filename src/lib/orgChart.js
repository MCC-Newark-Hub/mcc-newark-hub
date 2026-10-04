// Organograma: built on the fly from the directory — nothing about it is stored.
// Place hierarchy: Área > Polo > Igreja (polos are church_groups of kind "polo").
// Function hierarchy inside a church: Pastor > Ungido > Diácono > Obreiro, then every other function.
import { ROLE_OPTIONS } from "@/constants";
import { joinList } from "@/lib/churchGroups";

// Top to bottom. Anyone holding one of these is part of the ministry hierarchy.
export const MINISTRY_LEVELS = ["Pastor", "Ungido", "Diácono", "Obreiro"];

const byPt = (a, b) => String(a).localeCompare(String(b), "pt");

// Display order of the polos; any polo not listed comes after these, alphabetically.
export const POLO_ORDER = ["Newark", "Texas", "Costa Oeste"];
const poloRank = (name) => { const i = POLO_ORDER.indexOf(name); return i < 0 ? POLO_ORDER.length : i; };
const byPolo = (a, b) => poloRank(a.name) - poloRank(b.name) || byPt(a.name, b.name);

// "Área Newark, Texas e Costa Oeste" from the polos that exist (so it follows the directory).
export function areaTitle(poloNames, lang = "pt") {
  if (!poloNames.length) return lang === "en" ? "Area" : "Área";
  return `${lang === "en" ? "Area" : "Área"} ${joinList(poloNames, lang)}`;
}

// Function order for a church: the ministry levels first, then the rest in the registration order.
export function orderedRoles(roles, scope = "ministry") {
  const present = new Set(roles);
  const ministry = MINISTRY_LEVELS.filter((r) => present.has(r));
  if (scope === "ministry") return ministry;
  const others = ROLE_OPTIONS.filter((r) => r && !MINISTRY_LEVELS.includes(r) && present.has(r));
  const unknown = [...present].filter((r) => r && !MINISTRY_LEVELS.includes(r) && !ROLE_OPTIONS.includes(r)).sort(byPt);
  return [...ministry, ...others, ...unknown];
}

// People of one church grouped by function. A person with two functions shows under both.
export function peopleByRole(people, scope = "ministry") {
  const map = new Map();
  for (const p of people) for (const r of p.roles || []) {
    if (!map.has(r)) map.set(r, []);
    map.get(r).push(p);
  }
  return orderedRoles([...map.keys()], scope).map((role) => ({
    role,
    people: map.get(role).sort((a, b) => byPt(a.name, b.name)),
  }));
}

// The ministry levels are a promotion path (Obreiro > Diácono > Ungido > Pastor), so a person holds only the
// highest one; their other functions (GI, GL, instrumentista…) are independent and kept as they are.
export function effectiveRoles(roles) {
  const top = MINISTRY_LEVELS.find((r) => (roles || []).includes(r));
  return [...(top ? [top] : []), ...(roles || []).filter((r) => r && !MINISTRY_LEVELS.includes(r))];
}

export const AREA_REF = "main"; // the single Área node: scope "area", ref "main"

// "Pr. Nairon Pimentel": a linked member is shown by their current name (and "Pr." when they are a Pastor);
// a typed name (someone not registered yet) is shown as typed.
export function responsibleName(resp, memberById) {
  const m = resp.member_id ? memberById.get(resp.member_id) : null;
  if (!m) return resp.name;
  return `${(m.roles || []).includes("Pastor") ? "Pr. " : ""}${m.name}`;
}

// Responsibles of one node, "responsável" first and then "co-responsável".
export function responsiblesOf(rows, scope, ref, memberById) {
  return rows
    .filter((x) => x.scope === scope && String(x.ref) === String(ref))
    .map((x) => ({ id: x.id, kind: x.kind, memberId: x.member_id || null, name: responsibleName(x, memberById) }))
    .sort((a, b) => (a.kind === b.kind ? byPt(a.name, b.name) : a.kind === "responsavel" ? -1 : 1));
}

// groups: church_groups rows; links: church_group_members rows; churches: directory rows ({ id, display });
// members: mapped members ({ name, church, roles }). Returns the whole tree.
export function buildOrgChart({ groups = [], links = [], churches = [], members = [], responsibles = [], scope = "ministry", lang = "pt" }) {
  const wanted = (r) => (scope === "ministry" ? MINISTRY_LEVELS.includes(r) : !!r);
  const peopleOf = new Map(); // church display -> [{ name, roles }]
  for (const m of members) {
    if (!m.church) continue;
    const roles = effectiveRoles(m.roles).filter(wanted);
    if (!roles.length) continue;
    if (!peopleOf.has(m.church)) peopleOf.set(m.church, []);
    peopleOf.get(m.church).push({ id: m.id, name: m.name, roles });
  }

  const churchById = new Map(churches.filter((c) => c.id).map((c) => [c.id, c]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const makeChurch = (c) => {
    const people = peopleOf.get(c.display) || [];
    return { id: c.id, display: c.display, people: people.length, byRole: peopleByRole(people, scope), responsibles: responsiblesOf(responsibles, "church", c.id, memberById) };
  };

  const polos = groups.filter((g) => g.kind === "polo").sort(byPolo);
  const poloNodes = polos.map((g) => {
    const list = links
      .filter((l) => l.group_id === g.id)
      .map((l) => churchById.get(l.church_id))
      .filter(Boolean)
      .sort((a, b) => byPt(a.display, b.display))
      .map(makeChurch);
    return { id: g.id, name: g.name, churches: list, people: list.reduce((n, c) => n + c.people, 0), responsibles: responsiblesOf(responsibles, "polo", g.id, memberById) };
  });

  // Only the churches of the polos are part of the chart: anyone elsewhere (Atlanta, Ottawa…) is left out.
  return {
    title: areaTitle(polos.map((g) => g.name), lang),
    responsibles: responsiblesOf(responsibles, "area", AREA_REF, memberById),
    polos: poloNodes,
    totalPeople: poloNodes.reduce((n, p) => n + p.people, 0),
  };
}

// Totals per function across the whole tree: [{ role, count }] in hierarchy order.
export function roleTotals(chart) {
  const counts = new Map();
  const add = (c) => c.byRole.forEach((r) => counts.set(r.role, (counts.get(r.role) || 0) + r.people.length));
  chart.polos.forEach((p) => p.churches.forEach(add));
  return orderedRoles([...counts.keys()], "all").map((role) => ({ role, count: counts.get(role) }));
}
