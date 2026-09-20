-- Culto Profético › Lista de Louvores (MVP).
-- praise_songs: catalogue of praise songs, identified by a code like CL-001 / CIA-012 / ENG-031
--   (avulsos may have no code). Starts empty; new songs typed on a list enter as 'pending' and an
--   admin or the Grupo de Louvor leader approves them.
-- worship_lists / worship_list_items: one list per service (date + service_type), kept forever.
-- praise_song_last_sung: view with the last date and count each song was sung (derived, never stale).

CREATE TABLE IF NOT EXISTS praise_songs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        CHECK (code IS NULL OR char_length(code) BETWEEN 1 AND 20),
  title         text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category      text        NOT NULL DEFAULT 'avulso' CHECK (category IN ('coletanea', 'cia', 'avulso', 'english')),
  theme         text        CHECK (theme IS NULL OR char_length(theme) <= 80),
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending')),
  legacy_number text,       -- number in the old songbook list, kept for the later import
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A code identifies one song (case-insensitive); songs without a code are unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS praise_songs_code_uniq ON praise_songs (upper(code)) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS praise_songs_status_idx ON praise_songs (status);

CREATE TABLE IF NOT EXISTS worship_lists (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date  date        NOT NULL,
  service_type  text        NOT NULL DEFAULT 'noite' CHECK (service_type IN ('ebd', 'noite', 'outro')),
  group_name    text        CHECK (group_name IS NULL OR char_length(group_name) <= 120),
  leader        text        CHECK (leader IS NULL OR char_length(leader) <= 120),   -- dirigente do louvor (free text)
  preacher      text        CHECK (preacher IS NULL OR char_length(preacher) <= 120), -- "Mensagem" = who preached
  entered_by    text        NOT NULL CHECK (char_length(entered_by) BETWEEN 1 AND 120),
  locked        boolean     NOT NULL DEFAULT false, -- manual lock; lists also lock by themselves the next morning
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worship_lists_date_idx ON worship_lists (service_date DESC);

CREATE TABLE IF NOT EXISTS worship_list_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id   uuid NOT NULL REFERENCES worship_lists(id) ON DELETE CASCADE,
  song_id   uuid NOT NULL REFERENCES praise_songs(id) ON DELETE RESTRICT,
  position  integer NOT NULL CHECK (position >= 0),
  UNIQUE (list_id, song_id) -- a song does not repeat inside one list
);

CREATE INDEX IF NOT EXISTS worship_list_items_song_idx ON worship_list_items (song_id);

CREATE OR REPLACE VIEW praise_song_last_sung AS
SELECT i.song_id,
       max(l.service_date) AS last_sung_on,
       count(*)::int       AS times_sung
FROM worship_list_items i
JOIN worship_lists l ON l.id = i.list_id
GROUP BY i.song_id;

ALTER TABLE praise_songs DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON praise_songs TO anon, authenticated, service_role;

ALTER TABLE worship_lists DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON worship_lists TO anon, authenticated, service_role;

ALTER TABLE worship_list_items DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON worship_list_items TO anon, authenticated, service_role;

GRANT SELECT ON praise_song_last_sung TO anon, authenticated, service_role;
