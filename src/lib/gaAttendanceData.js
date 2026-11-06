// Chamada do GA: database calls. Staff only (the signed-in Hub client); the date window and the GA scope are checked by
// the app (gaAttendance.js) — enforcing them on the server belongs to the RLS phase of the security plan.
import { sb } from "@/lib/supabase";
import { cleanPresent, cleanVisitors } from "@/lib/gaAttendance";

const COLS = "id,ga_id,church,service_date,service_type,roster_ids,present_ids,visitors,notes,entered_by_user_id,entered_by_name,created_at,updated_at";

export async function fetchAttendance(gaId, date, type) {
  const { data, error } = await sb.from("ga_attendance").select(COLS)
    .eq("ga_id", gaId).eq("service_date", date).eq("service_type", type).maybeSingle();
  return { data: data || null, error: error ? error.message : null };
}

export async function listAttendance(gaId, from) {
  const { data, error } = await sb.from("ga_attendance").select(COLS)
    .eq("ga_id", gaId).gte("service_date", from).order("service_date", { ascending: false });
  return { data: data || [], error: error ? error.message : null };
}

const one = ({ data, error }) => {
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { data: row, error: null } : { data: null, error: "not_found" };
};

// One row per GA + service. A new one is inserted; one loaded from the database is updated only if nobody saved it
// since (updated_at unchanged). Either way, someone else's save in between comes back as error "changed", so it is
// never silently overwritten.
export async function saveAttendance(row, { loadedAt } = {}) {
  const roster = [...new Set(row.roster_ids || [])];
  const fields = {
    ga_id: row.ga_id, church: row.church, service_date: row.service_date, service_type: row.service_type,
    roster_ids: roster, present_ids: cleanPresent(row.present_ids, roster), visitors: cleanVisitors(row.visitors),
    notes: String(row.notes || "").trim() || null,
    entered_by_user_id: row.entered_by_user_id != null ? String(row.entered_by_user_id) : null,
    entered_by_name: String(row.entered_by_name || "").slice(0, 120), updated_at: new Date().toISOString(),
  };
  if (row.id) {
    let query = sb.from("ga_attendance").update(fields).eq("id", row.id);
    if (loadedAt) query = query.eq("updated_at", loadedAt);
    const res = one(await query.select(COLS));
    return res.error === "not_found" ? { data: null, error: "changed" } : res;
  }
  const res = await sb.from("ga_attendance").insert(fields).select(COLS);
  if (res.error?.code === "23505") return { data: null, error: "changed" };
  return one(res);
}

export async function deleteAttendance(id) {
  return one(await sb.from("ga_attendance").delete().eq("id", id).select(COLS));
}
