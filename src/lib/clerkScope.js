// Which churches a Secretaria (clerk) works with. app_users.churches holds city names
// ("Newark", "Philadelphia"); "*" means every church, inside or outside the Pólo — for the
// main secretary. Empty: only the clerk's own church (user.church).
export const ALL_CHURCHES = "*";

const cityOf = (s) => String(s || "").split(",")[0].trim().toLowerCase();

// null = every church; otherwise the lower-case cities in scope.
export function clerkCities(user) {
  const list = user?.churches || [];
  if (list.includes(ALL_CHURCHES)) return null;
  const cities = list.map(cityOf).filter(Boolean);
  const own = cityOf(user?.church);
  if (own && !cities.includes(own)) cities.push(own);
  return cities;
}

export const inClerkScope = (cities, church) => !cities || cities.includes(cityOf(church));

// Which registrations the Secretaria's Inscrições shows. It opens on their own scope ("mine");
// they can widen it to every church ("all") or pick some ("pick", with church names).
export function regChurchFilter(mode, picked, cities) {
  if (mode === "all") return () => true;
  if (mode === "pick") {
    const set = new Set(picked || []);
    return (church) => set.has(church || "");
  }
  return (church) => inClerkScope(cities, church);
}
