// EVT001, EVT002… one past the highest existing number. Counting the list instead
// reused an id whenever an older event had been deleted.
export function nextEventId(events) {
  const max = (events || []).reduce((m, e) => Math.max(m, Number(String(e.id).replace(/^EVT/, "")) || 0), 0);
  return "EVT" + String(max + 1).padStart(3, "0");
}

// The event a device opens on: the one it last used, unless that one is already over,
// else the next upcoming active event, else the latest one. today: "YYYY-MM-DD".
export function pickCurrentEvent(events, storedId, today) {
  const list = events || [];
  const stored = storedId && list.find((e) => e.id === storedId);
  if (stored && (stored.date || "") >= today) return stored;
  const upcoming = list
    .filter((e) => e.status === "active" && (e.date || "") >= today)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (upcoming.length) return upcoming[0];
  return [...list].sort((a, b) => (a.date || "").localeCompare(b.date || "")).pop() || null;
}
