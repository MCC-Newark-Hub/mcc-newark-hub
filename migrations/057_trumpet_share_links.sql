-- Trombetas e Festas: a GA leader's shareable link to the GA's guest list (one per GA and year).
-- Whoever has the link sees the guest names, who invited each one and whether they came — never phones, e-mails or
-- notes (api/trumpet-guests.js, action "shared"). The leader can replace the link (the old one stops working) or
-- turn it off (the row is deleted).
-- Server-only like the other trumpet tables (054): the browser reaches it only through api/trumpet-guests.js.

CREATE TABLE IF NOT EXISTS trumpet_share_links (
  year       int  NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  ga_id      text NOT NULL REFERENCES assistance_groups(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE CHECK (length(token) >= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  PRIMARY KEY (year, ga_id)
);

ALTER TABLE trumpet_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trumpet_share_links FROM anon, authenticated;
GRANT ALL PRIVILEGES ON trumpet_share_links TO service_role;

NOTIFY pgrst, 'reload schema';
