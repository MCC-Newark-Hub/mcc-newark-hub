// EVT001, EVT002… one past the highest existing number. Counting the list instead
// reused an id whenever an older event had been deleted.
export function nextEventId(events) {
  const max = (events || []).reduce((m, e) => Math.max(m, Number(String(e.id).replace(/^EVT/, "")) || 0), 0);
  return "EVT" + String(max + 1).padStart(3, "0");
}
