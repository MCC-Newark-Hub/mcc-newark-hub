// Trombetas › Importar CSV: which column is which (PT or EN headers), and the preview of every row —
// valid, invalid (with the reasons) or duplicate — before anything is sent. Pure, unit-tested.
// The server checks everything again (api/trumpet-guests.js, action "import").
import { cleanGuestInput, foldText, guestKey, IMPORT_MAX } from "./trumpets.js";
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "./contact.js";

export const IMPORT_FIELDS = ["name", "phone", "email", "invitedBy", "ga", "notes"];
export const REQUIRED_FIELDS = ["name", "phone"];

// Header text after foldHeader(), in PT and EN. "E-mail (opcional)" folds to "e mail opcional".
const ALIASES = {
  name: ["nome", "name", "nome do convidado", "nome completo", "convidado", "convidada", "guest", "guest name", "full name"],
  phone: ["telefone", "phone", "celular", "cel", "fone", "tel", "whatsapp", "mobile", "cell", "cell phone", "phone number", "numero", "telefone celular"],
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

// An inviter is a member of the GA's church, by name (accents and case ignored) or id. When the name matches
// several, one in the GA itself wins; otherwise the row is ambiguous.
function findInviter(cell, ga, members) {
  if (!cell) return { id: null };
  const f = foldText(cell);
  const pool = members.filter((m) => !ga?.church || m.church === ga.church);
  const hits = pool.filter((m) => foldText(m.name) === f || foldText(m.id) === f);
  if (hits.length === 1) return { id: hits[0].id, name: hits[0].name };
  const inGa = hits.filter((m) => ga && m.gaId === ga.id);
  if (inGa.length === 1) return { id: inGa[0].id, name: inGa[0].name };
  return { error: hits.length ? "ambiguous_inviter" : "unknown_inviter" };
}

// parsed: { headers, records } from parseCsv. gas: the leader's GAs; defaultGaId: the GA picked on the list (used
// when the GA column is missing or empty); members: the directory; existing: this year's guests already on file.
// → { columns, unknown, missing, tooMany, rows, counts }; each row: { line, status, reasons, input, view }.
// status "valid" rows are the ones to send (`input` is what api create/import take).
export function buildImportPreview(parsed, { gas = [], defaultGaId = "", members = [], existing = [] } = {}) {
  const { columns, unknown, missing } = mapColumns(parsed?.headers || []);
  const records = parsed?.records || [];
  const empty = { valid: 0, invalid: 0, duplicate: 0 };
  if (missing.length) return { columns, unknown, missing, tooMany: false, rows: [], counts: empty };
  if (records.length > IMPORT_MAX) return { columns, unknown, missing, tooMany: true, rows: [], counts: empty };

  const cell = (cells, field) => (field in columns ? String(cells[columns[field]] ?? "").trim() : "");
  const onFile = new Set(existing.map((g) => guestKey(g.name, g.phone)));
  const exampleKey = guestKey(EXAMPLE.name, EXAMPLE.phone);
  const firstLine = new Map(); // guestKey → line of the first valid row

  const rows = records.map(({ line, cells }) => {
    const raw = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, cell(cells, f)]));
    const reasons = [];
    if (!raw.name) reasons.push({ code: "missing_name" });
    else if (raw.name.length > 120) reasons.push({ code: "invalid_name" });
    if (!raw.phone) reasons.push({ code: "missing_phone" });
    else if (!isValidPhone(normalizePhone(raw.phone))) reasons.push({ code: "invalid_phone", value: raw.phone });
    if (raw.email && !isValidEmail(normalizeEmail(raw.email))) reasons.push({ code: "invalid_email", value: raw.email });
    const ga = findGa(raw.ga, gas, defaultGaId);
    if (!ga) reasons.push({ code: raw.ga ? "unknown_ga" : "missing_ga", value: raw.ga });
    const inviter = findInviter(raw.invitedBy, ga, members);
    if (inviter.error) reasons.push({ code: inviter.error, value: raw.invitedBy });

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
      view: { name: raw.name, phone: raw.phone, email: raw.email, ga: ga?.name || raw.ga, invitedBy: inviter.name || raw.invitedBy, notes: raw.notes },
    };
  });

  const counts = { ...empty };
  for (const r of rows) counts[r.status] += 1;
  return { columns, unknown, missing, tooMany: false, rows, counts };
}
