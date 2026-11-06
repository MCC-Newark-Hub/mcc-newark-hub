-- 050: Diretório › Funções and Diretório › Membros show the same roles.
-- 1. Add to the functions catalogue (what the Membros form offers) the roles the Funções
--    tabs use but the catalogue lacks, each next to its siblings.
-- 2. Rename the old "Professor de Seminário" to the catalogue name on members.
-- 3. Fill members.role (still read by registration: Pastor/Ungido auto-exempt and the
--    service-team roster) from members.roles: Pastor > Ungido > Diácono > Obreiro, else
--    the first role — the rule in src/lib/memberRoles.js.
-- Idempotent; no new tables.
BEGIN;

INSERT INTO functions (name, group_name, sort_order)
SELECT v.name, s.group_name, s.sort_order
FROM (VALUES
  ('Professor(a) - Acessibilidade', 'Professor(a) de Crianças'),
  ('Operador de Projeção',          'Operador de Som')
) AS v(name, sibling)
JOIN functions s ON s.name = v.sibling
WHERE NOT EXISTS (SELECT 1 FROM functions f WHERE f.name = v.name);

UPDATE members
SET roles = CASE
  WHEN 'Professor(a) de Seminário' = ANY (roles) THEN array_remove(roles, 'Professor de Seminário')
  ELSE array_replace(roles, 'Professor de Seminário', 'Professor(a) de Seminário')
END
WHERE 'Professor de Seminário' = ANY (roles);

UPDATE members
SET role = COALESCE(
  CASE
    WHEN 'Pastor'  = ANY (roles) THEN 'Pastor'
    WHEN 'Ungido'  = ANY (roles) THEN 'Ungido'
    WHEN 'Diácono' = ANY (roles) THEN 'Diácono'
    WHEN 'Obreiro' = ANY (roles) THEN 'Obreiro'
    ELSE roles[1]
  END, '')
WHERE cardinality(COALESCE(roles, '{}')) > 0
  AND COALESCE(role, '') IS DISTINCT FROM COALESCE(
    CASE
      WHEN 'Pastor'  = ANY (roles) THEN 'Pastor'
      WHEN 'Ungido'  = ANY (roles) THEN 'Ungido'
      WHEN 'Diácono' = ANY (roles) THEN 'Diácono'
      WHEN 'Obreiro' = ANY (roles) THEN 'Obreiro'
      ELSE roles[1]
    END, '');

COMMIT;
