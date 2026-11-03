// Pausing registrations (events.registration_paused + registration_pause_mode, migration 042).
//   "full":     nobody registers, not even to the waitlist.
//   "waitlist": new registrations go to the waitlist; on resume they move to the main
//               list while spots remain.
export const PAUSE_FULL = "full";
export const PAUSE_WAITLIST = "waitlist";
export const PAUSED_WAITLIST_REASON = "Inscrições pausadas";

export const pauseModeOf = (event) => (event?.registration_pause_mode === PAUSE_WAITLIST ? PAUSE_WAITLIST : PAUSE_FULL);

// Waitlist reasons that only mean "there was no open spot": moved up on resume. Staff
// decisions ("manual", "Prazo encerrado") stay where they are.
const PROMOTABLE_REASONS = new Set(["Capacidade esgotada", PAUSED_WAITLIST_REASON]);

// The waitlisted registrations to move to the main list when registrations resume:
// oldest first, while spots remain. A submission (family) moves together, or waits
// together if it doesn't fit.
export function waitlistToPromote(regs, event) {
  if (!event) return [];
  const mine = (regs || []).filter((r) => r.eventId === event.id && !r.cancelled);
  const active = mine.filter((r) => !r.waitlisted).length;
  let free = event.capacity ? Math.max(0, event.capacity - active) : Infinity;
  const waiting = mine
    .filter((r) => r.waitlisted && PROMOTABLE_REASONS.has(r.waitlistReason || "Capacidade esgotada"))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.regNumber).localeCompare(String(b.regNumber)));

  // Group by submission: PREFIX-MMDD-NNN-P → PREFIX-MMDD-NNN.
  const groups = [];
  const byKey = new Map();
  for (const r of waiting) {
    const key = String(r.regNumber || r.id).replace(/-\d+$/, "");
    if (!byKey.has(key)) {
      byKey.set(key, []);
      groups.push(byKey.get(key));
    }
    byKey.get(key).push(r);
  }
  const ids = [];
  for (const g of groups) {
    if (g.length > free) continue;
    free -= g.length;
    ids.push(...g.map((r) => r.id));
  }
  return ids;
}
