-- =============================================================================
-- CAMARAGE · Migración — Tono por canción (13 nov 2026)
-- Correr UNA vez en Supabase → SQL Editor → Run. Idempotente.
--
-- transpose_semitones: cuántos semitonos se sube (+) o se baja (−) la canción
-- para tocarla. La app procesa la pista en ese tono (sin cambiar el tempo) y
-- transpone el pentagrama, el cifrado y la tonalidad que muestra.
-- Distinto de tuning_semitones, que dice cómo está afinado el instrumento
-- respecto de lo escrito (lo escrito no cambia).
-- =============================================================================
alter table songs add column if not exists transpose_semitones smallint not null default 0;

alter table songs drop constraint if exists songs_transpose_semitones_check;
alter table songs add constraint songs_transpose_semitones_check
  check (transpose_semitones between -12 and 12);

-- Verificación: tiene que devolver 1 fila
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'songs' and column_name = 'transpose_semitones';
