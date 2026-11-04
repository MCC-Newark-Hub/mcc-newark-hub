// Frequência de Culto (church part): pure rules for the service census — counts, totals, the service day the public
// link may write, the period summary and the CSV. Nothing here talks to the database (see censusData.js).
import { serviceTypesFor } from "@/lib/praiseLists";

export const COUNT_FIELDS = ["members_cia", "members_adult", "visitors_cia", "visitors_adult"];
export const MAX_COUNT = 5000;

// Whatever was typed becomes a whole number from 0 to 5000 ("12abc" -> 12, "-3" -> 0, "" -> 0).
export function cleanCount(v) {
  const n = parseInt(String(v ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_COUNT, n);
}

export const cleanCounts = (obj = {}) => Object.fromEntries(COUNT_FIELDS.map((k) => [k, cleanCount(obj[k])]));

export function censusTotals(row = {}) {
  const c = cleanCounts(row);
  const members = c.members_cia + c.members_adult;
  const visitors = c.visitors_cia + c.visitors_adult;
  return { members, visitors, overall: members + visitors };
}

// Calendar date in New York — the server checks the public save against it (census_save, migration 045).
export function nyDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// The public link writes only the service day: today in New York, or yesterday, so a late service further west saved
// after midnight Eastern still lands on its own day. Mirrors census_save.
export function publicDateAllowed(date, now = new Date()) {
  if (!date) return false;
  return date === nyDate(now) || date === nyDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Which service day the public page records, from the device clock. Until 4am the night service that just ended is
// still being counted, so yesterday comes first (and is picked); later in the day only today. Both are inside the
// server's window (census_save: New York today or yesterday) for the churches of the US and Canada.
export const LATE_SERVICE_UNTIL_HOUR = 4;
export function serviceDateOptions(now = new Date()) {
  const today = localDate(now);
  if (now.getHours() >= LATE_SERVICE_UNTIL_HOUR) return { options: [today], initial: today };
  const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  return { options: [yesterday, today], initial: yesterday };
}

// Staff period filter: from the first day of this month ("month"), or of 3 / 12 months counting this one, through today.
export function periodRange(kind, today) {
  const [y, m] = today.split("-").map(Number);
  const back = kind === "12m" ? 11 : kind === "3m" ? 2 : 0;
  const d = new Date(y, m - 1 - back, 1);
  return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: today };
}

// Same services as the Profético: Sunday has EBD (morning) and Noite, every other day only Noite.
export const censusTypesFor = (date) => serviceTypesFor(date);

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

export function summarizeCensus(rows = []) {
  if (!rows.length) return { services: 0, byType: {}, avgOverall: 0, visitorShare: 0, ciaShare: 0, highest: null, lowest: null };
  const byType = {};
  let overall = 0, visitors = 0, cia = 0, highest = null, lowest = null, hiN = -1, loN = Infinity;
  for (const r of rows) {
    const t = censusTotals(r);
    const c = cleanCounts(r);
    overall += t.overall;
    visitors += t.visitors;
    cia += c.members_cia + c.visitors_cia;
    const bt = (byType[r.service_type] ||= { services: 0, sum: 0 });
    bt.services += 1;
    bt.sum += t.overall;
    if (t.overall > hiN) { hiN = t.overall; highest = r; }
    if (t.overall < loN) { loN = t.overall; lowest = r; }
  }
  return {
    services: rows.length,
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { services: v.services, avgOverall: Math.round(v.sum / v.services) }])),
    avgOverall: Math.round(overall / rows.length),
    visitorShare: pct(visitors, overall),
    ciaShare: pct(cia, overall),
    highest,
    lowest,
  };
}

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function censusCsv(rows, labels) {
  const head = [labels.date, labels.church, labels.type, labels.membersCia, labels.membersAdult, labels.members,
    labels.visitorsCia, labels.visitorsAdult, labels.visitors, labels.overall, labels.notes, labels.by];
  const lines = rows.map((r) => {
    const c = cleanCounts(r);
    const t = censusTotals(r);
    return [r.service_date, r.church, labels.types[r.service_type] || r.service_type, c.members_cia, c.members_adult, t.members,
      c.visitors_cia, c.visitors_adult, t.visitors, t.overall, r.notes || "", r.entered_by_name || ""];
  });
  return [head, ...lines].map((cols) => cols.map(q).join(",")).join("\n");
}
