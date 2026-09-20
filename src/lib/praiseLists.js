// Culto Profético › Lista de Louvores: pure helpers (codes, search, lock rules, recency).
import { fill } from "@/i18n/strings";

export const CATEGORIES = ["coletanea", "cia", "avulso", "english"];

// Code prefix per category. Avulsos usually have no code at all.
export const CODE_PREFIX = { coletanea: "CL", cia: "CIA", avulso: "AVL", english: "ENG" };

// Themes of the Coletânea (only Coletânea and CIA songs carry one).
export const THEMES = [
  "Clamor",
  "Invocação e Comunhão",
  "Morte, Ressurreição e Salvação",
  "Dedicação",
  "Console e Encorajamento",
  "Santificação e Derramamento do Espírito Santo",
  "Volta de Jesus e Eternidade",
  "Louvor",
  "Salmos de Louvor",
  "Grupo de Louvor",
  "Corinhos",
  "Crianças, Intermediários e Adolescentes",
];

export const SERVICE_TYPES = ["ebd", "noite", "outro"];

// A list locks by itself at this local hour on the day after the service.
export const AUTO_LOCK_HOUR = 6;

// How long "cantado há X dias" is shown.
export const RECENT_DAYS = 90;

export const themeApplies = (category) => category === "coletanea" || category === "cia";

// Lowercase, accent-free, single-spaced.
export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// "cl 1" | "CL-1" | "cl001" -> "CL-001". Anything that is not PREFIX + number is returned uppercased/trimmed.
export function normalizeCode(input) {
  const raw = String(input || "").trim().toUpperCase();
  const m = raw.match(/^([A-Z]{2,4})[\s-]*0*(\d{1,4})$/);
  if (!m) return raw;
  return `${m[1]}-${m[2].padStart(3, "0")}`;
}

export function formatCode(category, n) {
  const prefix = CODE_PREFIX[category];
  if (!prefix || String(n ?? "").trim() === "" || !Number.isFinite(Number(n))) return "";
  return `${prefix}-${String(Math.trunc(Number(n))).padStart(3, "0")}`;
}

// Category implied by a code prefix ("ENG-031" -> "english"); null when unknown.
export function categoryFromCode(code) {
  const prefix = normalizeCode(code).split("-")[0];
  return CATEGORIES.find((c) => CODE_PREFIX[c] === prefix) || null;
}

// One search box for number and title. Ranked: exact code, code prefix, title prefix, title contains.
// Pending songs are searchable too (they are usable on a list before approval).
export function searchSongs(songs, query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const qCode = normalizeCode(query).toLowerCase();
  const scored = [];
  for (const s of songs || []) {
    const code = (s.code || "").toLowerCase();
    const title = norm(s.title);
    let score = 0;
    if (code && code === qCode) score = 100;
    else if (code && (code.startsWith(qCode) || code.replace(/-0*/, "-").startsWith(q))) score = 80;
    else if (title.startsWith(q)) score = 60;
    else if (title.includes(q)) score = 40;
    if (score) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score || norm(a.s.title).localeCompare(norm(b.s.title), "pt"));
  return scored.slice(0, limit).map((x) => x.s);
}

// Existing songs whose title is (nearly) the one being added — to warn before creating a duplicate.
export function findSimilarSongs(title, songs, limit = 3) {
  const q = norm(title);
  if (q.length < 3) return [];
  const words = new Set(q.split(" ").filter((w) => w.length > 2));
  const out = [];
  for (const s of songs || []) {
    const t = norm(s.title);
    if (t === q || t.includes(q) || q.includes(t)) { out.push({ s, score: 1 }); continue; }
    const tw = t.split(" ").filter((w) => w.length > 2);
    if (!tw.length || !words.size) continue;
    const shared = tw.filter((w) => words.has(w)).length;
    const score = shared / Math.max(tw.length, words.size);
    if (score >= 0.7) out.push({ s, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.s);
}

const pad = (n) => String(n).padStart(2, "0");
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Lists are editable during the service day and until AUTO_LOCK_HOUR the next morning,
// unless an admin locked (or unlocked) them by hand.
export function isListLocked(list, now = new Date()) {
  if (!list) return false;
  if (list.locked) return true;
  const [y, m, d] = String(list.service_date).split("-").map(Number);
  if (!y || !m || !d) return false;
  const lockAt = new Date(y, m - 1, d + 1, AUTO_LOCK_HOUR, 0, 0, 0);
  return now.getTime() >= lockAt.getTime();
}

// Whole days between two YYYY-MM-DD dates (later - earlier), timezone-safe.
export function daysBetween(from, to) {
  const a = Date.UTC(...String(from).split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...String(to).split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
}

// "Cantado há 12 dias" data for the search results; null when never sung or older than RECENT_DAYS.
export function recency(lastSungOn, today = dateKey()) {
  if (!lastSungOn) return null;
  const days = daysBetween(lastSungOn, today);
  if (days < 0 || days > RECENT_DAYS) return null;
  return { days, date: lastSungOn };
}

// Moves an item and renumbers positions 0..n-1 (used by reorder and by removal).
export function moveItem(items, from, to) {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items.map((it, i) => ({ ...it, position: i }));
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next.map((x, i) => ({ ...x, position: i }));
}

export function renumber(items) {
  return items.map((it, i) => ({ ...it, position: i }));
}

// The label shown for a song everywhere: "CL-001 · Título" (avulso without code: just the title).
export function songLabel(song) {
  if (!song) return "";
  return song.code ? `${song.code} · ${song.title}` : song.title;
}

// "Cantado há 12 dias" in the current language (tt = STRINGS[lang]).
export function sungText(tt, days) {
  if (days === 0) return tt.praiseSungToday;
  if (days === 1) return tt.praiseSungOne;
  return fill(tt.praiseSungMany, { n: days });
}

// Admins and the Grupo de Louvor team leader approve, edit and delete songs and manage lists.
export const GL_TEAM = "Grupo de Louvor";
export const canManagePraise = (user) => !!user && ((user.sysRoles || []).includes("admin") || (user.teamLeads || []).includes(GL_TEAM));

// What the "N°" column shows on the published page: only the number ("CL-004" -> "4", like the paper list).
// The prefix is for the database. Songs without a number fall back to their category tag (AVL, CIA, ENG).
export function songNumberLabel(song) {
  if (!song) return "";
  const m = String(song.code || "").match(/(\d+)$/);
  if (m) return String(Number(m[1]));
  return CODE_PREFIX[song.category] || "";
}

// Public read-only page of a list, sent to the Grupo de Louvor once the list is published.
export const listPath = (id) => `/culto-profetico/${id}`;
