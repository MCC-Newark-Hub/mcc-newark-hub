// Allergies and special needs in the public form. One person: one description. Several
// (a family): pick who has it, each with their own description — never copied to the
// whole family. state: { hasAny, other, who: { [personId]: description } }.
export const emptyHealth = () => ({ hasAny: false, other: "", who: {} });

// What to record for one person ("" = nothing).
export function personHealth(state, personId, single) {
  if (!state?.hasAny) return "";
  if (single) return (state.other || "").trim();
  return personId in (state.who || {}) ? (state.who[personId] || "").trim() : "";
}

// Why the section can't be saved yet: "pick" (nobody chosen), "describe" (a chosen person
// without a description) or null.
export function healthProblem(state, single) {
  if (!state?.hasAny) return null;
  if (single) return (state.other || "").trim() ? null : "describe";
  const ids = Object.keys(state.who || {});
  if (!ids.length) return "pick";
  return ids.some((id) => !(state.who[id] || "").trim()) ? "describe" : null;
}

// Keep only people still in the registration (someone removed from the family is dropped).
export function pruneHealth(state, people) {
  const ids = new Set((people || []).map((p) => p.id));
  const who = Object.fromEntries(Object.entries(state?.who || {}).filter(([id]) => ids.has(id)));
  return { ...state, who };
}

// The registration note for one person: batch token, then their own allergies / needs.
export function healthNote(batchId, allergies, specialNeeds, personId, single) {
  const a = personHealth(allergies, personId, single);
  const n = personHealth(specialNeeds, personId, single);
  return ["[" + batchId + "]", a ? "Alergias: " + a : "", n ? "Nec. especiais: " + n : ""].filter(Boolean).join(" | ");
}
