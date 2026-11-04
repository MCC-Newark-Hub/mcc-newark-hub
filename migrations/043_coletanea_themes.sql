-- Themes of the Coletânea from the hymnal's "Índice numérico e por tema":
--   Clamor 1–56, Invocação e Comunhão 57–96, Dedicação 97–200, Morte, Ressurreição e Salvação 201–294,
--   Consolo e Encorajamento 295–385, Santificação e Derramamento do Espírito Santo 386–477,
--   Volta de Jesus e Eternidade 478–571, Louvor 572–649, Salmos de Louvor 650–665,
--   Grupo de Louvor 666–730, Corinhos 731–794.
-- Lista de Louvores uses them to suggest other songs of the same theme when one was sung recently.

-- "Ó, VEM DERRAMAR" is number 439 in the hymnal; it was saved with the code "438" (CL-438 is another song).
UPDATE praise_songs SET code = 'CL-439'
WHERE category = 'coletanea' AND code = '438' AND title = 'Ó, VEM DERRAMAR'
  AND NOT EXISTS (SELECT 1 FROM praise_songs WHERE code = 'CL-439');

UPDATE praise_songs s SET theme = r.theme
FROM (VALUES
  ('Clamor', 1, 56),
  ('Invocação e Comunhão', 57, 96),
  ('Dedicação', 97, 200),
  ('Morte, Ressurreição e Salvação', 201, 294),
  ('Consolo e Encorajamento', 295, 385),
  ('Santificação e Derramamento do Espírito Santo', 386, 477),
  ('Volta de Jesus e Eternidade', 478, 571),
  ('Louvor', 572, 649),
  ('Salmos de Louvor', 650, 665),
  ('Grupo de Louvor', 666, 730),
  ('Corinhos', 731, 794)
) AS r(theme, lo, hi)
WHERE s.category = 'coletanea'
  AND s.code ~ '^CL-\d{3}$'
  AND substring(s.code FROM 4)::int BETWEEN r.lo AND r.hi;

-- The app called this theme "Console e Encorajamento"; the hymnal says "Consolo".
UPDATE praise_songs SET theme = 'Consolo e Encorajamento' WHERE theme = 'Console e Encorajamento';

NOTIFY pgrst, 'reload schema';
