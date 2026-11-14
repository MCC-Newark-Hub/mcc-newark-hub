// Members of a Pólo (hub) church should belong to an assistance group. It is not required — a member can be saved
// without one after a confirmation — but the lists flag who is still missing it.

// Church names come as "Newark, NJ" or with a country suffix ("Newark, NJ - EUA"); compare without it.
const plain = (s) => String(s || "").replace(/\s*[-–]\s*(EUA|USA|CAN|BRA)$/i, "").trim().toLowerCase();

export function isHubChurch(church, churches) {
  if (!church) return false;
  const key = plain(church);
  return !!(churches || []).find((c) => plain(c.display) === key)?.is_hub;
}

export function missingHubGroup(member, churches) {
  return !!member && !member.gaId && isHubChurch(member.church, churches);
}
