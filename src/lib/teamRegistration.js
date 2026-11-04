// A team leader registers the members of their own teams, never their families: each member
// then adds their family from the public form or the lookup page.
import { pauseModeOf, PAUSE_WAITLIST, PAUSED_WAITLIST_REASON } from "@/lib/pause";

export const TEAM_LEADER_REG_NOTE = "Inscrito pelo líder da equipe";

// Members of `team` the leader can register: on the roster, with no registration in this event
// (active or waitlisted). Someone whose registration was cancelled goes through reactivation instead.
export function registrableTeamMembers({ rosters, regs, members, eventId, team }) {
  const roster = (rosters || []).find((r) => r.eventId === eventId && r.team === team);
  if (!roster) return [];
  const taken = new Set((regs || []).filter((r) => r.eventId === eventId).map((r) => r.memberId));
  return (roster.memberIds || [])
    .filter((mid) => !taken.has(mid))
    .map((mid) => (members || []).find((m) => m.id === mid))
    .filter(Boolean)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { sensitivity: "base" }));
}

// What a leader's registration does right now: { blocked } when it can't happen (registrations closed,
// or paused completely), otherwise the addReg flags (paused with the waitlist → straight to the waitlist).
// A full event is handled by addReg itself.
export function teamRegistrationMode(event) {
  if (!event) return { blocked: "no_event" };
  if (event.registrations_locked) return { blocked: "locked" };
  if (event.registration_paused) {
    if (pauseModeOf(event) !== PAUSE_WAITLIST) return { blocked: "paused" };
    return { blocked: null, forceWaitlist: true, waitlistReason: PAUSED_WAITLIST_REASON };
  }
  return { blocked: null };
}

// The addReg payload for one team member (no family: the member registers their own).
export function teamMemberReg(member, team, mode = {}) {
  return {
    memberId: member.id,
    memberName: member.name,
    badgeName: member.badgeName || member.name,
    category: member.category,
    church: member.church || "",
    role: member.role || "",
    familyId: null,
    team,
    paid: false,
    exempt: false,
    note: `${TEAM_LEADER_REG_NOTE} (${team})`,
    forceWaitlist: mode.forceWaitlist || undefined,
    waitlistReason: mode.waitlistReason,
  };
}
