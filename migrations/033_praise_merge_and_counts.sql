-- Lista de Louvores: merging duplicates without losing history, and "cantado N vezes" counted per service.
-- Apply BEFORE deploying the code that uses it. Additive: two views replaced (same columns), one view and two
-- functions added. The one-list-per-service rule is 034, applied only after the existing duplicates are merged.

-- "Cantado N vezes" counts services, not list rows: the same song twice in one service (duplicate lists) is one
-- time; different days are different times; Sunday EBD + Noite are two. Each church has its own history, so the
-- same song in Newark and in New York on the same service counts once for each.
CREATE OR REPLACE VIEW praise_song_last_sung AS
SELECT i.song_id,
       max(l.service_date) AS last_sung_on,
       count(DISTINCT (coalesce(l.church, ''), l.service_date, l.service_type))::int AS times_sung
FROM worship_list_items i
JOIN worship_lists l ON l.id = i.list_id
GROUP BY i.song_id;

-- The same, per church: drives "cantado há X dias" on a church's list and the catalogue's church filter.
CREATE OR REPLACE VIEW praise_song_sung_by_church AS
SELECT i.song_id,
       l.church,
       max(l.service_date) AS last_sung_on,
       count(DISTINCT (l.service_date, l.service_type))::int AS times_sung
FROM worship_list_items i
JOIN worship_lists l ON l.id = i.list_id
WHERE l.church IS NOT NULL
GROUP BY i.song_id, l.church;

GRANT SELECT ON praise_song_last_sung TO anon, authenticated, service_role;
GRANT SELECT ON praise_song_sung_by_church TO anon, authenticated, service_role;

-- Merges a duplicate song into the right one, in one transaction: every list that used the duplicate now uses
-- the right song (a list that already had both keeps one entry, and its positions are renumbered), then the
-- duplicate is deleted. The right song itself is not changed. Returns what happened, for the audit log.
CREATE OR REPLACE FUNCTION merge_praise_songs(p_from uuid, p_into uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_from  praise_songs;
  v_into  praise_songs;
  v_lists uuid[];
  v_moved int;
BEGIN
  IF p_from = p_into THEN
    RAISE EXCEPTION 'same_song' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_from FROM praise_songs WHERE id = p_from FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'song_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_into FROM praise_songs WHERE id = p_into FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'song_not_found' USING ERRCODE = 'P0002'; END IF;

  -- lists that already have the right song: the duplicate's entry goes away
  WITH gone AS (
    DELETE FROM worship_list_items i
    WHERE i.song_id = p_from
      AND EXISTS (SELECT 1 FROM worship_list_items j WHERE j.list_id = i.list_id AND j.song_id = p_into)
    RETURNING i.list_id
  )
  SELECT coalesce(array_agg(list_id), '{}') INTO v_lists FROM gone;

  UPDATE worship_list_items SET song_id = p_into WHERE song_id = p_from;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- close the gaps left in those lists (0, 1, 2…)
  UPDATE worship_list_items w
  SET position = r.rn
  FROM (
    SELECT id, (row_number() OVER (PARTITION BY list_id ORDER BY position, id) - 1)::int AS rn
    FROM worship_list_items
    WHERE list_id = ANY (v_lists)
  ) r
  WHERE w.id = r.id AND w.position <> r.rn;

  DELETE FROM praise_songs WHERE id = p_from;

  RETURN jsonb_build_object(
    'moved', v_moved,
    'already_there', coalesce(array_length(v_lists, 1), 0),
    'from', jsonb_build_object('id', v_from.id, 'code', v_from.code, 'title', v_from.title, 'category', v_from.category, 'status', v_from.status, 'created_by', v_from.created_by),
    'into', jsonb_build_object('id', v_into.id, 'code', v_into.code, 'title', v_into.title, 'category', v_into.category)
  );
END;
$$;

-- Merges a duplicate list of the same service (same date and service type, same church or one without church)
-- into the list that stays, in one transaction: the details the kept list lacks (church, group, leader, preacher,
-- publication) are copied from the other one, the songs it does not have yet are added at the end in their order,
-- and the other list is deleted. Its public link stops working; the kept list's link is the one to share.
CREATE OR REPLACE FUNCTION merge_worship_lists(p_keep uuid, p_drop uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_keep  worship_lists;
  v_drop  worship_lists;
  v_next  int;
  v_added int;
BEGIN
  IF p_keep = p_drop THEN
    RAISE EXCEPTION 'same_list' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_keep FROM worship_lists WHERE id = p_keep FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'list_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_drop FROM worship_lists WHERE id = p_drop FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'list_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_keep.service_date <> v_drop.service_date OR v_keep.service_type <> v_drop.service_type
     OR (v_keep.church IS NOT NULL AND v_drop.church IS NOT NULL AND v_keep.church <> v_drop.church) THEN
    RAISE EXCEPTION 'different_service' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(position) + 1, 0) INTO v_next FROM worship_list_items WHERE list_id = p_keep;

  INSERT INTO worship_list_items (list_id, song_id, position)
  SELECT p_keep, d.song_id, v_next + (row_number() OVER (ORDER BY d.position, d.id) - 1)::int
  FROM worship_list_items d
  WHERE d.list_id = p_drop
    AND NOT EXISTS (SELECT 1 FROM worship_list_items k WHERE k.list_id = p_keep AND k.song_id = d.song_id);
  GET DIAGNOSTICS v_added = ROW_COUNT;

  UPDATE worship_lists SET
    church       = coalesce(church, v_drop.church),
    group_name   = coalesce(group_name, v_drop.group_name),
    leader       = coalesce(leader, v_drop.leader),
    preacher     = coalesce(preacher, v_drop.preacher),
    published_at = coalesce(published_at, v_drop.published_at),
    updated_at   = now()
  WHERE id = p_keep;

  DELETE FROM worship_lists WHERE id = p_drop;

  RETURN jsonb_build_object(
    'songs_added', v_added,
    'dropped', jsonb_build_object('id', v_drop.id, 'entered_by', v_drop.entered_by, 'church', v_drop.church, 'group_name', v_drop.group_name, 'leader', v_drop.leader, 'preacher', v_drop.preacher, 'published_at', v_drop.published_at)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_praise_songs(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION merge_worship_lists(uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
