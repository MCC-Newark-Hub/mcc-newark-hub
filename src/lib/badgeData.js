// What a badge shows, read from the live data instead of the copy saved on the registration.
// A registration keeps the member's name, church, category and team as they were on the day of registering; the
// directory (members) and the event's team rosters are the truth, so any change there shows on the badge right away.
// Without the member (not loaded, or deleted) the registration's own values are kept.

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const NO_TEAM = "Participante";

// The team of a member in an event, from the rosters. In more than one team: the registration's team if it is one of
// them, otherwise the first in the teams' order. In no team: "Participante".
export function rosterTeamOf(memberId, eventId, rosters, teams, fallback) {
  const names = (rosters || [])
    .filter((ro) => sameId(ro.eventId, eventId) && ro.team && ro.team !== NO_TEAM && (ro.memberIds || []).some((id) => sameId(id, memberId)))
    .map((ro) => ro.team);
  if (names.length === 0) return NO_TEAM;
  if (fallback && names.includes(fallback)) return fallback;
  const order = (name) => {
    const t = (teams || []).find((x) => x.name === name);
    return t ? t.sortOrder ?? 0 : Number.MAX_SAFE_INTEGER;
  };
  return [...names].sort((a, b) => order(a) - order(b) || a.localeCompare(b, "pt"))[0];
}

// The registration with name, badge name, church, category, role and team taken from the directory and the rosters.
export function liveBadgeReg(reg, { members, rosters, teams } = {}) {
  if (!reg) return reg;
  const m = (members || []).find((x) => sameId(x.id, reg.memberId));
  if (!m) return reg;
  const customBadge = reg.badgeName && reg.badgeName !== reg.memberName ? reg.badgeName : "";
  const out = {
    ...reg,
    memberName: m.name || reg.memberName,
    badgeName: m.badgeName || customBadge || m.name || reg.badgeName,
    church: m.church || reg.church,
    category: m.category || reg.category,
    role: m.role ?? reg.role,
  };
  // Rosters only load for signed-in staff and public pages alike through useAppData; with none loaded keep the saved team.
  if (rosters && rosters.length) out.team = rosterTeamOf(reg.memberId, reg.eventId, rosters, teams, reg.team);
  return out;
}

export const liveBadgeRegs = (regs, data) => (regs || []).map((r) => liveBadgeReg(r, data));
