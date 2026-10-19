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

// A list locks by itself at midnight (00:00) at the end of the service day.
export const AUTO_LOCK_HOUR = 0;

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

// A code is empty (songs without a number) or PREFIX-NNN, e.g. "CL-001". Expects an already normalized code.
export const isValidCode = (code) => !code || /^[A-Z]{2,4}-\d{1,4}$/.test(code);

// "04 - Quando te prostrares", "198. Ele é…" — the number belongs in the code field, never in the title.
export const hasNumberPrefix = (title) => /^\s*\d+\s*[-–—]|^\s*\d+\s*[.):]\s/.test(String(title || ""));

// How many songs the catalogue holds, overall and per category (every category is present, even with 0).
export function catalogTotals(songs) {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  let total = 0;
  for (const s of songs || []) {
    total += 1;
    if (s.category in byCategory) byCategory[s.category] += 1;
  }
  return { total, byCategory };
}

// Catalogue list for the admin tab: optionally one category ("all" = no category filter), then the search box
// (accent-insensitive, on title, code and theme).
export function filterCatalog(songs, query, category = "all") {
  const q = norm(query);
  return (songs || []).filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    return !q || norm(s.title).includes(q) || norm(s.code || "").includes(q) || norm(s.theme || "").includes(q);
  });
}

// Message for an error returned by createSong / updateSong (tt = STRINGS[lang]; label = the code that was typed).
export function songErrorText(tt, error, label) {
  if (error?.code === "duplicate_code") return fill(tt.praiseCodeTaken, { label });
  if (error?.code === "number_in_title") return tt.praiseTitleNoNumber;
  if (error?.code === "invalid_code") return tt.praiseCodeInvalid;
  return tt.praiseSaveFailed;
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

// One search box for number and title. A plain number ("198") finds that number in every category (the prefixes are
// internal); "cl 1" / "CIA-12" still work. Ranked: exact number/code, number/code prefix, title prefix, title contains.
// Pending songs are searchable too (they are usable on a list before approval).
export function searchSongs(songs, query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const qCode = normalizeCode(query).toLowerCase();
  const qNumber = /^\d+$/.test(q) ? String(Number(q)) : null;
  const scored = [];
  for (const s of songs || []) {
    const code = (s.code || "").toLowerCase();
    const title = norm(s.title);
    const number = songNumber(s);
    let score = 0;
    if (qNumber && number === qNumber) score = 100;
    else if (qNumber && number && number.startsWith(qNumber)) score = 70;
    else if (code && code === qCode) score = 100;
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

// The number of a song without its internal prefix: "CL-198" -> "198", "CIA-004" -> "4"; "" when it has none.
// Prefixes (CL-, CIA-, ENG-, AVL-) are an internal detail: people only ever see and type the number.
export function songNumber(song) {
  const m = String(song?.code || "").match(/(\d+)$/);
  return m ? String(Number(m[1])) : "";
}

// The label shown for a song everywhere: "198 · ELE É A MINHA ALEGRIA" (no number: just the title).
export function songLabel(song) {
  if (!song) return "";
  const n = songNumber(song);
  return n ? `${n} · ${song.title}` : song.title;
}

// Song titles are always stored in UPPERCASE (the house standard, as in the projection decks).
export const upperTitle = (title) => String(title || "").toUpperCase();
export const formatSongTitle = (title) => upperTitle(title).replace(/\s+/g, " ").trim();

// "Cantado há 12 dias" in the current language (tt = STRINGS[lang]).
export function sungText(tt, days) {
  if (days === 0) return tt.praiseSungToday;
  if (days === 1) return tt.praiseSungOne;
  return fill(tt.praiseSungMany, { n: days });
}

// Admins and the Grupo de Louvor team leader approve, edit and delete songs and manage lists.
export const GL_TEAM = "Grupo de Louvor";
export const canManagePraise = (user) => !!user && ((user.sysRoles || []).includes("admin") || (user.teamLeads || []).includes(GL_TEAM));

// Service start times by weekday (0=Sun, 6=Sat) and type.
// "Finalizar" becomes available 15 min after the service starts.
const SERVICE_START = {
  ebd:   { h: 10, m: 45 },
  noite: { weekend: { h: 19, m: 45 }, weekday: { h: 20, m: 15 } },
  outro: { h: 20, m: 0 },
};

export function canFinalizeAt(serviceDate, serviceType) {
  const [y, mo, d] = String(serviceDate).split("-").map(Number);
  if (!y || !mo || !d) return null;
  const dow = new Date(y, mo - 1, d).getDay();
  let h, m;
  if (serviceType === "ebd") { ({ h, m } = SERVICE_START.ebd); }
  else if (serviceType === "noite") {
    ({ h, m } = (dow === 0 || dow === 6) ? SERVICE_START.noite.weekend : SERVICE_START.noite.weekday);
  } else { ({ h, m } = SERVICE_START.outro); }
  return new Date(y, mo - 1, d, h, m + 15, 0);
}

export function isFinalizeEnabled(serviceDate, serviceType, now = new Date()) {
  const at = canFinalizeAt(serviceDate, serviceType);
  return !at || now >= at;
}

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
