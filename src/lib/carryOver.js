// When an event is copied from a previous one, the church's leadership, the team
// members and their families are registered in the new event too (registrations
// only, never payments).
//
// Order of the submissions (PREFIX-MMDD-NNN-P, one per person, family as -2, -3…):
//   1. Local pastors: PASTOR_ORDER first (Nairon 001, Jairo 002, Dilton 003), then any other.
//   2. Ungidos.  3. Diáconos.  4. Grupo de Intercessão.
//      Blocks 1-4 come from the directory roles (and the leadership rosters) and only
//      take people whose church is in the home polo (Polo Newark in Polos e Áreas).
//   5. Every other team member.
// Inside each block people go by church (CHURCH_ORDER), then name.
//
// Pure (no Supabase): used by the new-event dialog and scripts/carry-over-regs.mjs.
import { buildRegNumber } from "./regNumber.js";
import { familyIdOf } from "./family.js";
import { regFeeFlags } from "./regFee.js";
import { CATEGORIES, DEADLINE_EXEMPT_ROLES, INTERCESSION_ROLES } from "../constants/index.js";

export const PASTOR_ORDER = ["M287", "M180", "M099"]; // Nairon Pimentel, Jairo Oliveira, Dilton Rodrigues
export const CHURCH_ORDER = ["Newark, NJ", "Philadelphia, PA", "New York, NY", "Toms River, NJ"];
export const HOME_POLO = "Newark";
export const CARRY_OVER_NOTE = "Trazido do evento anterior (Equipes)";

// Leadership blocks, in submission order. `team` is both the roster that also feeds
// the block and the team the person is registered under.
const LEADERSHIP = [
  { team: "Pastores", roles: ["Pastor"] },
  { team: "Ungidos", roles: ["Ungido"] },
  { team: "Diáconos", roles: ["Diácono"] },
  { team: null, roles: INTERCESSION_ROLES },
];
const LEADERSHIP_TEAMS = LEADERSHIP.map((b) => b.team).filter(Boolean);

// Church names (as in members.church) of one polo.
// groups: church_groups rows; links: church_group_members rows; churches: { id, display }.
export function localChurchesOf(groups, links, churches, poloName = HOME_POLO) {
  const polo = (groups || []).find((g) => g.kind === "polo" && g.name === poloName);
  if (!polo) return [];
  const ids = new Set((links || []).filter((l) => l.group_id === polo.id).map((l) => l.church_id));
  return (churches || []).filter((c) => ids.has(c.id)).map((c) => c.display);
}

const hasRole = (m, roles) => roles.includes(m.role) || (m.roles || []).some((r) => roles.includes(r));
const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
const churchRank = (m) => {
  const i = CHURCH_ORDER.indexOf(m.church);
  return i === -1 ? CHURCH_ORDER.length : i;
};
const byChurchThenName = (a, b) => churchRank(a) - churchRank(b) || byName(a, b);
// Adults first, youngest last (CATEGORIES runs youngest → oldest).
const categoryRank = (c) => {
  const i = CATEGORIES.indexOf(c);
  return i === -1 ? CATEGORIES.length : CATEGORIES.length - 1 - i;
};
const familyOrder = (a, b) => categoryRank(a.category) - categoryRank(b.category) || byName(a, b);

