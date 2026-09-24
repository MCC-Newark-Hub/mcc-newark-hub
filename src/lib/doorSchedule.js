// Escala de Portaria: calendar helpers and the schedule generator (pure functions, no I/O).

// Service days shown as columns of the availability matrix, in display order.
// Sunday holds two services: the EBD (morning) and the Domingo service.
export const DOOR_SLOTS = ["mon", "tue", "wed", "thu", "sat", "ebd", "sun"];

// Which service slots happen on each JS weekday (0 = Sunday). Friday has no service.
const SLOTS_BY_WEEKDAY = { 0: ["ebd", "sun"], 1: ["mon"], 2: ["tue"], 3: ["wed"], 4: ["thu"], 6: ["sat"] };

// Service slots of one date ("2026-10-04" → ["ebd", "sun"]); empty on Fridays.
export const slotsOnDate = (date) => SLOTS_BY_WEEKDAY[new Date(date + "T12:00:00").getDay()] || [];

const pad = (n) => String(n).padStart(2, "0");
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const isMonthKey = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || "");
export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

// Every service of the month: [{ date: "2026-10-04", slot: "ebd" }, ...] in chronological order.
export function monthServices(key) {
  const [y, m] = key.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const date = `${key}-${pad(d)}`;
    for (const slot of SLOTS_BY_WEEKDAY[new Date(y, m - 1, d).getDay()] || []) out.push({ date, slot });
  }
  return out;
}

// Calendar grid for a month: weeks (Sunday first) of { date, day } or null for padding cells.
export function monthGrid(key) {
  const [y, m] = key.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const cells = Array(new Date(y, m - 1, 1).getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push({ date: `${key}-${pad(d)}`, day: d });
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Week (Sunday to Saturday) a date belongs to, as the date of its Sunday.
const weekOf = (date) => {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayNumber = (date) => Math.round(new Date(date + "T12:00:00").getTime() / 86400000);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Penalties (lower total = better candidate). Availability is a hard rule; these are preferences.
const W = {
  sameDay: 200,   // already on another service of the same day (EBD + Domingo)
  sameWeek: 100,  // already on the door this week
  sameSlotRepeat: 25, // was on the door the last time this same weekday came around
  load: 60,       // share of their own available services already taken (fairness)
  rest: 1,        // per day since their last turn, capped: rewards long rests
};

/**
 * Builds the month's schedule.
 * workers: [{ id, name, days: string[] }]  (only active ones)
 * services: monthServices(key)
 * Returns { assignments: [{ date, slot, workerId, workerName }], uncovered: [{ date, slot, missing }], counts: Map<workerId, n> }
 *
 * Services with the fewest eligible workers are filled first, so someone who can only do Wednesdays
 * is not "used up" elsewhere. Each pick minimises repeats in the same week / same weekday and keeps
 * the load proportional to how many services each person can actually cover. A service nobody
 * can cover is reported in `uncovered` instead of being forced.
 */
export function generateSchedule(workers, services, { perService = 1, seed = 1 } = {}) {
  const rand = rng(seed);
  const eligible = (s) => workers.filter((w) => (w.days || []).includes(s.slot));
  const capacityOf = new Map(workers.map((w) => [w.id, Math.max(1, services.filter((s) => (w.days || []).includes(s.slot)).length)]));

  const order = services
    .map((s, i) => ({ ...s, i, n: eligible(s).length, tie: rand() }))
    .sort((a, b) => a.n - b.n || a.tie - b.tie || a.i - b.i);

  const taken = new Map(workers.map((w) => [w.id, []])); // worker -> [{ date, slot }]
  const assigned = new Map(); // "date|slot" -> workers
  const uncovered = [];

  const cost = (w, s) => {
    const mine = taken.get(w.id);
    let c = (mine.length / capacityOf.get(w.id)) * W.load;
    let lastGap = 30;
    let lastSameSlot = null;
    for (const t of mine) {
      if (t.date === s.date) c += W.sameDay;
      else if (weekOf(t.date) === weekOf(s.date)) c += W.sameWeek;
      lastGap = Math.min(lastGap, Math.abs(dayNumber(t.date) - dayNumber(s.date)));
      if (t.slot === s.slot && (!lastSameSlot || Math.abs(dayNumber(t.date) - dayNumber(s.date)) < lastSameSlot)) {
        lastSameSlot = Math.abs(dayNumber(t.date) - dayNumber(s.date));
      }
    }
    if (lastSameSlot !== null && lastSameSlot <= 7) c += W.sameSlotRepeat;
    return c - Math.min(lastGap, 14) * W.rest + rand() * 0.5;
  };

  for (const s of order) {
    const chosen = [];
    for (let k = 0; k < perService; k++) {
      const pool = eligible(s).filter((w) => !chosen.includes(w));
      if (!pool.length) break;
      const best = pool.map((w) => ({ w, c: cost(w, s) })).sort((a, b) => a.c - b.c)[0].w;
      chosen.push(best);
      taken.get(best.id).push({ date: s.date, slot: s.slot });
    }
    assigned.set(`${s.date}|${s.slot}`, chosen);
    if (chosen.length < perService) uncovered.push({ date: s.date, slot: s.slot, missing: perService - chosen.length });
  }

  const assignments = [];
  for (const s of services) {
    for (const w of assigned.get(`${s.date}|${s.slot}`) || []) assignments.push({ date: s.date, slot: s.slot, workerId: w.id, workerName: w.name });
  }
  const counts = new Map(workers.map((w) => [w.id, taken.get(w.id).length]));
  uncovered.sort((a, b) => a.date.localeCompare(b.date) || DOOR_SLOTS.indexOf(a.slot) - DOOR_SLOTS.indexOf(b.slot));
  return { assignments, uncovered, counts };
}

// Groups rows { service_date, slot, worker_name } by date → slot → names, for the calendar.
export function groupByDate(rows) {
  const out = new Map();
  for (const r of rows) {
    const day = out.get(r.service_date) || {};
    (day[r.slot] = day[r.slot] || []).push(r.worker_name);
    out.set(r.service_date, day);
  }
  return out;
}
