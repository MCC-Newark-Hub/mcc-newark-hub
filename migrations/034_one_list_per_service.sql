-- Lista de Louvores: one list per church, date and service (Sunday can still have EBD and Noite: they are two
-- services). Stops two people creating two lists for the same service at the same moment; the app then opens the
-- existing list instead. Apply only AFTER merging the existing duplicates (Escalas › Lista de Louvores › Listas):
-- while any remain, creating the index fails with a duplicate-key error and nothing changes. Check first with:
--   SELECT church, service_date, service_type, count(*) FROM worship_lists GROUP BY 1, 2, 3 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS worship_lists_one_per_service
  ON worship_lists (coalesce(church, ''), service_date, service_type);
