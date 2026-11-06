-- 049: voice type and instruments picked in Funções were saved as roles.
-- Move them into members.voice_type / members.instruments, where the team lists,
-- the leader's view and the member editor read them. Data only; no schema change.
-- An existing voice_type is kept; "Mezzo" becomes "Mezzo-Soprano".

WITH music AS (
  SELECT ARRAY['Soprano','Mezzo','Mezzo-Soprano','Contralto','Tenor','Barítono','Baixo'] AS voices,
         ARRAY['Violão','Guitarra','Baixo Elétrico','Bateria','Percussão','Teclado','Piano','Flauta','Violino','Trompete','Saxofone'] AS instruments
)
UPDATE members m SET
  voice_type = COALESCE(NULLIF(m.voice_type, ''), (
    SELECT CASE WHEN r = 'Mezzo' THEN 'Mezzo-Soprano' ELSE r END
    FROM unnest(m.roles) WITH ORDINALITY AS t(r, i), music
    WHERE r = ANY(music.voices) ORDER BY i LIMIT 1)),
  instruments = ARRAY(
    SELECT x FROM (
      SELECT DISTINCT ON (x) x, ord FROM (
        SELECT x, i AS ord FROM unnest(COALESCE(m.instruments, '{}')) WITH ORDINALITY AS a(x, i)
        UNION ALL
        SELECT r, 1000 + i FROM unnest(m.roles) WITH ORDINALITY AS t(r, i), music WHERE r = ANY(music.instruments)
      ) u ORDER BY x, ord
    ) d ORDER BY ord),
  roles = ARRAY(
    SELECT r FROM unnest(m.roles) WITH ORDINALITY AS t(r, i), music
    WHERE NOT (r = ANY(music.voices) OR r = ANY(music.instruments)) ORDER BY i),
  role = CASE WHEN m.role = ANY(music.voices || music.instruments) THEN '' ELSE m.role END
FROM music
WHERE m.roles && (music.voices || music.instruments);
