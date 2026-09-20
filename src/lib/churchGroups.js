// Polos, áreas and regiões: named groups of churches, managed in Diretório > Polos e Áreas.
export const GROUP_KINDS = [
  { id: "polo",   pt: "Polo",   en: "Hub",    ptPlural: "Polos",   enPlural: "Hubs" },
  { id: "area",   pt: "Área",   en: "Area",   ptPlural: "Áreas",   enPlural: "Areas" },
  { id: "regiao", pt: "Região", en: "Region", ptPlural: "Regiões", enPlural: "Regions" },
];

export function kindLabel(kind, lang = "pt", plural = false) {
  const k = GROUP_KINDS.find((x) => x.id === kind) || GROUP_KINDS[0];
  if (lang === "en") return plural ? k.enPlural : k.en;
  return plural ? k.ptPlural : k.pt;
}

// "A", "A e B", "A, B e C"
export function joinList(items, lang = "pt") {
  const and = lang === "en" ? "and" : "e";
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

// Which churches a period is open to: null = every church, otherwise a sorted list of directory names.
// `memberships` are { group_id, church_id } rows and `churches` the directory ({ id, display }).
export function resolveScopeChurches(period, memberships, churches) {
  if (!period) return null;
  if (period.scope_kind === "churches") {
    const list = period.scope_churches || [];
    return list.length ? [...list].sort((a, b) => a.localeCompare(b, "pt")) : null;
  }
  if (period.scope_kind === "groups") {
    const ids = new Set(period.scope_group_ids || []);
    if (ids.size === 0) return null;
    const churchIds = new Set((memberships || []).filter((m) => ids.has(m.group_id)).map((m) => m.church_id));
    const byId = new Map((churches || []).filter((c) => c.id).map((c) => [c.id, c.display]));
    return [...churchIds].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt"));
  }
  return null;
}

// "Polo Newark" / "Polos Newark e Texas" / "Igrejas: Provo, UT e Las Vegas, NV"; "" when open to everyone.
export function scopeLabel(period, groups, lang = "pt") {
  if (!period) return "";
  const pt = lang !== "en";
  if (period.scope_kind === "groups") {
    const chosen = (groups || []).filter((g) => (period.scope_group_ids || []).includes(g.id));
    if (!chosen.length) return "";
    const kinds = [...new Set(chosen.map((g) => g.kind))];
    if (chosen.length === 1) return `${kindLabel(chosen[0].kind, lang)} ${chosen[0].name}`;
    const names = joinList(chosen.map((g) => g.name), lang);
    return kinds.length === 1 ? `${kindLabel(kinds[0], lang, true)} ${names}` : names;
  }
  if (period.scope_kind === "churches") {
    const list = period.scope_churches || [];
    if (!list.length) return "";
    return `${list.length === 1 ? (pt ? "Igreja" : "Church") : (pt ? "Igrejas" : "Churches")}: ${joinList(list, lang)}`;
  }
  return "";
}

// Label for a list's tab: its own name, else what it is scoped to, else its code.
export function periodTabLabel(period, groups, lang = "pt") {
  return (period.list_name || "").trim() || scopeLabel(period, groups, lang) || period.id;
}
