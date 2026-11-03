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

// Week (Monday to Sunday, the church week) a date belongs to, as the date of its Monday.
// EBD and the Sunday service close the week that began on the Monday before.
export const weekOf = (date) => {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
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

/**
 * Builds the month's schedule.
 * workers: [{ id, name, days: string[] }]  (only active ones)
 * services: monthServices(key)
 * history: [{ date, slot, workerId }] already on the door around this month (the previous month
 *   and, if generated, the next one), so the rules hold across the month boundary.
 * Returns { assignments: [{ date, slot, workerId, workerName }], uncovered: [{ date, slot, missing }],
 *   exceptions: [{ date, slot, workerId, workerName, rule: "week" | "consecutive" }], counts: Map<workerId, n> }
 *
 * Rules, in order (a later one never overrides an earlier one):
 *   0. only people who marked that service day (hard rule);
 *   1. nobody twice in the same Monday–Sunday week (both Sunday services count);
 *   2. nobody on the same service day in consecutive weeks;
 *   3. the load stays proportional to how many services each person can cover;
 *   4. among equally good candidates, the pick is random, so generating again gives another schedule.
 * Rules 1 and 2 are broken only when every available person breaks them, and every such case is
 * reported in `exceptions`. Services with the fewest available people are filled first, so someone
 * who can only do Wednesdays is not used up elsewhere. A service nobody can cover goes to `uncovered`.
 */
export function generateSchedule(workers, services, { perService = 1, seed = 1, history = [], attempts = 200 } = {}) {
  // Picking one service at a time can paint itself into a corner (a later service left with only
  // people who would break a rule), so the month is drawn many times and the draw with the fewest
  // broken rules wins (then the fairest). Every draw is random, so the result still changes on
  // every "Gerar novamente"; the same seed gives the same schedule.
  const pick = rng(seed);
  let best = null;
  for (let i = 0; i < attempts; i++) {
    const r = drawSchedule(workers, services, { perService, seed: Math.floor(pick() * 4294967296), history });
    const weekBreaks = r.exceptions.filter((e) => e.rule === "week").length;
    const loads = workers.map((w) => r.counts.get(w.id) / Math.max(1, services.filter((s) => (w.days || []).includes(s.slot)).length));
    const spread = loads.length ? Math.max(...loads) - Math.min(...loads) : 0;
    const key = [weekBreaks, r.exceptions.length - weekBreaks, spread];
    if (!best || lexLess(key, best.key)) best = { r, key };
    if (!best.key[0] && !best.key[1] && i >= 20) break; // no broken rules: good enough
  }
  return best.r;
}

// a < b, comparing element by element.
function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

// One random draw of the month (see generateSchedule).
function drawSchedule(workers, services, { perService, seed, history }) {
  const rand = rng(seed);
  const eligible = (s) => workers.filter((w) => (w.days || []).includes(s.slot));
  const capacityOf = new Map(workers.map((w) => [w.id, Math.max(1, services.filter((s) => (w.days || []).includes(s.slot)).length)]));

  const order = services
    .map((s, i) => ({ ...s, i, n: eligible(s).length, tie: rand() }))
    .sort((a, b) => a.n - b.n || a.tie - b.tie || a.i - b.i);

  const taken = new Map(workers.map((w) => [w.id, []])); // worker -> [{ date, slot }] in this month
  const around = new Map(workers.map((w) => [w.id, []])); // worker -> history entries
  for (const h of history) if (around.has(h.workerId)) around.get(h.workerId).push(h);
  const assigned = new Map(); // "date|slot" -> workers
  const uncovered = [];
  const exceptions = [];

  // Smaller is better, compared key by key.
  const score = (w, s) => {
    const all = taken.get(w.id).concat(around.get(w.id));
    const week = weekOf(s.date);
    let weekRepeats = 0;
    let consecutive = 0;
    for (const t of all) {
      if (weekOf(t.date) === week) weekRepeats++;
      if (t.slot === s.slot && Math.abs(dayNumber(t.date) - dayNumber(s.date)) === 7) consecutive++;
    }
    // Share of their own available services already given; equal shares tie and are drawn at random.
    const load = taken.get(w.id).length / capacityOf.get(w.id);
    return [weekRepeats, consecutive, load, rand()];
  };

  for (const s of order) {
    const chosen = [];
    for (let k = 0; k < perService; k++) {
      const pool = eligible(s).filter((w) => !chosen.includes(w));
      if (!pool.length) break;
      let best = null;
      for (const w of pool) {
        const sc = score(w, s);
        if (!best || lexLess(sc, best.sc)) best = { w, sc };
      }
      chosen.push(best.w);
      taken.get(best.w.id).push({ date: s.date, slot: s.slot });
      if (best.sc[0] > 0) exceptions.push({ date: s.date, slot: s.slot, workerId: best.w.id, workerName: best.w.name, rule: "week" });
      else if (best.sc[1] > 0) exceptions.push({ date: s.date, slot: s.slot, workerId: best.w.id, workerName: best.w.name, rule: "consecutive" });
    }
    assigned.set(`${s.date}|${s.slot}`, chosen);
    if (chosen.length < perService) uncovered.push({ date: s.date, slot: s.slot, missing: perService - chosen.length });
  }

  const assignments = [];
  for (const s of services) {
    for (const w of assigned.get(`${s.date}|${s.slot}`) || []) assignments.push({ date: s.date, slot: s.slot, workerId: w.id, workerName: w.name });
  }
  const counts = new Map(workers.map((w) => [w.id, taken.get(w.id).length]));
  const bySlot = (a, b) => a.date.localeCompare(b.date) || DOOR_SLOTS.indexOf(a.slot) - DOOR_SLOTS.indexOf(b.slot);
  uncovered.sort(bySlot);
  exceptions.sort(bySlot);
  return { assignments, uncovered, exceptions, counts };
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
