// Trombetas › Importar CSV: which column is which (PT or EN headers), and the preview of every row —
// valid, invalid (with the reasons) or duplicate — before anything is sent. Pure, unit-tested.
// The server checks everything again (api/trumpet-guests.js, action "import").
import { cleanGuestInput, foldText, guestKey, IMPORT_MAX } from "./trumpets.js";
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "./contact.js";
import { nameSimilarity } from "./similarity.js";

export const IMPORT_FIELDS = ["name", "phone", "email", "invitedBy", "ga", "notes"];
export const REQUIRED_FIELDS = ["name"];

// Header text after foldHeader(), in PT and EN. "E-mail (opcional)" folds to "e mail opcional".
const ALIASES = {
  name: ["nome", "name", "nome do convidado", "nome completo", "convidado", "convidada", "guest", "guest name", "full name"],
  phone: ["telefone", "phone", "celular", "cel", "fone", "tel", "whatsapp", "mobile", "cell", "cell phone", "phone number", "numero", "telefone celular", "telefone opcional", "phone optional"],
  email: ["email", "e mail", "e mail opcional", "email opcional", "e mail optional", "email optional", "mail"],
  invitedBy: ["convidado por", "quem convidou", "convidou", "membro", "invited by", "inviter", "member"],
  ga: ["ga", "grupo", "grupo de assistencia", "group", "assistance group"],
  notes: ["notas", "nota", "observacoes", "observacao", "obs", "comentarios", "notes", "note", "comments"],
};
const FIELD_OF = Object.fromEntries(Object.entries(ALIASES).flatMap(([f, list]) => list.map((a) => [a, f])));

export const foldHeader = (h) => foldText(h).replace(/[^a-z0-9]+/g, " ").trim();

// headers → { columns: { field: index }, unknown: [header], missing: [required field] }.
// A second column for a field already found is listed as unknown (ignored).
export function mapColumns(headers = []) {
  const columns = {};
  const unknown = [];
  headers.forEach((h, i) => {
    const field = FIELD_OF[foldHeader(h)];
    if (field && !(field in columns)) columns[field] = i;
    else if (String(h).trim()) unknown.push(String(h).trim());
  });
  return { columns, unknown, missing: REQUIRED_FIELDS.filter((f) => !(f in columns)) };
}

// The example line of the template, so a forgotten one never gets imported.
export const EXAMPLE = { name: "Maria Exemplo", phone: "(973) 555-0100", email: "maria@example.com", notes: "" };

// The template: headers in the screen's language and one example line (flagged as invalid if left in).
export function templateRows(tt, gaName = "") {
  return [
    [tt.name, tt.phone, tt.email, tt.invitedBy, tt.ga, tt.notes],
    [EXAMPLE.name, EXAMPLE.phone, EXAMPLE.email, "", gaName, tt.importExampleNote || EXAMPLE.notes],
  ];
}

function findGa(cell, gas, defaultGaId) {
  if (!cell) return gas.find((g) => g.id === defaultGaId) || null;
  const f = foldText(cell);
  return gas.find((g) => foldText(g.name) === f) || gas.find((g) => foldText(g.id) === f) || null;
}

// Name words, accents and case ignored, without the connectives ("da", "de", "dos"…) people add or drop.
const PARTICLES = new Set(["da", "de", "do", "das", "dos", "e", "d"]);
const nameWords = (s) => foldText(s).split(/[^a-z0-9]+/).filter((w) => w && !PARTICLES.has(w));

// How well a typed name fits a directory name, 0–100: 100 the same text, 95 the same words ("Afonso da Costa" =
// "Afonso Costa"), 85 same first and last word and one name holds every word of the other ("Ana Lima" ~ "Ana Souza
// Lima"), else up to 80 for a close spelling ("Afonço Costa"), 0 below that.
function nameScore(typed, name) {
  if (foldText(typed) === foldText(name)) return 100;
  const a = nameWords(typed);
  const b = nameWords(name);
  if (!a.length || !b.length) return 0;
  if (a.join(" ") === b.join(" ")) return 95;
  if (a[0] === b[0] && a[a.length - 1] === b[b.length - 1] && Math.min(a.length, b.length) >= 2) {
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (short.every((w) => long.includes(w))) return 85;
  }
  const sim = nameSimilarity(a.join(" "), b.join(" "));
  return sim >= 0.75 ? Math.round(sim * 80) : 0;
}

// Who the "Convidado por" text may be, among the members of the GA's church (all members when the GA is unknown).
// → { exact, auto, candidates }: `exact` the one member with that very name or id (a member of the GA wins a tie);
// `auto` a clear best guess (85+ and ahead of the next) to confirm; `candidates` the best few, for the leader to pick.
export function suggestInviters(typed, ga, members, { limit = 5 } = {}) {
  const pool = (members || []).filter((m) => !ga?.church || m.church === ga.church);
  const f = foldText(typed);
  const byId = pool.filter((m) => foldText(m.id) === f);
  if (byId.length === 1) return { exact: byId[0], auto: null, candidates: byId };
  const scored = pool
    .map((m) => ({ m, score: nameScore(typed, m.name) + (ga && m.gaId === ga.id ? 2 : 0) }))
    .filter((x) => x.score >= 60)
    .sort((x, y) => y.score - x.score || String(x.m.name).localeCompare(String(y.m.name), "pt"));
  const [top, second] = scored;
  const clear = top && (!second || top.score > second.score);
  return {
    exact: clear && top.score >= 100 ? top.m : null,
    auto: clear && top.score >= 85 && top.score < 100 ? top.m : null,
    candidates: scored.slice(0, limit).map((x) => x.m),
  };
}

