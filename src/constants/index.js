// ── Maintenance Mode ────────────────────────────────────────────────────────
// While true: only admin PINs can log in (non-admin logins and cached non-admin
// sessions are blocked), and all public routes (register, lookup, check-in,
// songs) show a maintenance notice instead of their normal content.
// Set back to false to reopen the app.
export const MAINTENANCE_MODE = true;

// ── Categories, Roles, Teams, Churches ────────────────────────────────────────

export const CATEGORIES = ["0-3", "Criança", "Intermediário", "Adolescente", "Jovem", "Adulto"];

export const ROLE_OPTIONS = [
  "",
  "Pastor",
  "Ungido",
  "Diácono",
  "Obreiro",
  "Grupo de Louvor",
  "Instrumentista",
  "Instrumentista Aprendiz",
  "Operador de Som",
  "Operador de Projeção",
  "Grupo de Intercessão",
  "Grupo de Oração",
  "Grupo de Limpeza",
  "Professor de Seminário",
  "Professor(a) de Adolescentes",
  "Professor(a) de Crianças",
  "Professor(a) de Intermediários",
  "Professor(a) de Jovens",
  "Professor(a) - Acessibilidade",
  "Secretário(a) de GA",
  "Secretário(a) de Igreja",
  "Responsável - Grupo de Louvor",
  "Responsável - Inscrições",
  "Responsável - Instrumentistas",
  "Responsável - Jovens",
  "Responsável - Professores CIA",
  "Primeiro Tesoureiro",
  "Segundo Tesoureiro",
  "Comissão de Contas",
  "Trabalho de Senhoras - Apoio",
  "Trabalho de Senhoras - Coordenadora",
  "Trabalho de Senhoras - Louvor/Palavra",
  "Intérprete de Libras",
  "Tradutor",
  "Mídias Sociais",
];

export const ROLE_GROUPS = [
  { group: "Obreiro", roles: ["Pastor", "Ungido", "Diácono", "Obreiro"] },
  {
    group: "Louvor",
    roles: ["Grupo de Louvor", "Instrumentista", "Instrumentista Aprendiz", "Operador de Som", "Operador de Projeção"],
  },
  { group: "Louvor — Vocal", roles: ["Soprano", "Mezzo", "Contralto", "Tenor", "Barítono", "Baixo"] },
  { group: "Louvor — Instrumento", roles: ["Violão", "Guitarra", "Baixo Elétrico", "Bateria", "Teclado", "Piano", "Flauta", "Saxofone", "Trompete", "Violino", "Percussão"] },
  { group: "Intercessão", roles: ["Grupo de Intercessão", "Grupo de Oração"] },
  { group: "Limpeza", roles: ["Grupo de Limpeza"] },
  {
    group: "Professores",
    roles: [
      "Professor de Seminário",
      "Professor(a) de Adolescentes",
      "Professor(a) de Crianças",
      "Professor(a) de Intermediários",
      "Professor(a) de Jovens",
      "Professor(a) - Acessibilidade",
    ],
  },
  { group: "Secretaria", roles: ["Secretário(a) de GA", "Secretário(a) de Igreja"] },
  {
    group: "Responsáveis",
    roles: [
      "Responsável - Grupo de Louvor",
      "Responsável - Inscrições",
      "Responsável - Instrumentistas",
      "Responsável - Jovens",
      "Responsável - Professores CIA",
    ],
  },
  {
    group: "Tesouraria",
    roles: ["Primeiro Tesoureiro", "Segundo Tesoureiro", "Comissão de Contas"],
  },
  {
    group: "Senhoras",
    roles: [
      "Trabalho de Senhoras - Apoio",
      "Trabalho de Senhoras - Coordenadora",
      "Trabalho de Senhoras - Louvor/Palavra",
    ],
  },
  { group: "Outros", roles: ["Intérprete de Libras", "Tradutor", "Mídias Sociais"] },
];

export const TEAMS = [
  "Participante",
  "Pastores",
  "Ungidos",
  "Diáconos",
  "Grupo de Louvor",
  "Cozinha",
  "Limpeza",
  "Secretaria",
  "Segurança",
  "Som & Projeção",
  "Tradução",
  "Transporte",
  "Professoras",
  "Tesouraria",
];
export const SERVICE_TEAMS = TEAMS.filter((t) => t !== "Participante");

