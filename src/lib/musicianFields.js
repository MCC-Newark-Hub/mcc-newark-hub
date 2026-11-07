// Voice type and instruments live in members.voice_type / members.instruments; the team
// lists, the leader's view and the member editor read them there. The function pickers
// (Funções, Membros › Funções, the member editors) still offer them next to the other
// functions, so these helpers translate between the picker's single list and the fields.

export const VOICE_TYPES = ["Soprano", "Mezzo-Soprano", "Contralto", "Tenor", "Barítono", "Baixo"];
export const INSTRUMENTS = ["Violão", "Guitarra", "Baixo Elétrico", "Bateria", "Percussão", "Teclado", "Piano", "Flauta", "Violino", "Trompete", "Saxofone"];

// The catalog in Diretório › Voluntários › Instrumentos replaces the default list above, in its
// order. INSTRUMENTS is updated in place so every picker that holds it sees new instruments.
export function setInstrumentCatalog(names) {
  const list = [...new Set((names || []).map((n) => (n || "").trim()).filter(Boolean))];
  if (list.length) INSTRUMENTS.splice(0, INSTRUMENTS.length, ...list);
}

// Old function names that mean a voice type.
const VOICE_ALIASES = { Mezzo: "Mezzo-Soprano" };

const asVoice = (r) => VOICE_ALIASES[r] || (VOICE_TYPES.includes(r) ? r : null);
export const isMusicPick = (r) => !!asVoice(r) || INSTRUMENTS.includes(r);

// A picker's list → { roles, voice_type, instruments } for the members row.
// With several voices picked, the last one wins.
export function musicRow(picks) {
  const roles = [];
  let voice = null;
  const instruments = [];
  for (const r of picks || []) {
    const v = asVoice(r);
    if (v) voice = v;
    else if (INSTRUMENTS.includes(r)) { if (!instruments.includes(r)) instruments.push(r); }
    else if (!roles.includes(r)) roles.push(r);
  }
  return { roles, voice_type: voice, instruments };
}

// A member → the picker's list: functions plus voice type and instruments.
export function musicPicks(member) {
  const own = musicRow(member?.roles);
  return [
    ...own.roles,
    ...(member?.voiceType || own.voice_type ? [member?.voiceType || own.voice_type] : []),
    ...new Set([...(member?.instruments || []), ...own.instruments]),
  ];
}

// Member-editor form whose functions field just changed: voice and instrument picks
// move into the form's own voice and instrument fields.
export function applyMusicPicks(form, picks) {
  const row = musicRow(picks);
  return {
    ...form,
    roles: row.roles,
    voiceType: row.voice_type || form.voiceType || "",
    instruments: [...new Set([...(form.instruments || []), ...row.instruments])],
  };
}
