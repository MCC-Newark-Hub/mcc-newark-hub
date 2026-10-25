export const SLOT_COUNT = 96; // 24h × 4 slots/hour

// The hub churches shown first, in this order (names as in the churches directory).
export const HUB_FALLBACK = ["Newark, NJ", "Toms River, NJ", "New York, NY", "Philadelphia, PA"];

// Splits the churches directory into the hub churches (top-level options) and all the others
// (shown after choosing "Outra"). The directory's own "Outra / Não Listada" placeholder is dropped.
export function splitChurches(churches) {
  const list = (churches || [])
    .map((c) => ({ display: (c.display || "").trim(), isHub: !!c.is_hub }))
    .filter((c) => c.display && !/^outra/i.test(c.display));
  let hubs = [...new Set(list.filter((c) => c.isHub).map((c) => c.display))];
  if (hubs.length === 0) hubs = [...HUB_FALLBACK];
  const rank = (d) => (HUB_FALLBACK.indexOf(d) < 0 ? 99 : HUB_FALLBACK.indexOf(d));
  hubs.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const others = [...new Set(list.map((c) => c.display))].filter((d) => !hubs.includes(d)).sort((a, b) => a.localeCompare(b, "pt"));
  return { hubs, others };
}

// "Newark, NJ" -> "Newark"
export function churchCity(church) {
  return String(church || "").split(",")[0].trim();
}

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

// Which active periods the public page shows. Several can run at once (one list per church group);
// each list name appears once (the one running now, else the next upcoming), and finished ones are
// hidden unless nothing else is left, so the page is never empty by accident.
export function pickActivePeriods(list, today) {
  const all = list || [];
  const live = all.filter((p) => p.end_date >= today);
  if (live.length) {
    const bySlug = new Map();
    for (const p of live) {
      const k = periodSlug(p);
      bySlug.set(k, [...(bySlug.get(k) || []), p]);
    }
    return [...bySlug.entries()]
      .map(([slug, group]) => pickByParam(group, slug, today)[0])
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id));
  }
  if (!all.length) return [];
  const lastEnd = all.reduce((m, p) => (p.end_date > m ? p.end_date : m), "");
  return all.filter((p) => p.end_date === lastEnd).sort((a, b) => a.id.localeCompare(b.id));
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

// Title and intentions in the reader's language; English falls back to the Portuguese text when
// no English version was written.
export function periodText(period, lang = "pt") {
  const en = lang === "en";
  const enReasons = (period.reasons_en || []).filter(Boolean);
  return {
    title: (en && (period.title_en || "").trim()) || period.title,
    reasons: en && enReasons.length ? enReasons : period.reasons || [],
  };
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
    .map((l) => l.replace(/^\s*[-•*]\s+/, "").trim())
    .filter(Boolean);
}

