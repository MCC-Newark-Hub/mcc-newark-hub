-- Lista de Louvores: a list is "published" when the service ends. Publishing locks it and opens the
-- read-only page /culto-profetico/<list id> that is sent to the Grupo de Louvor. NULL = not published.
ALTER TABLE worship_lists ADD COLUMN IF NOT EXISTS published_at timestamptz;
