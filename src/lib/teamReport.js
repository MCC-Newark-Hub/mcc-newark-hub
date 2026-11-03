// Eventos › Relatórios › Equipes: every team of the event with its leader and members,
// and where each member stands — registered, on the waitlist or not registered — and
// whether they have checked in.

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// teamOrder: team names in display order (the Teams table's sort order); teams not in it
// go after, by name.
export function buildTeamReport({ rosters = [], regs = [], members = [], eventId, teamOrder = [] }) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  // A member's registration in the event: the active one, else the waitlisted one.
  const regByMember = new Map();
  for (const r of regs) {
    if (r.eventId !== eventId || r.cancelled || !r.memberId) continue;
    const prev = regByMember.get(r.memberId);
    if (!prev || (prev.waitlisted && !r.waitlisted)) regByMember.set(r.memberId, r);
  }
  const rank = (team) => {
    const i = teamOrder.indexOf(team);
    return i === -1 ? teamOrder.length : i;
  };

  const teams = rosters
    .filter((ro) => ro.eventId === eventId && (ro.memberIds || []).length > 0)
    .sort((a, b) => rank(a.team) - rank(b.team) || norm(a.team).localeCompare(norm(b.team)))
    .map((ro) => {
      const rows = [...new Set(ro.memberIds)]
        .map((id) => {
          const m = memberById.get(id) || {};
          const reg = regByMember.get(id);
          return {
            memberId: id,
            name: m.name || reg?.memberName || id,
            badgeName: m.badgeName || "",
            category: reg?.category || m.category || "",
            church: m.church || reg?.church || "",
            regNumber: reg?.regNumber || "",
            status: !reg ? "none" : reg.waitlisted ? "waitlist" : "registered",
            checkedIn: !!reg && !reg.waitlisted && (reg.presence === "present" || !!reg.checkedInAt),
            leader: id === ro.leaderId,
          };
        })
        // Leader first, then by name.
        .sort((a, b) => Number(b.leader) - Number(a.leader) || norm(a.name).localeCompare(norm(b.name)));
      const leader = ro.leaderId ? memberById.get(ro.leaderId) : null;
      return {
        team: ro.team,
        leaderId: ro.leaderId || null,
        leaderName: leader?.name || "",
        rows,
        totals: totalsOf(rows),
      };
    });

  return { teams, totals: totalsOf(teams.flatMap((t) => t.rows)) };
}

function totalsOf(rows) {
  return {
    members: rows.length,
    registered: rows.filter((r) => r.status === "registered").length,
    waitlist: rows.filter((r) => r.status === "waitlist").length,
    none: rows.filter((r) => r.status === "none").length,
    checkedIn: rows.filter((r) => r.checkedIn).length,
  };
}
