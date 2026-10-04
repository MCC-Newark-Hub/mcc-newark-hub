// Supabase access for the Organograma's responsibles. Every function resolves to { data, error } and never throws.
import { sb } from "@/lib/supabase";

const UNIQUE_VIOLATION = "23505";

export async function fetchResponsibles() {
  const { data, error } = await sb.from("org_responsibles").select("*").order("created_at");
  return { data: data || [], error };
}

// member: a directory member ({ id, name }) or null when only a typed name is given.
export async function addResponsible({ scope, ref, kind, member, name }) {
  const row = { scope, ref: String(ref), kind, member_id: member?.id || null, name: (member?.name || name || "").trim() };
  if (!row.name) return { data: null, error: { code: "empty_name", message: "Name required" } };
  const { data, error } = await sb.from("org_responsibles").insert(row).select().single();
  if (error) return { data: null, error: error.code === UNIQUE_VIOLATION ? { ...error, code: "duplicate" } : error };
  return { data, error: null };
}

export async function removeResponsible(id) {
  const { data, error } = await sb.from("org_responsibles").delete().eq("id", id).select();
  if (error) return { data: null, error };
  if (!data?.length) return { data: null, error: { code: "not_found", message: "No row deleted" } };
  return { data, error: null };
}
