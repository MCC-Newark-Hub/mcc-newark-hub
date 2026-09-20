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
