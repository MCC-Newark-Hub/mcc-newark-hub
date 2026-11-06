// Registrations reloaded from the database (the app came back to the screen, or the live
// connection reconnected) replace the local list, except our own optimistic entries
// ("tmp-…" ids) whose insert hasn't been confirmed yet.
export function mergeFreshRegs(local, fresh) {
  const numbers = new Set((fresh || []).map((r) => r.regNumber));
  const pending = (local || []).filter((r) => String(r.id || "").startsWith("tmp-") && !numbers.has(r.regNumber));
  return [...(fresh || []), ...pending];
}
