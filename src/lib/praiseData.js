// Supabase access for the Lista de Louvores. Every function resolves to { data, error } and never throws.
import { sb } from "@/lib/supabase";
import { normalizeCode, isValidCode, hasNumberPrefix, formatSongTitle } from "@/lib/praiseLists";
import { logAuditEvent, publicActor, deviceInfo } from "@/lib/auditEvent";

const UNIQUE_VIOLATION = "23505";

// The API returns at most 1000 rows per request, so read a table page by page (stable order
// is required for the pages not to overlap or skip rows).
const PAGE_SIZE = 1000;
export async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

// Whole catalogue, each song with its history merged in: last_sung_on / times_sung over every church
// (praise_song_last_sung) and sung_by_church { "Newark, NJ": { last_sung_on, times_sung } } (praise_song_sung_by_church).
export async function fetchSongs() {
  const [songsRes, lastRes, churchRes] = await Promise.all([
    fetchAllRows(() => sb.from("praise_songs").select("*").order("title").order("id")),
    fetchAllRows(() => sb.from("praise_song_last_sung").select("*").order("song_id")),
    fetchAllRows(() => sb.from("praise_song_sung_by_church").select("*").order("song_id").order("church")),
  ]);
  if (songsRes.error) return { data: [], error: songsRes.error };
  const last = new Map((lastRes.data || []).map((r) => [r.song_id, r]));
  const byChurch = new Map();
  for (const r of churchRes.data || []) {
    if (!byChurch.has(r.song_id)) byChurch.set(r.song_id, {});
    byChurch.get(r.song_id)[r.church] = { last_sung_on: r.last_sung_on, times_sung: r.times_sung };
  }
  const data = (songsRes.data || []).map((s) => ({
    ...s,
    last_sung_on: last.get(s.id)?.last_sung_on || null,
    times_sung: last.get(s.id)?.times_sung || 0,
    sung_by_church: byChurch.get(s.id) || {},
  }));
  return { data, error: null };
}

// Merges a duplicate song into the right one (database function, one transaction): the lists that used the
// duplicate now use the right song, and the duplicate is deleted. data = { moved, already_there, from, into }.
export async function mergeSongs(fromId, intoId) {
  const { data, error } = await sb.rpc("merge_praise_songs", { p_from: fromId, p_into: intoId });
  return { data: data || null, error };
}

// Merges a duplicate list of the same service into the one that stays (database function, one transaction).
// data = { songs_added, dropped }.
export async function mergeLists(keepId, dropId) {
  const { data, error } = await sb.rpc("merge_worship_lists", { p_keep: keepId, p_drop: dropId });
  return { data: data || null, error };
}

// Rules every song must follow, whoever saves it: the title never carries the number, and the code (when
// there is one) is PREFIX-NNN. Returns an error object ({ code: "number_in_title" | "invalid_code" }) or null.
export function validateSong({ title, code }) {
  if (hasNumberPrefix(title)) return { code: "number_in_title", message: "The title can't start with a number" };
  if (!isValidCode(code ? normalizeCode(code) : "")) return { code: "invalid_code", message: "The code must look like CL-001" };
  return null;
}

// English songs are always in English, whatever the form says.
const withLanguage = (category, language) => (category === "english" ? "en" : language || "pt");

// A duplicate code comes back as error.code === "duplicate_code".
export async function createSong({ code, title, category, theme, language, status = "pending", createdBy }) {
  const invalid = validateSong({ title, code });
  if (invalid) return { data: null, error: invalid };
  const row = {
    code: code ? normalizeCode(code) : null,
    title: formatSongTitle(title),
    category,
    theme: theme || null,
    language: withLanguage(category, language),
    status,
    created_by: createdBy || null,
  };
  const { data, error } = await sb.from("praise_songs").insert(row).select().single();
  if (error) return { data: null, error: error.code === UNIQUE_VIOLATION ? { ...error, code: "duplicate_code" } : error };
  // an admin's songs are approved at once ("active"); anyone else's wait for approval ("pending")
  logAuditEvent({
    actor: { ...publicActor(createdBy), role: status === "active" ? "staff" : "public" }, action: "praise_song_created", entityType: "praise_song", entityId: data.id, entityLabel: data.title,
    details: { code: data.code, category: data.category, status: data.status, device: deviceInfo() },
  });
  return { data: { ...data, last_sung_on: null, times_sung: 0, sung_by_church: {} }, error: null };
}

export async function updateSong(id, patch) {
  const invalid = validateSong({ title: "title" in patch ? patch.title : "", code: patch.code });
  if (invalid) return { data: null, error: invalid };
  const clean = { ...patch };
  if (clean.category === "english") clean.language = "en";
  if ("code" in clean) clean.code = clean.code ? normalizeCode(clean.code) : null;
  if ("title" in clean) clean.title = formatSongTitle(clean.title);
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

// The list of one service of one church (each church has its own list), or null.
export async function fetchListFor(date, type, church) {
  let query = sb.from("worship_lists").select(LIST_SELECT).eq("service_date", date).eq("service_type", type);
  query = church ? query.eq("church", church) : query.is("church", null);
  const { data, error } = await query.order("created_at").limit(1);
  return { data: data?.[0] ? sortItems(data[0]) : null, error };
}

// Someone else created the list of this service a moment earlier: error.code === "list_exists".
export async function createList(header, songIds) {
  const { data: list, error } = await sb.from("worship_lists").insert(header).select().single();
  if (error) return { data: null, error: error.code === UNIQUE_VIOLATION ? { ...error, code: "list_exists" } : error };
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
