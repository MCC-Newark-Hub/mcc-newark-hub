import { sb } from "@/lib/supabase";
import { CATEGORIES } from "@/constants";

// Numbers for the public dashboard (/events/painel), from the event_public_stats RPC
// (migration 041). Aggregates only: no names and nothing about money.
export async function fetchPublicStats(eventId) {
  const { data, error } = await sb.rpc("event_public_stats", { p_event_id: eventId || null });
  if (error) return { stats: null, error };
  return { stats: data || null, error: null };
}

export const TOP_CHURCHES = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const count = (v) => Math.max(0, Number(v) || 0);

// Whole days from today to the deadline (both "YYYY-MM-DD"); 0 on the deadline day.
export function daysUntil(date, today) {
  if (!date || !today) return null;
  return Math.round((Date.parse(`${String(date).slice(0, 10)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS);
}

// "Newark, NJ" -> "Newark".
export const shortChurch = (name) => String(name || "").split(",")[0].trim();

// What the dashboard draws. stage: open < 70% <= filling < 90% <= almost < 100% = full.
export function summarizeStats(stats, today) {
  if (!stats) return null;
  const capacity = count(stats.capacity);
  const active = count(stats.active);
  const waitlist = count(stats.waitlist);
  const left = capacity ? Math.max(0, capacity - active) : null;
  const pct = capacity ? Math.min(100, Math.round((active / capacity) * 100)) : null;
  const full = capacity > 0 && active >= capacity;
  const stage = !capacity ? "open" : full ? "full" : pct >= 90 ? "almost" : pct >= 70 ? "filling" : "open";

  const daysToDeadline = daysUntil(stats.registration_deadline, today);
  const closed = !!stats.paused || !!stats.locked || (daysToDeadline !== null && daysToDeadline < 0);

  const byCat = stats.by_category || {};
  const waitCat = stats.waitlist_by_category || {};
  const known = new Set(CATEGORIES);
  const categories = CATEGORIES.map((c) => ({ key: c, count: count(byCat[c]), waitlist: count(waitCat[c]) }));
  const otherCat = Object.keys({ ...byCat, ...waitCat }).filter((k) => !known.has(k));
  if (otherCat.length) {
    categories.push({
      key: "",
      count: otherCat.reduce((s, k) => s + count(byCat[k]), 0),
      waitlist: otherCat.reduce((s, k) => s + count(waitCat[k]), 0),
    });
  }

  const sorted = Object.entries(stats.by_church || {})
    .map(([name, n]) => ({ name, count: count(n) }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  // A blank church goes with the rest.
  const named = sorted.filter((c) => c.name);
  const top = named.slice(0, TOP_CHURCHES);
  const rest = named.slice(TOP_CHURCHES).concat(sorted.filter((c) => !c.name));
  const churches = rest.length ? [...top, { name: "", count: rest.reduce((s, c) => s + c.count, 0), other: true }] : top;

  return {
    eventId: stats.event_id,
    name: stats.name || "",
    date: stats.date || null,
    time: stats.time || "",
    location: stats.location || "",
    deadline: stats.registration_deadline || null,
    capacity,
    active,
    waitlist,
    left,
    pct,
    full,
    stage,
    daysToDeadline,
    closed,
    categories,
    churches,
  };
}
