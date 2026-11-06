import { sb } from "@/lib/supabase";
import { OBREIRO_ROLES } from "@/constants";
import { INSTRUMENTS, VOICE_TYPES, musicRow } from "@/lib/musicianFields";

// A member's functions live in members.roles. The older single members.role column
// is still what registration reads (Pastor/Ungido auto-exempt, teamForRole → auto
// roster, badges), so every screen that edits roles must write both, derived the
// same way. Diretório › Funções and Diretório › Membros used to disagree here.

export const SEMINARY_TEACHER_ROLE = "Professor(a) de Seminário";

// Old spellings still stored on some rows → the name in the functions catalogue.
const ROLE_ALIASES = { "Professor de Seminário": SEMINARY_TEACHER_ROLE };

export const canonicalRole = (r) => ROLE_ALIASES[r] || r;

export function normalizeRoles(roles) {
  return [...new Set((roles || []).map(canonicalRole).filter(Boolean))];
}

// Obreiro roles win (in OBREIRO_ROLES order) so the exemption and the service-team
// roster never depend on the order roles were picked in.
export function primaryRole(roles) {
  const list = normalizeRoles(roles);
  return OBREIRO_ROLES.find((r) => list.includes(r)) || list[0] || "";
}

export function memberRoleFields(roles) {
  const list = normalizeRoles(roles);
  return { roles: list, role: primaryRole(list) };
}

export function rolesOf(m) {
  return normalizeRoles(m?.roles?.length ? m.roles : (m?.role ? [m.role] : []));
}

// Optimistic: state first, then the write, verified with .select(). Resolves true
// when the row was saved. `music` ({ voiceType, instruments }) is saved in the same
// write when given; without it the member's voice and instruments are left alone.
export async function saveMemberRoles({ member, roles, music, setMembers, notify }) {
  const fields = memberRoleFields(roles);
  const local = music ? { ...fields, voiceType: music.voiceType || "", instruments: music.instruments || [] } : fields;
  const row = music ? { ...fields, voice_type: music.voiceType || null, instruments: music.instruments || [] } : fields;
  setMembers((p) => p.map((m) => (m.id === member.id ? { ...m, ...local } : m)));
  const { data, error } = await sb.from("members").update(row).eq("id", member.id).select();
  if (error) { notify("Erro: " + error.message); return false; }
  if (!data?.length) { notify("Erro: membro não encontrado — funções não salvas."); return false; }
  return true;
}

// A Funções picker's list (functions plus Vocal/Instrumento picks, see musicPicks):
// the picks go to voice_type / instruments, the rest to roles + role.
export function saveMemberPicks({ member, picks, setMembers, notify }) {
  const { roles, voice_type, instruments } = musicRow(picks);
  return saveMemberRoles({ member, roles, music: { voiceType: voice_type, instruments }, setMembers, notify });
}

// The Funções screens' tabs. Role names must match the functions catalogue
// (ROLE_GROUPS mirrors it); a test keeps them in step.
export const FUNC_GROUPS = [
  { id: "intercessao", label: "Intercessão",        roles: ["Grupo de Intercessão", "Grupo de Oração"] },
  { id: "louvor",      label: "Louvor",             roles: ["Grupo de Louvor", "Instrumentista", "Instrumentista Aprendiz", "Responsável - Grupo de Louvor"],
    roleGroups: [
      { label: "Função",      roles: ["Grupo de Louvor", "Instrumentista", "Instrumentista Aprendiz", "Responsável - Grupo de Louvor"] },
      // Saved in members.voice_type / members.instruments (see saveMemberPicks), not in roles.
      { label: "Vocal",       roles: VOICE_TYPES },
      { label: "Instrumento", roles: INSTRUMENTS },
    ],
  },
  { id: "som",         label: "Som & Projeção",     roles: ["Operador de Som", "Operador de Projeção"] },
  { id: "cias",        label: "Prof. de CIAs",      roles: ["Professor(a) de Crianças", "Professor(a) de Crianças 0-3", "Professor(a) de Intermediários", "Professor(a) de Adolescentes", "Professor(a) - Acessibilidade"] },
  { id: "jovens",      label: "Prof. de Jovens",    roles: ["Professor(a) de Jovens"] },
  { id: "seminario",   label: "Prof. de Seminário", roles: [SEMINARY_TEACHER_ROLE] },
  { id: "ga",          label: "Resp. de GA",        gaLeaders: true },
  { id: "sec_igreja",  label: "Sec. de Igreja",     roles: ["Secretário(a) de Igreja"] },
  { id: "sec_ga",      label: "Sec. de GA",         roles: ["Secretário(a) de GA"] },
  { id: "tesouraria",  label: "Tesouraria",         roles: ["Primeiro Tesoureiro", "Segundo Tesoureiro", "Comissão de Contas"] },
  { id: "traducao",    label: "Tradutores",         roles: ["Tradutor", "Intérprete de Libras"] },
];
