-- Lista de Louvores: which church the list belongs to (e.g. "Newark, NJ"). Shown on the published page.
-- Free text taken from the churches directory (display). NULL for lists created before this column existed.
ALTER TABLE worship_lists ADD COLUMN IF NOT EXISTS church text CHECK (church IS NULL OR char_length(church) <= 120);
