// Team leaders see their own team rosters. The Secretaria leader also sees everyone in their
// church (user.church): members and where each one stands with the event's registration.
export const CHURCH_WIDE_TEAMS = ["Secretaria"];

// The church a team leader sees in full, or null when they only see their rosters.
export function churchWideScope(user) {
  if (!user?.church) return null;
  return (user.teamLeads || []).some((t) => CHURCH_WIDE_TEAMS.includes(t)) ? user.church : null;
}

// Members of `church`, by name.
export function churchMembers(members, church) {
  if (!church) return [];
  return (members || [])
    .filter((m) => m.church === church)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { sensitivity: "base" }));
}