export const CHURCH_LIST = [
  { display: "Newark, NJ", code: "EUA" },
  { display: "New York, NY", code: "EUA" },
  { display: "Philadelphia, PA", code: "EUA" },
  { display: "Toms River, NJ", code: "EUA" },
  { display: "Framingham, MA", code: "EUA" },
  { display: "Milford, MA", code: "EUA" },
  { display: "Everett, MA", code: "EUA" },
  { display: "Danbury, CT", code: "EUA" },
  { display: "Falls Church, VA", code: "EUA" },
  { display: "Gardner, MA", code: "EUA" },
  { display: "Pompano Beach, FL", code: "EUA" },
  { display: "Richmond, MA", code: "EUA" },
  { display: "Provo, UT", code: "EUA" },
  { display: "Hempstead, NY", code: "EUA" },
  { display: "Ajax, ON", code: "CAN" },
];

export const CHURCHES = CHURCH_LIST.map((c) => c.display + " - " + c.code);

export const churchDisplay = (raw) => {
  if (!raw || raw === "Sem Igreja") return "";
  if (raw.startsWith("Outra: ")) return raw.slice(7);
  const found = CHURCH_LIST.find((c) => raw.startsWith(c.display));
  return found ? found.display : raw.replace(/ - (EUA|CAN|BRA)$/, "");
};

export const churchCode = (raw) => {
  if (!raw || raw === "Sem Igreja" || raw.startsWith("Outra: ")) return "";
  const m = raw.match(/- (EUA|CAN|BRA)$/);
  if (m) return m[1];
  const found = CHURCH_LIST.find((c) => raw.startsWith(c.display));
  return found ? found.code : "";
};