// The key a leader's choice is kept under: the same typed name in the same church is the same person in every row.
export const inviterPickKey = (typed, ga) => `${foldText(typed)}|${ga?.church || ""}`;

// parsed: { headers, records } from parseCsv. gas: the leader's GAs; defaultGaId: the GA picked on the list (used
// when the GA column is missing or empty); members: the directory; existing: this year's guests already on file.
// → { columns, unknown, missing, tooMany, rows, counts }; each row: { line, status, reasons, input, view }.
// status "valid" rows are the ones to send (`input` is what api create/import take).
// inviterPicks: Map inviterPickKey → member id, or "" for no inviter — the leader's choices in the match step. A row with
// "Convidado por" filled in has `inviter` { typed, key, church, state, candidates }: state "exact" (found), "suggested"
// (the clear best guess, used unless changed), "picked" (the leader chose), "pick" (several fit: choose) or "missing"
// (nobody fits: search or leave it blank); `id` is the member used (null = none).
export function buildImportPreview(parsed, { gas = [], defaultGaId = "", members = [], existing = [], inviterPicks = new Map() } = {}) {
  const { columns, unknown, missing } = mapColumns(parsed?.headers || []);
  const records = parsed?.records || [];
  const empty = { valid: 0, invalid: 0, duplicate: 0 };
  if (missing.length) return { columns, unknown, missing, tooMany: false, rows: [], counts: empty };
  if (records.length > IMPORT_MAX) return { columns, unknown, missing, tooMany: true, rows: [], counts: empty };

  const cell = (cells, field) => (field in columns ? String(cells[columns[field]] ?? "").trim() : "");
  const onFile = new Set(existing.map((g) => guestKey(g.name, g.phone)));
  const exampleKey = guestKey(EXAMPLE.name, EXAMPLE.phone);
  const firstLine = new Map(); // guestKey → line of the first valid row
  const memberById = new Map(members.map((m) => [m.id, m]));

  const rows = records.map(({ line, cells }) => {
    const raw = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, cell(cells, f)]));
    const reasons = [];
    if (!raw.name) reasons.push({ code: "missing_name" });
    else if (raw.name.length > 120) reasons.push({ code: "invalid_name" });
    if (raw.phone && !isValidPhone(normalizePhone(raw.phone))) reasons.push({ code: "invalid_phone", value: raw.phone });
    if (raw.email && !isValidEmail(normalizeEmail(raw.email))) reasons.push({ code: "invalid_email", value: raw.email });
    const ga = findGa(raw.ga, gas, defaultGaId);
    if (!ga) reasons.push({ code: raw.ga ? "unknown_ga" : "missing_ga", value: raw.ga });
    let inviterId = null;
    let inviterInfo = null;
    if (raw.invitedBy) {
      const key = inviterPickKey(raw.invitedBy, ga);
      const sug = suggestInviters(raw.invitedBy, ga, members);
      let state;
      if (inviterPicks.has(key)) {
        const picked = inviterPicks.get(key);
        state = "picked";
        inviterId = picked && memberById.has(picked) ? picked : null;
      } else if (sug.exact) { state = "exact"; inviterId = sug.exact.id; }
      else if (sug.auto) { state = "suggested"; inviterId = sug.auto.id; }
      else {
        state = sug.candidates.length ? "pick" : "missing";
        reasons.push({ code: state === "pick" ? "ambiguous_inviter" : "unknown_inviter", value: raw.invitedBy });
      }
      inviterInfo = { typed: raw.invitedBy, key, church: ga?.church || "", state, id: inviterId, candidates: sug.candidates };
    }
    const inviter = inviterId ? { id: inviterId, name: memberById.get(inviterId)?.name } : { id: null };

    const input = { gaId: ga?.id || "", name: raw.name, phone: raw.phone, email: raw.email, invitedByMemberId: inviter.id || "", notes: raw.notes };
    if (!reasons.length) {
      const { error } = cleanGuestInput(input); // the server's own rules, as a last check
      if (error) reasons.push({ code: error });
    }
    const key = guestKey(raw.name, raw.phone);
    if (!reasons.length && key === exampleKey) reasons.push({ code: "example_row" });

    let status = reasons.length ? "invalid" : "valid";
    if (status === "valid") {
      if (onFile.has(key)) { status = "duplicate"; reasons.push({ code: "dup_existing" }); }
      else if (firstLine.has(key)) { status = "duplicate"; reasons.push({ code: "dup_file", line: firstLine.get(key) }); }
      else firstLine.set(key, line);
    }
    return {
      line,
      status,
      reasons,
      input: status === "valid" ? input : null,
      inviter: inviterInfo,
      view: { name: raw.name, phone: raw.phone, email: raw.email, ga: ga?.name || raw.ga, invitedBy: inviter.name || (inviterInfo?.state === "picked" ? "" : raw.invitedBy), notes: raw.notes },
    };
  });

  const counts = { ...empty };
  for (const r of rows) counts[r.status] += 1;
  return { columns, unknown, missing, tooMany: false, rows, counts };
}
