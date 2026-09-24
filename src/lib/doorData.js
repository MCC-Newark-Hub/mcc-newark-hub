import { sb } from "@/lib/supabase";

// Data access for the door schedule (Escalas › Portaria and the public /portaria page).
export const DOOR_PUBLIC_PATH = "/portaria";

export async function fetchMonth(month) {
  const [m, rows] = await Promise.all([
    sb.from("door_months").select("*").eq("month", month).maybeSingle(),
    sb.from("door_assignments").select("*").eq("month", month).order("service_date").order("created_at"),
  ]);
  return { info: m.data || null, rows: rows.data || [], error: m.error || rows.error || null };
}

// Swaps a month's assignments for `rows`. The client can't run a transaction, so the old rows are
// kept in hand and put back if the insert fails — a published month is never left empty.
export async function replaceMonthAssignments(month, rows) {
  const old = await sb.from("door_assignments").select("*").eq("month", month);
  if (old.error) return { data: null, error: old.error };
  const del = await sb.from("door_assignments").delete().eq("month", month);
  if (del.error) return { data: null, error: del.error };
  if (!rows.length) return { data: [], error: null };
  const ins = await sb.from("door_assignments").insert(rows).select();
  if (!ins.error) return { data: ins.data || [], error: null };
  if (old.data?.length) {
    const back = await sb.from("door_assignments").insert(old.data);
    if (back.error) console.error("door assignments restore error:", back.error);
  }
  return { data: null, error: ins.error };
}

export async function fetchWorkers() {
  const { data, error } = await sb.from("door_workers").select("*").order("name");
  return { workers: data || [], error };
}
