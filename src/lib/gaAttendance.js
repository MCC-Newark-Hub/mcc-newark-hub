// Chamada do GA: pure rules — who may mark which group and date, the roster of an attendance, cleaning what was typed,
// and the follow-up of who has not been coming (to care for them, never to accuse). No database here (see
// gaAttendanceData.js).
import { serviceTypesFor } from "@/lib/praiseLists";
import { rolesOf } from "@/lib/sectionAccess";
import { serviceDateOptions } from "@/lib/census";

export const ATTENDANCE_DAYS_BACK = 14;
export const RECENT_COUNT = 8;
export const CARE_AFTER = 3;
export const HISTORY_WEEKS = 26;
export const MAX_VISITORS = 50;
export const MAX_VISITOR_NAME = 120;

const pad = (n) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { numeric: true });
const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export function addDays(date, n) {
  const [y, m, d] = String(date).split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

const dayNumber = (date) => {
  const [y, m, d] = String(date).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

// Today back to 14 days ago (forgot on Sunday, marks on Tuesday); never the future. Admins correct any past date.
export function attendanceDateAllowed(date, today, { isAdmin = false } = {}) {
  if (!DATE_RE.test(String(date || "")) || date > today) return false;
  return isAdmin || date >= addDays(today, -ATTENDANCE_DAYS_BACK);
}

// Same services as the Frequência: Sunday has EBD and Noite, every other day only Noite.
export const attendanceTypesFor = (date) => serviceTypesFor(date);

// From 2pm on a Sunday the EBD is over, so the attendance opens on the Noite.
export const NOITE_FROM_HOUR = 14;

// What the tab opens on: the service day as in the Frequência (until 4am, last night's) and, on a Sunday, the EBD in
// the morning and the Noite from the afternoon on.
export function defaultAttendance(now = new Date()) {
  const { initial: date } = serviceDateOptions(now);
  const types = attendanceTypesFor(date);
  const sameDayMorning = date === localDate(now) && now.getHours() < NOITE_FROM_HOUR;
  return { date, type: types.length > 1 && sameDayMorning ? types[0] : "noite" };
}

const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The calendar day of a timestamp where the leader is (a Sunday-night save is still Sunday, not Monday in UTC).
export function localDay(ts) {
  const d = new Date(ts || "");
  return Number.isNaN(d.getTime()) ? "" : localDate(d);
}

export const isAttendanceAdmin = (user) => rolesOf(user).includes("admin");

// Admin: every group. Anyone else: only the groups linked to their account (app_users.ga_ids).
export function gasInScope(user, gas = []) {
  const list = isAttendanceAdmin(user) ? gas : gas.filter((g) => (user?.gaIds || []).includes(g.id));
  return [...list].sort(byName);
}

export const rosterFor = (gaId, members = []) => members.filter((m) => m.gaId === gaId).sort(byName);

// Who an attendance lists: its saved roster (people who have left the group since stay on it) plus whoever is in the
// group now (unmarked). Saved ids no longer in the directory come back with name null.
export function shownRoster(row, roster = [], members = []) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const current = roster.map((m) => ({ id: m.id, name: m.name }));
  const ids = new Set(current.map((m) => m.id));
  const extra = (row?.roster_ids || []).filter((id) => !ids.has(id)).map((id) => ({ id, name: byId.get(id)?.name ?? null }));
  const named = [...current, ...extra.filter((m) => m.name)].sort(byName);
  return [...named, ...extra.filter((m) => !m.name)];
}

export function cleanVisitors(list = []) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const name = String(raw ?? "").trim().slice(0, MAX_VISITOR_NAME);
    const key = fold(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_VISITORS) break;
  }
  return out;
}

export function cleanPresent(presentIds = [], rosterIds = []) {
  const roster = new Set(rosterIds);
  return [...new Set(presentIds)].filter((id) => roster.has(id));
}

// Newest first; on a Sunday the Noite comes after the EBD, so it is the newer one.
const TYPE_ORDER = { noite: 0, outro: 1, ebd: 2 };
const newestFirst = (a, b) => b.service_date.localeCompare(a.service_date) || (TYPE_ORDER[a.service_type] ?? 9) - (TYPE_ORDER[b.service_type] ?? 9);

// For each member of the group: last presence, days since, the group's last 8 attendances ("present" / "absent" /
// "none" = not in the group that day) and whether to reach out first (absent from the last 3 attendances they were
// on). Order: reach out first, then longest since last presence (never present = longest), then name.
export function followUp(attendances = [], roster = [], today) {
  const sorted = [...attendances].sort(newestFirst);
  const rows = roster.map((member) => {
    const mark = (a) => (!(a.roster_ids || []).includes(member.id) ? "none" : (a.present_ids || []).includes(member.id) ? "present" : "absent");
    const marks = sorted.map(mark);
    const own = marks.filter((x) => x !== "none");
    const lastIdx = marks.indexOf("present");
    const lastPresent = lastIdx === -1 ? null : sorted[lastIdx].service_date;
    return {
      member,
      lastPresent,
      since: lastPresent ? dayNumber(today) - dayNumber(lastPresent) : null,
      recent: marks.slice(0, RECENT_COUNT),
      needsCare: own.length >= CARE_AFTER && own.slice(0, CARE_AFTER).every((x) => x === "absent"),
    };
  });
  const far = (r) => (r.since === null ? Infinity : r.since);
  const farther = (a, b) => (far(a) === far(b) ? 0 : far(b) - far(a)); // two "never present" are equal, not NaN
  return rows.sort((a, b) => (b.needsCare - a.needsCare) || farther(a, b) || byName(a.member, b.member));
}

export function sinceLabel(days, tt) {
  if (days === null || days === undefined) return tt.gaNeverPresent;
  if (days <= 0) return tt.gaToday;
  if (days === 1) return tt.gaOneDay;
  if (days < 14) return fill(tt.gaDaysAgo, { n: days });
  if (days < 60) return fill(tt.gaWeeksAgo, { n: Math.floor(days / 7) });
  const months = Math.floor(days / 30);
  return months === 1 ? tt.gaOneMonth : fill(tt.gaMonthsAgo, { n: months });
}