// How many people one slot accepts in this list (migration 024); 1 when the column doesn't exist yet.
export function slotCapacity(period) {
  const n = Number(period?.slot_capacity);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// slot index -> the people in it, in the order they were given.
export function groupBySlot(slots) {
  const map = new Map();
  for (const s of slots || []) {
    if (!map.has(s.slot_index)) map.set(s.slot_index, []);
    map.get(s.slot_index).push(s);
  }
  return map;
}

// covered = slots with at least one person; people = total names; full = slots at capacity.
export function slotStats(slots, capacity) {
  const by = groupBySlot(slots);
  let full = 0;
  by.forEach((list) => { if (list.length >= capacity) full += 1; });
  return { covered: by.size, people: (slots || []).length, full };
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
export function buildShareText(period, slots, lang = "pt", nameOf = (s) => s.member_name) {
  const pt = lang !== "en";
  const bySlot = groupBySlot(slots);
  const free = pt ? "LIVRE" : "FREE";
  const lines = Array.from({ length: SLOT_COUNT }, (_, i) => `${slotRange(i)} - ${(bySlot.get(i) || []).map((s) => nameOf(s)).join(" / ").toUpperCase() || free}`);
  const { title, reasons } = periodText(period, lang);
  const circular = formatCircular(period.circular, lang);
  return [
    title,
    ...((period.list_name || "").trim() ? [`${pt ? "Lista" : "List"}: ${period.list_name.trim()}`] : []),
    ...(circular ? [circular] : []),
    formatPeriodRange(period, lang),
    "",
    ...(reasons.length ? [pt ? "Motivos de Oração:" : "Prayer intentions:", ...reasonsToWhatsApp(reasons), ""] : []),
    pt ? "Períodos" : "Time slots",
    ...lines,
  ].join("\n");
}

// A colored label for the church shown next to each name. The four hub churches have fixed colors;
// any other church gets a stable color derived from its name.
const BADGE_PALETTE = [
  { bg: "#fde8e6", fg: "#9f1239" }, // rose
  { bg: "#e0f2fe", fg: "#075985" }, // sky
  { bg: "#dcfce7", fg: "#166534" }, // green
  { bg: "#fef3c7", fg: "#92400e" }, // amber
  { bg: "#ede9fe", fg: "#5b21b6" }, // violet
  { bg: "#cffafe", fg: "#155e75" }, // cyan
  { bg: "#fce7f3", fg: "#9d174d" }, // pink
  { bg: "#e2e8f0", fg: "#334155" }, // slate
];
const HUB_COLORS = { "Newark, NJ": 0, "Toms River, NJ": 1, "New York, NY": 3, "Philadelphia, PA": 4 };

export function churchBadge(church) {
  const label = churchCity(church);
  if (!label) return null;
  let idx = HUB_COLORS[church];
  if (idx === undefined) {
    let h = 0;
    for (const ch of String(church)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    idx = h % BADGE_PALETTE.length;
  }
  return { label, full: String(church), ...BADGE_PALETTE[idx] };
}

// What the board shows for a person: the member's badge name ("Gil Ricardo", "Laninha Amaral") when the entry is linked to the
// directory (member_id) and the member has one, otherwise the name as it was typed. The full name stays saved in the entry.
export function displayName(row, memberById) {
  const badge = String((row?.member_id && memberById?.get(row.member_id)?.badgeName) || "").trim();
  return badge || String(row?.member_name || "");
}

// The entries of a list that belong to a person typed in a search box: every typed word must start a word of the name shown
// (the badge name) or of the full name saved, ignoring accents and case. Needs at least two letters.
export function findSlotsByName(slots, query, memberById) {
  const strip = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);
  const words = strip(query);
  if (String(query || "").trim().length < 2 || !words.length) return [];
  return (slots || []).filter((s) => {
    const have = [...strip(displayName(s, memberById)), ...strip(s.member_name)];
    return words.every((w) => have.some((h) => h.startsWith(w)));
  });
}

// First name on top, the rest of the name (smaller) below: keeps the first name and the church label
// visible on one line without cutting anything.
export function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", rest: parts.slice(1).join(" ") };
}

// Inline markdown for the prayer intentions: **bold**, *italic* / _italic_ and [text](https://link).
// Returns tokens; the UI renders them as React elements (no raw HTML is ever injected).
const INLINE = /(~~[^~\n]+~~|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|(?<![\w])_[^_\s][^_\n]*_(?![\w])|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/g;

export function parseInlineMarkdown(text) {
  const out = [];
  let last = 0;
  const src = String(text || "");
  for (const m of src.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: "text", text: src.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) out.push({ type: "bold", text: t.slice(2, -2) });
    else if (t.startsWith("~~")) out.push({ type: "strike", text: t.slice(2, -2) });
    else if (t.startsWith("`")) out.push({ type: "code", text: t.slice(1, -1) });
    else if (t.startsWith("[")) {
      const close = t.indexOf("](");
      out.push({ type: "link", text: t.slice(1, close), href: t.slice(close + 2, -1) });
    } else out.push({ type: "italic", text: t.slice(1, -1) });
    last = m.index + t.length;
  }
  if (last < src.length) out.push({ type: "text", text: src.slice(last) });
  return out;
}

// WhatsApp's own syntax: *bold*, _italic_, links as plain "text (url)".
export function markdownToWhatsApp(text) {
  return parseInlineMarkdown(text)
    .map((t) => (t.type === "bold" ? `*${t.text}*` : t.type === "italic" ? `_${t.text}_` : t.type === "strike" ? `~${t.text}~` : t.type === "code" ? `\`\`\`${t.text}\`\`\`` : t.type === "link" ? `${t.text} (${t.href})` : t.text))
    .join("");
}

// ---- Block markdown for the "reasons" text ---------------------------------------------------------
// The admin writes one line per reason. A line can also be a block: "# Title" … "###### Title" (heading),
// "> quote", "---" (divider), "1. item" (numbered); anything else is a list item. Consecutive items/quotes are
// grouped. Nothing is ever treated as HTML.
const HEADING = /^(#{1,6})\s+(.+)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const QUOTE = /^>\s?(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.+)$/;

export function parseReasonBlocks(lines) {
  const blocks = [];
  for (const raw of lines || []) {
    const line = String(raw || "").trim();
    if (!line) continue;
    let m;
    if ((m = line.match(HEADING))) { blocks.push({ type: "heading", level: m[1].length, text: m[2].trim() }); continue; }
    if (RULE.test(line)) { blocks.push({ type: "rule" }); continue; }
    if ((m = line.match(QUOTE))) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "quote") last.lines.push(m[1].trim()); else blocks.push({ type: "quote", lines: [m[1].trim()] });
      continue;
    }
    const numbered = line.match(NUMBERED);
    const ordered = !!numbered;
    const text = numbered ? numbered[1].trim() : line;
    const last = blocks[blocks.length - 1];
    if (last?.type === "list" && last.ordered === ordered) last.items.push(text); else blocks.push({ type: "list", ordered, items: [text] });
  }
  return blocks;
}

