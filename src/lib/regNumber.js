// Registration numbers: PREFIX-MMDD-NNN-P
//   PREFIX  the event's prefix, which carries place, year and month (PA202612)
//   MMDD    the day the registration was made
//   NNN     the submission number, counted per event (one family = one submission)
//   P       the person inside that submission (1, 2, 3…)
// e.g. PA202612-1101-001-1 and PA202612-1101-001-2 for a couple registered together.
// Numbers made before this format (PREFIX-YYYYMMDD-NNNN) are still read.

// Prefixes can't contain "-" (the separator); keep letters and digits only.
export function cleanPrefix(prefix) {
  return String(prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// today: "YYYY-MM-DD"
export function buildRegNumber(prefix, today, submission, person) {
  const mmdd = String(today).slice(5, 7) + String(today).slice(8, 10);
  return `${prefix}-${mmdd}-${String(submission).padStart(3, "0")}-${person}`;
}

// → { prefix, submission, person } for the current format, null for anything else.
export function parseRegNumber(regNumber) {
  const parts = String(regNumber || "").split("-");
  if (parts.length !== 4 || !/^\d{4}$/.test(parts[1]) || !/^\d+$/.test(parts[2]) || !/^\d+$/.test(parts[3])) return null;
  return { prefix: parts[0], submission: Number(parts[2]), person: Number(parts[3]) };
}

// Highest submission per event and highest person per submission, from loaded regs.
export function regCounters(regs) {
  const counters = { submissions: {}, persons: {} };
  for (const r of regs || []) noteRegNumber(counters, r);
  return counters;
}

// Raise the counters to cover one more reg (e.g. one another device just made).
export function noteRegNumber(counters, reg) {
  const p = parseRegNumber(reg.regNumber);
  if (!p) return;
  if (p.submission > (counters.submissions[reg.eventId] || 0)) counters.submissions[reg.eventId] = p.submission;
  const key = reg.eventId + ":" + p.submission;
  if (p.person > (counters.persons[key] || 0)) counters.persons[key] = p.person;
}

// "DD/MM/YYYY" of when the registration was made: registered_at, or the date inside
// an old-format number.
export function regDateLabel(reg) {
  const iso = reg?.registeredAt || "";
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const d = String(reg?.regNumber || "").split("-")[1] || "";
  return d.length === 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : "";
}
