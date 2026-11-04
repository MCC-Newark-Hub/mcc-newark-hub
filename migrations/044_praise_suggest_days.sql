-- Lista de Louvores: how many days back a song counts as "sung recently" when suggesting another song of the
-- same theme. Admins change it in Escalas › Lista de Louvores. 0 turns the suggestions off.
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS praise_suggest_days integer NOT NULL DEFAULT 7
  CHECK (praise_suggest_days BETWEEN 0 AND 60);

NOTIFY pgrst, 'reload schema';