// The same blocks as WhatsApp text: headings in bold, lists with "-" / "1.", quotes with ">".
export function reasonsToWhatsApp(lines) {
  const out = [];
  for (const b of parseReasonBlocks(lines)) {
    if (b.type === "heading") out.push("", `*${markdownToWhatsApp(b.text).replace(/\*/g, "")}*`);
    else if (b.type === "rule") out.push("———");
    else if (b.type === "quote") b.lines.forEach((l) => out.push(`> ${markdownToWhatsApp(l)}`));
    else b.items.forEach((it, i) => out.push(`${b.ordered ? `${i + 1}.` : "-"} ${markdownToWhatsApp(it)}`));
  }
  return out;
}

// Friendly link segment from a list name: "Costa Oeste" -> "costa-oeste", "São Paulo" -> "sao-paulo".
export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The link segment of a list: its name when it has one, otherwise its code.
export function periodSlug(period) {
  return slugify(period.list_name) || period.id;
}

// Finds the list a link points to: by code (oracao24h-001) or by list name (newark). The name is a
// permanent link: when several lists share it (one per circular) it shows the one running today, then
// the next upcoming one (so the link moves on by itself when a circular ends), then the most recent.
export function pickByParam(list, param, today = "") {
  const p = String(param || "").trim().toLowerCase();
  if (!p) return [];
  const hits = (list || []).filter((x) => x.id.toLowerCase() === p || slugify(x.list_name) === p);
  const newestStart = (a, b) => b.start_date.localeCompare(a.start_date) || b.id.localeCompare(a.id);
  if (today) {
    const running = hits.filter((x) => x.start_date <= today && today <= x.end_date).sort(newestStart);
    if (running.length) return running.slice(0, 1);
    const upcoming = hits.filter((x) => x.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id));
    if (upcoming.length) return upcoming.slice(0, 1);
    return [...hits].sort((a, b) => b.end_date.localeCompare(a.end_date) || newestStart(a, b)).slice(0, 1);
  }
  return [...hits].sort(newestStart).slice(0, 1);
}
