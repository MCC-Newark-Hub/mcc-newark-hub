// Trombetas e Festas: who sees which guests, input rules and every number on the tab and the panel.
// Pure (no Supabase) and imported by api/trumpet-guests.js too — relative imports only, no "@/".
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "./contact.js";
import { clerkCities, inClerkScope } from "./clerkScope.js";

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const TOP = 10;
const pctOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const byPt = (a, b) => String(a).localeCompare(String(b), "pt");

export const cityOf = (church) => String(church || "").split(",")[0].trim();

export function profileOf(user) {
  return {
    roles: user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean),
    church: user?.church || "",
    churches: user?.churches || [],
    gaIds: user?.gaIds || [],
  };
}

export const canManagePanel = (roles = []) => roles.includes("admin") || roles.includes("pastor");

// Whose guest LIST a profile may see and edit: only GA leaders, only their own GAs — never staff (spec rev. 3).
export function listGaIds(profile, gas = []) {
  if (!(profile?.roles || []).includes("ga_leader")) return [];
  const own = new Set(profile.gaIds || []);
  return gas.map((g) => g.id).filter((id) => own.has(id));
}

// Whose NUMBERS a profile may see. admin / pastor: all; clerk: GAs of their churches (clerkCities, "*" = all);
// ga_leader: their own GAs. Union across roles, in the order of `gas`.
export function summaryGaIds(profile, gas = []) {
  const roles = profile?.roles || [];
  if (canManagePanel(roles)) return gas.map((g) => g.id);
  const ids = new Set(listGaIds(profile, gas));
  if (roles.includes("clerk")) {
    const cities = clerkCities(profile);
    for (const g of gas) if (inClerkScope(cities, g.church)) ids.add(g.id);
  }
  return gas.map((g) => g.id).filter((id) => ids.has(id));
}

export function toGuest(r) {
  return {
    id: r.id,
    year: r.year,
    church: r.church,
    gaId: r.ga_id,
    name: r.name,
    phone: r.phone || "",
    email: r.email || "",
    invitedByMemberId: r.invited_by_member_id || null,
    attendedAt: r.attended_at || null,
    notes: r.notes || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function cleanGuestInput(body = {}) {
  const name = String(body.name || "").trim();
  if (!name || name.length > 120) return { error: "invalid_name" };
  const gaId = String(body.gaId || "");
  if (!ID.test(gaId)) return { error: "invalid_ga" };
  const inviter = body.invitedByMemberId ? String(body.invitedByMemberId) : "";
  if (inviter && !ID.test(inviter)) return { error: "invalid_member" };
  const phone = normalizePhone(body.phone);
  if (!phone || !isValidPhone(phone)) return { error: "invalid_phone" };
  const email = normalizeEmail(body.email);
  if (email && !isValidEmail(email)) return { error: "invalid_email" };
  const notes = String(body.notes || "").trim().slice(0, 500);
  return { fields: { ga_id: gaId, name, phone, email: email || null, invited_by_member_id: inviter || null, notes: notes || null } };
}

export function sumTotals(guests = []) {
  const invited = guests.length;
  const attended = guests.filter((g) => g.attendedAt).length;
  return { invited, attended, pct: pctOf(attended, invited) };
}

export function totalsByGa(guests = [], gas = []) {
  return gas
    .map((g) => ({ gaId: g.id, name: g.name, ...sumTotals(guests.filter((x) => x.gaId === g.id)) }))
    .sort((a, b) => byPt(a.name, b.name));
}

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function guestsCsv(guests = [], { gas = [], members = [], labels }) {
  const gaName = Object.fromEntries(gas.map((g) => [g.id, g.name]));
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const head = [labels.name, labels.phone, labels.email, labels.invitedBy, labels.ga, labels.attended];
  const lines = guests.map((g) => [g.name, g.phone, g.email, memberName[g.invitedByMemberId] || "", gaName[g.gaId] || g.gaId, g.attendedAt ? labels.yes : labels.no]);
  return [head, ...lines].map((cols) => cols.map(q).join(",")).join("\n");
}

export const dayOf = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function lastDays(today, days) {
  const end = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10));
}

