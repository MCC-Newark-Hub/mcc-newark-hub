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
