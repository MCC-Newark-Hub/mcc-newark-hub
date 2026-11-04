// Frequência de Culto: database calls. The public page uses only the two RPCs of migration 045 (it never reads members
// or the table directly); staff read and write the table with their session.
import { sb } from "@/lib/supabase";
import { cleanCounts } from "@/lib/census";

const COLS = "id,church,service_date,service_type,members_cia,members_adult,visitors_cia,visitors_adult,notes,entered_by_member_id,entered_by_name,created_at,updated_at";

export async function searchCensusMembers(church, query) {
  const text = String(query || "").trim();
  if (!church || text.length < 3) return { data: [], error: null };
  const { data, error } = await sb.rpc("census_member_search", { p_church: church, p_query: text });
  return { data: data || [], error: error ? error.message : null };
}

export async function fetchCensus(church, date, type) {
  const { data, error } = await sb.from("service_census").select(COLS)
    .eq("church", church).eq("service_date", date).eq("service_type", type).maybeSingle();
  return { data: data || null, error: error ? error.message : null };
}

export async function saveCensusPublic({ church, date, type, memberId, counts, notes }) {
  const { data, error } = await sb.rpc("census_save", {
    p_church: church, p_date: date, p_type: type, p_member_id: memberId, p_counts: cleanCounts(counts), p_notes: notes ?? "",
  });
  if (!error) return { data, error: null };
  const msg = error.message || "";
  return { data: null, error: /census_date_not_allowed/.test(msg) ? "date" : /census_member_not_in_church/.test(msg) ? "member" : "other" };
}

export async function listCensus({ from, to, churches }) {
  let query = sb.from("service_census").select(COLS).gte("service_date", from).lte("service_date", to);
  if (churches) query = query.in("church", churches);
  const { data, error } = await query.order("service_date", { ascending: false }).order("service_type");
  return { data: data || [], error: error ? error.message : null };
}

const one = ({ data, error }) => {
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { data: row, error: null } : { data: null, error: "not_found" };
};

export async function upsertCensusStaff(row) {
  const fields = {
    church: row.church, service_date: row.service_date, service_type: row.service_type, ...cleanCounts(row),
    notes: String(row.notes || "").trim() || null, entered_by_member_id: row.entered_by_member_id ?? null,
    entered_by_name: row.entered_by_name, updated_at: new Date().toISOString(),
  };
  if (row.id) return one(await sb.from("service_census").update(fields).eq("id", row.id).select(COLS));
  return one(await sb.from("service_census").insert(fields).select(COLS));
}

export async function deleteCensus(id) {
  return one(await sb.from("service_census").delete().eq("id", id).select(COLS));
}
