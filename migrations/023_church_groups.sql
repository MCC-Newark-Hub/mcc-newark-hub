-- Church groupings: polos, áreas and regiões. A church can belong to several groups.
-- Managed in Diretório > Polos e Áreas; used to scope a prayer period (prayer_periods.scope_*).

CREATE TABLE IF NOT EXISTS church_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind        text        NOT NULL DEFAULT 'polo' CHECK (kind IN ('polo', 'area', 'regiao')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

CREATE TABLE IF NOT EXISTS church_group_members (
  group_id   uuid NOT NULL REFERENCES church_groups(id) ON DELETE CASCADE,
  church_id  uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, church_id)
);

ALTER TABLE church_groups DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON church_groups TO anon, authenticated, service_role;

ALTER TABLE church_group_members DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON church_group_members TO anon, authenticated, service_role;

-- Who a prayer period (one list) is for: everyone, one or more groups (polos, áreas, regiões),
-- or specific churches. list_name is the short name shown on the tab (e.g. "Newark", "Texas").
-- title_en / reasons_en are the English versions of the title and the prayer intentions.
ALTER TABLE prayer_periods
  ADD COLUMN IF NOT EXISTS list_name        text   CHECK (list_name IS NULL OR char_length(list_name) <= 60),
  ADD COLUMN IF NOT EXISTS title_en         text   CHECK (title_en IS NULL OR char_length(title_en) <= 200),
  ADD COLUMN IF NOT EXISTS reasons_en       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_kind       text   NOT NULL DEFAULT 'all' CHECK (scope_kind IN ('all', 'groups', 'churches')),
  ADD COLUMN IF NOT EXISTS scope_group_ids  uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_churches   text[] NOT NULL DEFAULT '{}';

-- The three polos (edit them in Diretório > Polos e Áreas).
INSERT INTO church_groups (name, kind) VALUES
  ('Newark', 'polo'), ('Texas', 'polo'), ('Costa Oeste', 'polo')
ON CONFLICT (kind, name) DO NOTHING;

INSERT INTO church_group_members (group_id, church_id)
SELECT g.id, c.id
FROM (VALUES
  ('Newark',      'Newark, NJ'),
  ('Newark',      'Philadelphia, PA'),
  ('Newark',      'New York, NY'),
  ('Newark',      'Toms River, NJ'),
  ('Texas',       'Austin, TX'),
  ('Texas',       'Houston, TX'),
  ('Costa Oeste', 'Provo, UT'),
  ('Costa Oeste', 'Las Vegas, NV'),
  ('Costa Oeste', 'Haleiwa, HI'),
  ('Costa Oeste', 'Chino Hills, CA')
) AS m(group_name, church_display)
JOIN church_groups g ON g.kind = 'polo' AND g.name = m.group_name
JOIN churches c ON c.display = m.church_display
ON CONFLICT DO NOTHING;