function rank(rows, keyOf, labelOf) {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const e = m.get(k) || { invited: 0, attended: 0 };
    e.invited += 1;
    if (r.attended_at) e.attended += 1;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([k, e]) => ({ k, label: labelOf(k), ...e }))
    .sort((a, b) => b.invited - a.invited || byPt(a.label, b.label));
}

export function buildStats(rows = [], { year, gas = [], members = [], goals = [], today, days = 60 }) {
  const cur = rows.filter((r) => r.year === year);
  const prev = rows.filter((r) => r.year === year - 1);
  const attended = cur.filter((r) => r.attended_at).length;
  const goalOf = (church) => goals.find((g) => g.church === church)?.goal ?? null;
  const gaName = Object.fromEntries(gas.map((g) => [g.id, g.name]));
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const counts = {};
  for (const r of cur) {
    const d = dayOf(r.created_at);
    counts[d] = (counts[d] || 0) + 1;
  }
  return {
    year,
    invited: cur.length,
    attended,
    pct: pctOf(attended, cur.length),
    goal: goalOf(""),
    prev: { invited: prev.length, attended: prev.filter((r) => r.attended_at).length },
    byChurch: rank(cur, (r) => r.church, (k) => k).map((e) => ({ church: e.k, invited: e.invited, attended: e.attended, goal: goalOf(e.k) })),
    topGas: rank(cur, (r) => r.ga_id, (k) => gaName[k] || k).slice(0, TOP).map((e) => ({ gaId: e.k, name: e.label, invited: e.invited, attended: e.attended })),
    topInviters: rank(cur, (r) => r.invited_by_member_id, (k) => memberName[k] || k).slice(0, TOP).map((e) => ({ memberId: e.k, name: e.label, invited: e.invited, attended: e.attended })),
    perDay: lastDays(today, days).map((date) => ({ date, count: counts[date] || 0 })),
  };
}

const counts = (rows) => {
  const attended = rows.filter((r) => r.attended_at).length;
  return { invited: rows.length, attended, pct: pctOf(attended, rows.length) };
};
const byInvited = (a, b) => b.invited - a.invited || byPt(a.name ?? a.church, b.name ?? b.church);

// Numbers only, for the drill-down church → GA → member (spec rev. 3). `rows` are the year's guest rows in scope
// (church, ga_id, invited_by_member_id, attended_at); `gas` are the GAs in scope, so a GA with no guest shows zeros.
export function buildSummary(rows = [], { gas = [], members = [], goals = [] }) {
  const goalOf = (church) => goals.find((g) => g.church === church)?.goal ?? null;
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const churchNames = [...new Set([...gas.map((g) => g.church), ...rows.map((r) => r.church)])];
  const churches = churchNames.map((church) => {
    const inChurch = rows.filter((r) => r.church === church);
    const gaIds = [...new Set([...gas.filter((g) => g.church === church).map((g) => g.id), ...inChurch.map((r) => r.ga_id)])];
    const gaList = gaIds.map((gaId) => {
      const inGa = inChurch.filter((r) => r.ga_id === gaId);
      const inviters = [...new Set(inGa.map((r) => r.invited_by_member_id).filter(Boolean))];
      return {
        gaId,
        name: gas.find((g) => g.id === gaId)?.name || gaId,
        ...counts(inGa),
        members: inviters
          .map((memberId) => ({ memberId, name: memberName[memberId] || memberId, ...counts(inGa.filter((r) => r.invited_by_member_id === memberId)) }))
          .sort(byInvited),
      };
    }).sort(byInvited);
    return { church, ...counts(inChurch), goal: goalOf(church), gas: gaList };
  }).sort(byInvited);
  return { ...counts(rows), goal: goalOf(""), churches };
}
