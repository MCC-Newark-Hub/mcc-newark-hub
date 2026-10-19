-- Accounts can be switched off without deleting them: an inactive user can no longer sign in, but can be
-- reactivated and the audit log keeps their name. Part of moving from shared logins ("Secretaria Newark",
-- "Equipe Som") to one login per person.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- The team accounts nobody ever used (no action in the audit log): switched off, not deleted.
UPDATE app_users SET active = false
WHERE sys_role = 'team_leader'
  AND name IN ('Equipe Cozinha', 'Equipe Secretaria', 'Equipe Som', 'Equipe Tradução',
               'Equipe Transporte', 'Equipe Louvor', 'Equipe Limpeza', 'Equipe Diáconos');

NOTIFY pgrst, 'reload schema';
