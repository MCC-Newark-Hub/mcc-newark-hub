-- CIA children who belong to the Acessibilidade class. Set in the member's record (Diretório); a new
-- registration copies it to registrations.acessibilidade, so the Professoras leader sees the child in
-- Acessibilidade without tagging them by hand.
ALTER TABLE members ADD COLUMN IF NOT EXISTS acessibilidade boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