// ── System Roles ───────────────────────────────────────────────────────────────
export const ROLES_SYS = {
  ADMIN: "admin",
  CLERK: "clerk",
  PASTOR: "pastor",
  GA_LEADER: "ga_leader",
  TEAM_LEADER: "team_leader",
  TREASURER: "treasurer",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
export const fmt = (n) => `$${Number(n).toFixed(2)}`;
// A date-only ISO string ("YYYY-MM-DD") parses as UTC midnight per spec — every
// helper here relies on that consistently (via getUTC*/setUTC*) so date math never
// silently drifts a day depending on the caller's local timezone offset.
export const daysSince = (dateStr) =>
  Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
export const daysUntil = (dateStr) =>
  Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
export const addDays = (dateStr, n) => {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const OBREIRO_ROLES = ["Pastor", "Ungido", "Diácono", "Obreiro"];

// Pastores/Ungidos/Diáconos belong to their leadership team by virtue of the
// role itself. Mirrors SERVICE_LEADER_TEAMS in useAppData.js (that copy drives
// the actual roster auto-assignment; this one just keeps the registration
// form's team field in sync with whatever role gets picked).
export const teamForRole = (role, fallback = "Participante") =>
  role === "Pastor" ? "Pastores" : role === "Diácono" ? "Diáconos" : role === "Ungido" ? "Ungidos" : fallback;

export const isDeadlineExempt = (reg, allEventRegs = []) => {
  if (reg.paid || reg.exempt || reg.cancelled || reg.waitlisted) return true;
  // A $0 registration has nothing to pay, so no payment deadline applies — check
  // this directly rather than relying solely on the exempt flag having been
  // persisted correctly (found production data where it wasn't: zero-fee categories
  // like Criança/Intermediário with exempt still false).
  if (reg.fee === 0) return true;
  if (OBREIRO_ROLES.includes(reg.role)) return true;
  if (reg.team && reg.team !== "Participante") return true;
  if (reg.familyId && allEventRegs.length > 0) {
    const familyRegs = allEventRegs.filter((r) => r.familyId === reg.familyId && !r.cancelled);
    if (familyRegs.some((r) => OBREIRO_ROLES.includes(r.role))) return true;
    if (familyRegs.some((r) => r.team && r.team !== "Participante")) return true;
  }
  return false;
};

const statusFromRemaining = (remaining) => {
  if (remaining <= 0) return { overdue: true, remaining: 0, label: "Prazo expirado" };
  if (remaining <= 2)
    return { overdue: false, urgent: true, remaining, label: `${remaining}d restante${remaining === 1 ? "" : "s"}` };
  return { overdue: false, urgent: false, remaining, label: `${remaining}d restante${remaining === 1 ? "" : "s"}` };
};

// Unclipped days remaining until the payment deadline (negative once overdue) — null
// if there's no deadline to speak of (exempt, or the event has none configured).
// deadlineStatus() below clips this to 0 once overdue for display ("Prazo expirado"
// rather than "-15d"); the auto-cancellation grace-period check needs the real,
// unclipped value to know *how* overdue something is, not just that it is.
export const remainingDeadlineDays = (reg, event, allEventRegs = []) => {
  // Events loaded from Supabase are never passed through a camelCase mapper (unlike
  // registrations/members), so a real event only has payment_deadline_days — without
  // this fallback this function silently returns null for every real registration.
  const paymentDeadlineDays = event?.paymentDeadlineDays ?? event?.payment_deadline_days;
  if (!paymentDeadlineDays || isDeadlineExempt(reg, allEventRegs)) return null;
  // An explicit staff-set deadline (from extending or reactivating) is authoritative —
  // it fully replaces the earliest-attempt calculation below, not additive on top of
  // it, so "your deadline is Aug 15" stays simple to reason about.
  if (reg.deadlineExtendedTo) return daysUntil(reg.deadlineExtendedTo);
  // Count from this member's earliest attempt at this event, including cancelled ones —
  // otherwise cancelling an overdue registration and signing up again resets the clock,
  // since a fresh row always starts with today's registeredAt.
  const attempts =
    reg.memberId && reg.memberId !== "GUEST"
      ? allEventRegs.filter((r) => r.memberId === reg.memberId)
      : [reg];
  const earliestRegisteredAt = attempts.reduce(
    (earliest, r) => (r.registeredAt && r.registeredAt < earliest ? r.registeredAt : earliest),
    reg.registeredAt
  );
  return paymentDeadlineDays - daysSince(earliestRegisteredAt);
};

export const deadlineStatus = (reg, event, allEventRegs = []) => {
  const remaining = remainingDeadlineDays(reg, event, allEventRegs);
  return remaining === null ? null : statusFromRemaining(remaining);
};

// Semitone value of a note string like "C4", "F#3", "Bb2"
// Returns -1 for invalid input so callers can guard on >= 0.
const _NOTE_ST = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const noteToSemitones = (note) => {
  const m = (note || "").match(/^([A-G])([#b]?)([0-8])$/);
  if (!m) return -1;
  return parseInt(m[3]) * 12 + _NOTE_ST[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
};

// Valid note: letter A-G (uppercase), optional # or b, octave digit 0-8
export const NOTE_REGEX = /^[A-G][#b]?[0-8]$/;
export const isValidNote = (s) => NOTE_REGEX.test(s || "");

// Normalise raw typed input: uppercase first letter, strip illegal chars, cap at 3 chars
export const normalizeNote = (raw) => {
  const s = (raw || "").replace(/[^A-Ga-g#b0-8]/g, "").slice(0, 3);
  return s ? s[0].toUpperCase() + s.slice(1) : "";
};

// Returns voice type names whose range overlaps with the member's [lowestNote, highestNote]
export const classifyVoice = (lowestNote, highestNote, voiceTypes) => {
  if (!lowestNote || !highestNote || !voiceTypes?.length) return [];
  const low  = noteToSemitones(lowestNote);
  const high = noteToSemitones(highestNote);
  if (low < 0 || high < 0 || low > high) return [];
  return voiceTypes
    .filter((v) => {
      const vMin = noteToSemitones(v.minNote || v.min_note);
      const vMax = noteToSemitones(v.maxNote || v.max_note);
      return vMin >= 0 && vMax >= 0 && low <= vMax && high >= vMin;
    })
    .map((v) => v.name);
};

export const ROLE_BADGE = {
  Pastor: "badge-purple",
  Ungido: "badge-blue",
  Diácono: "badge-green",
  "Professor de Seminário": "badge-yellow",
  "": "badge-gray",
};

export const STATUS_CFG = {
  not_registered: { dot: "dot-gray", badge: "badge-gray" },
  pending: { dot: "dot-yellow", badge: "badge-yellow" },
  confirmed: { dot: "dot-green", badge: "badge-green" },
};
