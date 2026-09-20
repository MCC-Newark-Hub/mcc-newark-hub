// Supabase access for the Lista de Louvores. Every function resolves to { data, error } and never throws.
import { sb } from "@/lib/supabase";
import { normalizeCode } from "@/lib/praiseLists";

const UNIQUE_VIOLATION = "23505";

// Whole catalogue, each song with last_sung_on / times_sung merged in from the praise_song_last_sung view.
export async function fetchSongs() {
  const [songsRes, lastRes] = await Promise.all([
    sb.from("praise_songs").select("*").order("title"),
    sb.from("praise_song_last_sung").select("*"),
  ]);
  if (songsRes.error) return { data: [], error: songsRes.error };
  const last = new Map((lastRes.data || []).map((r) => [r.song_id, r]));
  const data = (songsRes.data || []).map((s) => ({
    ...s,
    last_sung_on: last.get(s.id)?.last_sung_on || null,
    times_sung: last.get(s.id)?.times_sung || 0,
  }));
  return { data, error: null };
}

// A duplicate code comes back as error.code === "duplicate_code".
export async function createSong({ code, title, category, theme, status = "pending", createdBy }) {
  const row = {
    code: code ? normalizeCode(code) : null,
    title: title.trim(),
    category,
    theme: theme || null,
    status,
    created_by: createdBy || null,
  };
  const { data, error } = await sb.from("praise_songs").insert(row).select().single();
  if (error) return { data: null, error: error.code === UNIQUE_VIOLATION ? { ...error, code: "duplicate_code" } : error };
  return { data: { ...data, last_sung_on: null, times_sung: 0 }, error: null };
}

export async function updateSong(id, patch) {
  const clean = { ...patch };
  if ("code" in clean) clean.code = clean.code ? normalizeCode(clean.code) : null;
  if ("title" in clean) clean.title = clean.title.trim();
  const { data, error } = await sb.from("praise_songs").update(clean).eq("id", id).select();
  if (error) return { data: null, error: error.code === UNIQUE_VIOLATION ? { ...error, code: "duplicate_code" } : error };
  if (!data?.length) return { data: null, error: { code: "not_found", message: "No row updated" } };
  return { data: data[0], error: null };
}

export async function deleteSong(id) {
  const { data, error } = await sb.from("praise_songs").delete().eq("id", id).select();
  if (error) return { data: null, error };
  if (!data?.length) return { data: null, error: { code: "not_found", message: "No row deleted" } };
  return { data, error: null };
}

const LIST_SELECT = "*, worship_list_items(id, song_id, position)";
const sortItems = (l) => ({ ...l, items: [...(l.worship_list_items || [])].sort((a, b) => a.position - b.position) });

export async function fetchListsByDate(date) {
  const { data, error } = await sb.from("worship_lists").select(LIST_SELECT).eq("service_date", date).order("created_at");
  return { data: (data || []).map(sortItems), error };
}

export async function fetchRecentLists(limit = 20) {
  const { data, error } = await sb.from("worship_lists").select(LIST_SELECT).order("service_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  return { data: (data || []).map(sortItems), error };
}

export async function createList(header, songIds) {
  const { data: list, error } = await sb.from("worship_lists").insert(header).select().single();
  if (error) return { data: null, error };
  if (songIds.length) {
    const rows = songIds.map((song_id, position) => ({ list_id: list.id, song_id, position }));
    const { data: items, error: itemsError } = await sb.from("worship_list_items").insert(rows).select("id, song_id, position");
    if (itemsError) return { data: null, error: itemsError };
    return { data: { ...list, items: items.sort((a, b) => a.position - b.position) }, error: null };
  }
  return { data: { ...list, items: [] }, error: null };
}

export async function updateList(id, patch) {
  const { data, error } = await sb.from("worship_lists").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select();
  if (error) return { data: null, error };
  if (!data?.length) return { data: null, error: { code: "not_found", message: "No row updated" } };
  return { data: data[0], error: null };
}

export async function deleteList(id) {
  const { data, error } = await sb.from("worship_lists").delete().eq("id", id).select();
  if (error) return { data: null, error };
  if (!data?.length) return { data: null, error: { code: "not_found", message: "No row deleted" } };
  return { data, error: null };
}

export async function addListItem(listId, songId, position) {
  const { data, error } = await sb.from("worship_list_items").insert({ list_id: listId, song_id: songId, position }).select("id, song_id, position").single();
  if (error) return { data: null, error: error.code === UNIQUE_VIOLATION ? { ...error, code: "already_in_list" } : error };
  return { data, error: null };
}

export async function removeListItem(itemId) {
  const { data, error } = await sb.from("worship_list_items").delete().eq("id", itemId).select();
  if (error) return { data: null, error };
  if (!data?.length) return { data: null, error: { code: "not_found", message: "No row deleted" } };
  return { data, error: null };
}

// Writes the new positions of every item (after a reorder or a removal).
export async function saveItemPositions(listId, items) {
  if (!items.length) return { data: [], error: null };
  const rows = items.map((it) => ({ id: it.id, list_id: listId, song_id: it.song_id, position: it.position }));
  const { data, error } = await sb.from("worship_list_items").upsert(rows, { onConflict: "id" }).select("id");
  return { data, error };
}

export async function fetchListById(id) {
  const { data, error } = await sb.from("worship_lists").select(LIST_SELECT).eq("id", id).maybeSingle();
  return { data: data ? sortItems(data) : null, error };
}

export async function fetchSongsByIds(ids) {
  if (!ids.length) return { data: [], error: null };
  const { data, error } = await sb.from("praise_songs").select("*").in("id", ids);
  return { data: data || [], error };
}
