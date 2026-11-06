// Registration pace for one event: running total, registrations per hour and the speed of
// each phase between openings and pauses. Pure functions; times are epoch milliseconds.

const HOUR = 36e5;

// Active registrations of the event in order, with who made them.
// "Sistema" is the public form; anyone else is staff or a leader.
export function paceTimeline(regs, eventId) {
  return (regs || [])
    .filter((r) => r.eventId === eventId && !r.cancelled && r.registeredAtTs)
    .map((r) => ({ t: Date.parse(r.registeredAtTs), viaPublic: r.registeredBy === "Sistema" }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
    .map((p, i) => ({ ...p, total: i + 1 }));
}

// Openings and pauses: the first registration, then each pause/resume from the audit log.
// `log` rows are { action, created_at } with action registrations_paused / registrations_resumed.
export function paceMarks(timeline, log) {
  const marks = [];
  if (timeline.length) marks.push({ kind: "opened", t: timeline[0].t });
  for (const row of log || []) {
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t)) continue;
    if (row.action === "registrations_paused") marks.push({ kind: "paused", t });
    else if (row.action === "registrations_resumed") marks.push({ kind: "reopened", t });
  }
  return marks.sort((a, b) => a.t - b.t);
}

// Paused stretches as [from, to] (to = now while still paused).
export function pauseSpans(marks, now) {
  const spans = [];
  let from = null;
  for (const m of marks) {
    if (m.kind === "paused" && from == null) from = m.t;
    else if (m.kind === "reopened" && from != null) { spans.push([from, m.t]); from = null; }
  }
  if (from != null) spans.push([from, now]);
  return spans;
}

// One row per phase: from each mark to the next (the last runs to now).
export function phaseStats(timeline, marks, now) {
  return marks.map((m, i) => {
    const to = i + 1 < marks.length ? marks[i + 1].t : now;
    const count = timeline.filter((p) => p.t >= m.t && p.t < to).length;
    const hours = Math.max(0, (to - m.t) / HOUR);
    const perHour = hours > 0 ? count / hours : null;
    return { kind: m.kind, from: m.t, to, ongoing: i + 1 === marks.length, hours, count, perHour };
  });
}

// Registrations per clock hour from the first one to now, empty hours included.
export function hourlyBuckets(timeline, now) {
  if (!timeline.length) return [];
  const key = (t) => Math.floor(t / HOUR) * HOUR;
  const byHour = new Map();
  for (const p of timeline) {
    const k = key(p.t);
    const b = byHour.get(k) || { t: k, viaPublic: 0, viaStaff: 0 };
    if (p.viaPublic) b.viaPublic += 1; else b.viaStaff += 1;
    byHour.set(k, b);
  }
  const out = [];
  for (let k = key(timeline[0].t); k <= key(Math.max(now, timeline[timeline.length - 1].t)); k += HOUR) {
    const b = byHour.get(k) || { t: k, viaPublic: 0, viaStaff: 0 };
    out.push({ ...b, total: b.viaPublic + b.viaStaff });
  }
  return out;
}

// The n busiest hours, busiest first (ties: earlier first).
export function peakHours(buckets, n = 3) {
  return buckets.filter((b) => b.total > 0).sort((a, b) => b.total - a.total || a.t - b.t).slice(0, n);
}