// sourceRosters: [{ team, memberIds }]; members / families: app (camelCase) shape.
export function buildCarryOverRegs({ sourceRosters, members, families, localChurches, event, today, byName: by = "Sistema" }) {
  const memberById = new Map((members || []).map((m) => [m.id, m]));
  const local = new Set(localChurches || []);

  // Everyone in each family, from both directions (member.familyId and family.memberIds).
  const familyMembers = new Map();
  for (const m of members || []) {
    const fid = familyIdOf(m, families);
    if (!fid) continue;
    if (!familyMembers.has(fid)) familyMembers.set(fid, new Set());
    familyMembers.get(fid).add(m.id);
  }
  for (const f of families || []) {
    for (const id of f.memberIds || []) {
      if (!memberById.has(id)) continue;
      if (!familyMembers.has(f.id)) familyMembers.set(f.id, new Set());
      familyMembers.get(f.id).add(id);
    }
  }

  // Rosters: leadership teams first (in block order), then the others by team name.
  const rosters = (sourceRosters || []).filter((r) => (r.memberIds || []).length);
  const teamRank = (team) => (LEADERSHIP_TEAMS.includes(team) ? LEADERSHIP_TEAMS.indexOf(team) : LEADERSHIP_TEAMS.length);
  rosters.sort((a, b) => teamRank(a.team) - teamRank(b.team) || a.team.localeCompare(b.team));

  // A person's team: their first roster in that order, else the leadership team of
  // their role (a deacon not on the Diáconos roster is still a deacon), else Participante.
  const rosterTeamOf = new Map();
  for (const r of rosters) for (const id of r.memberIds) if (!rosterTeamOf.has(id)) rosterTeamOf.set(id, r.team);
  const teamOf = (m) =>
    rosterTeamOf.get(m.id) || LEADERSHIP.find((b) => b.team && hasRole(m, b.roles))?.team || "Participante";

  const leads = [];
  const queued = new Set();
  const queue = (list) => list.forEach((m) => { if (!queued.has(m.id)) { queued.add(m.id); leads.push(m); } });

  for (const block of LEADERSHIP) {
    const roster = block.team ? rosters.find((r) => r.team === block.team) : null;
    const ids = new Set(roster?.memberIds || []);
    const people = (members || []).filter((m) => (ids.has(m.id) || hasRole(m, block.roles)) && local.has(m.church));
    if (block.team === "Pastores") {
      const rank = (m) => (PASTOR_ORDER.includes(m.id) ? PASTOR_ORDER.indexOf(m.id) : PASTOR_ORDER.length);
      people.sort((a, b) => rank(a) - rank(b) || byChurchThenName(a, b));
    } else {
      people.sort(byChurchThenName);
    }
    queue(people);
  }

  // Every other team member (Pastores roster members outside the polo stay out).
  const others = rosters
    .filter((r) => !LEADERSHIP_TEAMS.includes(r.team))
    .flatMap((r) => r.memberIds.map((id) => memberById.get(id)).filter(Boolean))
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
  others.sort(byChurchThenName);
  queue(others);

  const done = new Set();
  const rows = [];
  let submission = 0;
  for (const member of leads) {
    if (done.has(member.id)) continue; // already registered with someone's family
    submission++;
    const fid = familyIdOf(member, families);
    const relatives = fid
      ? [...(familyMembers.get(fid) || [])]
          .filter((id) => id !== member.id && !done.has(id))
          .map((id) => memberById.get(id))
          .filter(Boolean)
          .sort(familyOrder)
      : [];
    [member, ...relatives].forEach((m, i) => {
      done.add(m.id);
      rows.push(carryOverRow(m, { event, today, by, submission, person: i + 1, team: teamOf(m), familyId: fid }));
    });
  }
  return rows;
}

// The registration keeps the member's role, except that an intercessor who isn't on
// any team is registered under "Grupo de Intercessão", so they (and their family)
// have no payment deadline, like team members.
function regRole(m, team) {
  const role = m.role || "";
  if (team === "Participante" && !DEADLINE_EXEMPT_ROLES.includes(role) && hasRole(m, INTERCESSION_ROLES)) {
    return INTERCESSION_ROLES[0];
  }
  return role;
}

function carryOverRow(m, { event, today, by, submission, person, team, familyId }) {
  const role = regRole(m, team);
  const { fee, isExempt } = regFeeFlags(event, m.category, role);
  return {
    reg_number: buildRegNumber(event.prefix, today, submission, person),
    event_id: event.id,
    member_id: m.id,
    member_name: m.name,
    badge_name: m.badgeName || m.name,
    category: m.category,
    church: m.church || "",
    role,
    family_id: familyId || null,
    invited_by_member_id: null,
    team,
    fee,
    paid: false,
    exempt: isExempt,
    cancelled: false,
    waitlisted: false,
    waitlist_reason: null,
    excedente: false,
    needs_translation: false,
    note: CARRY_OVER_NOTE,
    badge_printed: false,
    timeline: [
      { status: "Submetido", date: today, by },
      { status: "Pendente", date: today, by: "Sistema" },
    ],
    registered_at: today,
    registered_by: by,
  };
}
