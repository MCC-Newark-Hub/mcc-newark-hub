import { SLOT_COUNT, slotRange } from "@/lib/prayerSlots";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// The template's time column, in the shapes Excel may hand back: text "00:15", "0:15", "00:15-00:30",
// "00:15:00", a time cell (fraction of a day or a Date, UTC). Returns the slot index 0-95, or null.
export function parseSlot(value) {
  let minutes = null;
  if (value instanceof Date) {
    minutes = value.getUTCHours() * 60 + value.getUTCMinutes();
  } else if (typeof value === "number") {
    if (value >= 0 && value < 1) minutes = Math.round(value * 1440);
  } else if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,2})[:h.](\d{2})(?::\d{2})?(?:\s*[-–—aà]\s*.*)?$/i);
    if (m) minutes = Number(m[1]) * 60 + Number(m[2]);
  }
  if (minutes === null || minutes % 15 !== 0 || minutes >= SLOT_COUNT * 15) return null;
  return minutes / 15;
}

const cell = (v) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());

// Turns the sheet (array of rows: [time, name, church]) into review rows. The header row and fully
// empty rows are skipped; a row with a time but no name is skipped too (a template slot left blank).
export function readImportRows(data) {
  const out = [];
  (data || []).forEach((r, idx) => {
    const [t, n, c] = r || [];
    if (idx === 0 && typeof t === "string" && parseSlot(t) === null) return; // header
    const name = cell(n);
    if (!name) return;
    out.push({ line: idx + 1, rawTime: t, slot: parseSlot(t), name, church: cell(c) });
  });
  return out;
}

// Checks each row and marks it ok / warn (importable, look twice) / error (skipped).
//   allowed:       church names the list accepts (null = any church)
//   existing:      Map slot_index -> people already saved in the list ([{ member_name, church }])
//   capacity:      how many people one slot accepts (default 1)
//   defaultChurch: used when a row has no church
//   directory:     known church names, to flag typos on open lists
// Messages are keys resolved by the caller; `vars` fills their placeholders.
export function validateImportRows(rows, { allowed = null, existing = new Map(), capacity = 1, defaultChurch = "", directory = [] } = {}) {
  const allowedMap = allowed ? new Map(allowed.map((a) => [norm(a), a])) : null;
  const dirMap = new Map(directory.map((d) => [norm(d), d]));
  const added = new Map(); // slot -> people added so far by earlier rows of this file
  return rows.map((r) => {
    const res = { ...r, status: "ok", msg: null, vars: {} };
    const fail = (msg, vars = {}) => Object.assign(res, { status: "error", msg, vars });
    const warn = (msg, vars = {}) => { if (res.status === "ok") Object.assign(res, { status: "warn", msg, vars }); };

    if (r.slot === null) return fail("badTime", { value: cell(r.rawTime) });
    res.range = slotRange(r.slot);
    if (r.name.length > 80) return fail("nameTooLong");

    let church = r.church || defaultChurch;
    if (!church) return fail("noChurch");
    if (allowedMap) {
      const hit = allowedMap.get(norm(church));
      if (!hit) return fail("outOfScope", { church });
      church = hit;
    } else if (dirMap.has(norm(church))) {
      church = dirMap.get(norm(church));
    } else {
      warn("unknownChurch", { church });
    }
    res.church = church;

    const inSlot = [...(existing.get(r.slot) || []), ...(added.get(r.slot) || [])];
    const same = inSlot.some((p) => norm(p.member_name) === norm(r.name) && norm(p.church) === norm(church));
    if (same) return fail("samePerson", { range: res.range });
    if (inSlot.length >= capacity) return fail("slotFull", { range: res.range, n: inSlot.length, cap: capacity });
    added.set(r.slot, [...(added.get(r.slot) || []), { member_name: r.name, church }]);
    if (/\s\/\s/.test(r.name)) warn("severalNames");
    return res;
  });
}

// ---- Matching the names of a spreadsheet against the member directory ---------------------------------------------
// A name such as "Mara N." or "Tatiana" is looked up among the members (restricted to the churches the list accepts), so
// the admin can confirm who it is before importing. Scores: 100 same full name · 85 first name + the other parts (a lone
// letter is an initial: "Mara N." = Mara N…) · 50 first name only.
const TITLES = new Set(["pr", "pra", "pastor", "pastora", "ir", "irma", "irmao"]); // "Pr Nairon" is Nairon
const tokens = (s) => norm(String(s || "").replace(/[.,;:()]/g, " ")).split(" ").filter((t, i, all) => t && !(i === 0 && all.length > 1 && TITLES.has(t)));

export function suggestMembers(name, members, { allowed = null, churchHint = "", limit = 5 } = {}) {
  const want = tokens(name);
  if (!want.length) return { candidates: [], auto: null };
  const allowedSet = allowed ? new Set(allowed.map(norm)) : null;
  const scored = [];
  for (const m of members || []) {
    if (allowedSet && !allowedSet.has(norm(m.church))) continue;
    const have = tokens(m.name);
    if (!have.length || have[0] !== want[0]) continue;
    let score;
    if (want.length === 1) score = 50;
    else if (want.join(" ") === have.join(" ")) score = 100;
    else {
      const rest = have.slice(1);
      score = want.slice(1).every((w) => rest.some((h) => h.startsWith(w))) ? 85 : 0;
    }
    if (!score) continue;
    if (want.length > 1 && churchHint && norm(m.church) === norm(churchHint)) score += 3; // only to tell namesakes apart
    scored.push({ member: m, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.member.name).localeCompare(String(b.member.name), "pt"));
  const [top, second] = scored;
  // a clear suggestion: a single candidate, or one that scores strictly higher than the next (an exact name beats a
  // partial one, and the church written in the sheet breaks a tie between namesakes)
  const auto = top && (!second || top.score > second.score) ? { member: top.member, exact: top.score >= 100 } : null;
  return { candidates: scored.slice(0, limit).map((s) => s.member), auto };
}

// Free search of the directory (for "someone else"): every word must start a word of the name.
export function searchMembers(members, query, { allowed = null, limit = 6 } = {}) {
  const words = tokens(query);
  if (!words.length) return [];
  const allowedSet = allowed ? new Set(allowed.map(norm)) : null;
  return (members || [])
    .filter((m) => (!allowedSet || allowedSet.has(norm(m.church))) && words.every((w) => tokens(m.name).some((h) => h.startsWith(w))))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt"))
    .slice(0, limit);
}

// The same person already saved in this list at ANOTHER time slot (the same slot is a duplicate, handled by the
// validation). Same person = same member (member_id) or the same name and church. `saved` = the list's current rows.
export function findOtherSlots(row, saved) {
  return (saved || []).filter((s) => {
    if (s.slot_index === row.slot) return false;
    if (row.memberId && s.member_id && s.member_id === row.memberId) return true;
    return norm(s.member_name) === norm(row.name) && norm(s.church) === norm(row.church);
  });
}
