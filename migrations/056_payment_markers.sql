-- Who may mark a registration as paid (or un-mark it). Empty = everyone who could before
-- (admin, Secretaria, tesoureiro, ...). Admins choose the users in Configurações › Usuários & PINs.
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS payment_marker_ids integer[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
