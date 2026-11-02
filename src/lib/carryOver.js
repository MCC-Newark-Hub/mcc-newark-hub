// When an event is copied from a previous one, the team members and their families
// are registered in the new event too (registrations only, never payments).
// Pastores is the exception: only the local pastors come, i.e. those whose church
// belongs to the home polo (Polo Newark in Polos e Áreas).
//
// Numbering: the pastors in PASTOR_ORDER always take the first submissions
// (Nairon 001, Jairo 002, Dilton 003), each followed by their family; then any other
// local pastor, then every other team. One submission per team member, family members
// as the following persons (PREFIX-MMDD-NNN-P).
//
// Pure (no Supabase): used by the new-event dialog and scripts/carry-over-regs.mjs.
import { buildRegNumber } from "./regNumber.js";
import { familyIdOf } from "./family.js";
import { regFeeFlags } from "./regFee.js";
import { CATEGORIES } from "../constants/index.js";

export const PASTOR_ORDER = ["M287", "M180", "M099"]; // Nairon Pimentel, Jairo Oliveira, Dilton Rodrigues
export const HOME_POLO = "Newark";
export const CARRY_OVER_NOTE = "Trazido do evento anterior (Equipes)";
const PASTORS_TEAM = "Pastores";

// Church names (as in members.church) of one polo.
// groups: church_groups rows; links: church_group_members rows; churches: { id, display }.
export function localChurchesOf(groups, links, churches, poloName = HOME_POLO) {
  const polo = (groups || []).find((g) => g.kind === "polo" && g.name === poloName);
  if (!polo) return [];
  const ids = new Set((links || []).filter((l) => l.group_id === polo.id).map((l) => l.church_id));
  return (churches || []).filter((c) => ids.has(c.id)).map((c) => c.display);
}

const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
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

  // Team members in submission order: local pastors first, then the other teams.
  const rosters = (sourceRosters || []).filter((r) => (r.memberIds || []).length);
  const pastorsRoster = rosters.find((r) => r.team === PASTORS_TEAM);
  const otherRosters = rosters.filter((r) => r.team !== PASTORS_TEAM).sort((a, b) => a.team.localeCompare(b.team));

  const leads = []; // [{ member, team }]
  if (pastorsRoster) {
    const pastors = pastorsRoster.memberIds
      .map((id) => memberById.get(id))
      .filter((m) => m && local.has(m.church));
    const rank = (m) => (PASTOR_ORDER.includes(m.id) ? PASTOR_ORDER.indexOf(m.id) : PASTOR_ORDER.length);
    pastors.sort((a, b) => rank(a) - rank(b) || byName(a, b));
    for (const m of pastors) leads.push({ member: m, team: PASTORS_TEAM });
  }
  for (const r of otherRosters) {
    const ms = r.memberIds.map((id) => memberById.get(id)).filter(Boolean).sort(byName);
    for (const m of ms) leads.push({ member: m, team: r.team });
  }

  // A person on several teams keeps the first one in that order.
  const teamOf = new Map();
  for (const { member, team } of leads) if (!teamOf.has(member.id)) teamOf.set(member.id, team);

  const done = new Set();
  const rows = [];
  let submission = 0;
  for (const { member } of leads) {
    if (done.has(member.id)) continue; // already registered (another team or someone's family)
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
      rows.push(carryOverRow(m, { event, today, by, submission, person: i + 1, team: teamOf.get(m.id) || "Participante", familyId: fid }));
    });
  }
  return rows;
}

function carryOverRow(m, { event, today, by, submission, person, team, familyId }) {
  const { fee, isExempt } = regFeeFlags(event, m.category, m.role);
  return {
    reg_number: buildRegNumber(event.prefix, today, submission, person),
    event_id: event.id,
    member_id: m.id,
    member_name: m.name,
    badge_name: m.badgeName || m.name,
    category: m.category,
    church: m.church || "",
    role: m.role || "",
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
