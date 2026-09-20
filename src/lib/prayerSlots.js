export const SLOT_COUNT = 96; // 24h × 4 slots/hour

export const CHURCH_OPTIONS = ["Newark / Toms River", "New York", "Philadelphia", "Outra / Other"];

// The board reads as two halves, like the paper version: 00:00-12:00 and 12:00-00:00.
export const HALVES = [
  { start: 0, label: "00:00 - 12:00" },
  { start: 48, label: "12:00 - 00:00" },
];
export const HALF_SIZE = 48;

const pad = (n) => String(n).padStart(2, "0");

export function slotTime(i) {
  const h = Math.floor(i / 4) % 24;
  const m = (i % 4) * 15;
  return `${pad(h)}:${pad(m)}`;
}

// The last slot wraps to midnight: 23:45-00:00
export function slotRange(i) {
  return `${slotTime(i)}-${slotTime((i + 1) % SLOT_COUNT)}`;
}

// Local calendar date — toISOString() is UTC and flips to "tomorrow" in the evening in Newark.
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2025-10-27" -> "27/10/2025" (pt) or "10/27/2025" (en). String-based so no timezone shifts.
export function formatDate(iso, lang = "pt") {
  const [y, m, d] = String(iso || "").split("-");
  if (!y || !m || !d) return "";
  return lang === "en" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

// Codes follow the events convention: oracao24h-001, oracao24h-002, ...
export function nextPeriodId(list) {
  const max = (list || []).reduce((m, c) => {
    const n = /^oracao24h-(\d+)$/.exec(c.id || "");
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  return `oracao24h-${String(max + 1).padStart(3, "0")}`;
}

// Which period to show when none is asked for: the one running today, else the next
// upcoming one, else the most recently finished.
export function pickPeriod(list, today) {
  if (!list || list.length === 0) return null;
  const byStartDesc = (a, b) => b.start_date.localeCompare(a.start_date);
  const running = list.filter((c) => c.start_date <= today && today <= c.end_date).sort(byStartDesc);
  if (running.length) return running[0];
  const upcoming = list.filter((c) => c.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (upcoming.length) return upcoming[0];
  return [...list].sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
}

// "De 00:00 de 21/09/2026 até 00:00 de 27/09/2026"
export function formatPeriodRange(period, lang = "pt") {
  const from = formatDate(period.start_date, lang);
  const to = formatDate(period.end_date, lang);
  return lang === "en" ? `From 12 AM on ${from} until 12 AM on ${to}` : `De 00:00 de ${from} até 00:00 de ${to}`;
}

// "150/26" -> "Circular Nº 150/26"
export function formatCircular(circular, lang = "pt") {
  const c = (circular || "").trim();
  if (!c) return "";
  return lang === "en" ? `Circular No. ${c}` : `Circular Nº ${c}`;
}

// The list of intentions is edited as one per line.
export function parseReasons(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

// Plain-text board, ready to paste into WhatsApp:
//   ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA
//   Circular Nº 150/26
//   De 00:00 de 21/09/2026 até 00:00 de 27/09/2026
//
//   Motivos de Oração:
//   - ...
//
//   Períodos
//   00:00-00:15 - LIVRE
//   00:15-00:30 - LEONARD
export function buildShareText(period, slots, lang = "pt") {
  const pt = lang !== "en";
  const nameBySlot = new Map(slots.map((s) => [s.slot_index, s.member_name]));
  const free = pt ? "LIVRE" : "FREE";
  const lines = Array.from({ length: SLOT_COUNT }, (_, i) => `${slotRange(i)} - ${(nameBySlot.get(i) || free).toUpperCase()}`);
  const reasons = period.reasons || [];
  const circular = formatCircular(period.circular, lang);
  return [
    period.title,
    ...(circular ? [circular] : []),
    formatPeriodRange(period, lang),
    "",
    ...(reasons.length ? [pt ? "Motivos de Oração:" : "Prayer intentions:", ...reasons.map((r) => `- ${r}`), ""] : []),
    pt ? "Períodos" : "Time slots",
    ...lines,
  ].join("\n");
}
