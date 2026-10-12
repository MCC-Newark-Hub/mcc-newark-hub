-- Adds a language column to praise_songs so CIA songs can be marked as Portuguese or English.
-- Coletânea is always PT, English category is always EN; only CIA (and Avulso) need this field.
-- All existing songs default to 'pt'. Additive: deployed code continues to work before this is applied.

ALTER TABLE praise_songs
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt'
    CHECK (language IN ('pt', 'en'));
