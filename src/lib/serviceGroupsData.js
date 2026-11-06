import { sb } from "@/lib/supabase";

// Data access for Culto Profético › Grupos (staff tab) and the praise-list pages (read only).
const EMPTY = { groups: [], workers: [], schedule: [] };

// A church's groups, their workers and its weekly schedule. Without a church, every church's.
export async function fetchServiceGroups(church) {
  let groupsQ = sb.from("service_groups").select("*").order("name");
  let scheduleQ = sb.from("service_group_schedule").select("*");
  if (church) { groupsQ = groupsQ.eq("church", church); scheduleQ = scheduleQ.eq("church", church); }
  const [g, w, s] = await Promise.all([groupsQ, sb.from("service_group_workers").select("*").order("position"), scheduleQ]);
  const error = g.error || w.error || s.error || null;
  if (error) return { data: EMPTY, error };
  const ids = new Set((g.data || []).map((x) => x.id));
  return { data: { groups: g.data || [], workers: (w.data || []).filter((x) => ids.has(x.group_id)), schedule: s.data || [] }, error: null };
}

// Creates or updates a group, then replaces its workers (in the order given).
export async function saveServiceGroup(group, workers) {
  const row = {
    church: group.church,
    name: String(group.name || "").trim(),
    leader_member_id: group.leader_member_id || null,
    leader_name: group.leader_name ? String(group.leader_name).trim() : null,
    is_active: group.is_active !== false,
  };
  const res = group.id
    ? await sb.from("service_groups").update(row).eq("id", group.id).select().single()
    : await sb.from("service_groups").insert(row).select().single();
  if (res.error || !res.data) return { data: null, error: res.error || { message: "group not saved" } };
  const saved = res.data;
  if (group.id) {
    const del = await sb.from("service_group_workers").delete().eq("group_id", saved.id);
    if (del.error) return { data: null, error: del.error };
  }
  const rows = (workers || []).map((w, i) => ({ group_id: saved.id, member_id: w.member_id || null, name: String(w.name).trim(), position: i }));
  if (!rows.length) return { data: { group: saved, workers: [] }, error: null };
  const ins = await sb.from("service_group_workers").insert(rows).select();
  if (ins.error) return { data: null, error: ins.error };
  return { data: { group: saved, workers: ins.data || rows }, error: null };
}

export async function deleteServiceGroup(id) {
  const { data, error } = await sb.from("service_groups").delete().eq("id", id).select();
  if (error) return { error };
  return { error: data?.length ? null : { message: "group not found" } };
}

// Puts a group on a slot; null takes the slot's group away (deleting a slot that was empty is fine).
export async function setScheduleSlot(church, slot, groupId) {
  if (!groupId) {
    const { error } = await sb.from("service_group_schedule").delete().eq("church", church).eq("slot", slot).select();
    return { error };
  }
  const { data, error } = await sb.from("service_group_schedule").upsert({ church, slot, group_id: groupId }, { onConflict: "church,slot" }).select();
  if (error) return { error };
  return { error: data?.length ? null : { message: "slot not saved" } };
}
