-- Organograma: who is responsible for the Área, each Polo and each Igreja (and who is co-responsible).
-- scope + ref identify the node: ('area','main'), ('polo', church_groups.id), ('church', churches.id).
-- A responsible is a member (member_id, name follows the member) or just a typed name (not registered yet).
CREATE TABLE IF NOT EXISTS org_responsibles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      text        NOT NULL CHECK (scope IN ('area', 'polo', 'church')),
  ref        text        NOT NULL,
  kind       text        NOT NULL DEFAULT 'responsavel' CHECK (kind IN ('responsavel', 'co')),
  member_id  text,
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS org_responsibles_uniq ON org_responsibles (scope, ref, kind, lower(name));
CREATE INDEX IF NOT EXISTS org_responsibles_node_idx ON org_responsibles (scope, ref);

ALTER TABLE org_responsibles DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON org_responsibles TO anon, authenticated, service_role;

-- Initial data (editable in Diretório > Organograma). member_id is filled when the member exists.
INSERT INTO org_responsibles (scope, ref, kind, member_id, name)
SELECT v.scope,
       CASE v.scope
         WHEN 'area'   THEN 'main'
         WHEN 'polo'   THEN (SELECT g.id::text FROM church_groups g WHERE g.kind = 'polo' AND g.name = v.node)
         WHEN 'church' THEN (SELECT c.id::text FROM churches c WHERE c.display = v.node)
       END,
       v.kind,
       (SELECT m.id FROM members m WHERE m.id = v.member_id),
       v.person
FROM (VALUES
  ('area',   'main',             'responsavel', 'M287',     'Nairon Pimentel'),
  ('polo',   'Newark',           'responsavel', 'M287',     'Nairon Pimentel'),
  ('polo',   'Costa Oeste',      'responsavel', 'MUF4D74A', 'Armando Rocha'),
  ('polo',   'Texas',            'responsavel', NULL,       'Pr. Luiz Laranjeira'),
  ('church', 'Newark, NJ',       'responsavel', 'M287',     'Nairon Pimentel'),
  ('church', 'Newark, NJ',       'co',          'M180',     'Jairo Oliveira'),
  ('church', 'Philadelphia, PA', 'responsavel', 'M287',     'Nairon Pimentel'),
  ('church', 'Toms River, NJ',   'responsavel', 'M287',     'Nairon Pimentel'),
  ('church', 'New York, NY',     'responsavel', 'M099',     'Dilton Rodrigues')
) AS v(scope, node, kind, member_id, person)
WHERE v.scope = 'area'
   OR (v.scope = 'polo'   AND EXISTS (SELECT 1 FROM church_groups g WHERE g.kind = 'polo' AND g.name = v.node))
   OR (v.scope = 'church' AND EXISTS (SELECT 1 FROM churches c WHERE c.display = v.node))
ON CONFLICT DO NOTHING;
