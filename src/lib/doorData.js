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

export async function fetchWorkers() {
  const { data, error } = await sb.from("door_workers").select("*").order("name");
  return { workers: data || [], error };
}
