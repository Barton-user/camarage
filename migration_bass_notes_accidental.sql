-- Pentagrama: recordar si una nota se escribe con sostenido o con bemol
-- (Sol♯ vs La♭). Correr una vez en Supabase → SQL Editor → Run.
--   1 = sostenido · -1 = bemol · null = según la tonalidad de la canción
alter table bass_notes add column if not exists accidental smallint
  check (accidental is null or accidental in (-1, 0, 1));
