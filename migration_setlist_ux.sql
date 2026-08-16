-- =============================================================================
-- CAMARAGE · Migración — Duración de pista y encadenado de canciones
-- -----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase. Idempotente.
--
--   audio_duration_seconds : cuánto dura la pista. Se calcula solo al subir el
--                            archivo desde la web admin. Sirve para mostrar la
--                            duración de cada tema y el total del show.
--   chain_next             : "encadenar con la siguiente". Si está en true, al
--                            terminar esta canción la próxima arranca sola, sin
--                            cuenta regresiva. Para medleys y bloques seguidos.
-- =============================================================================

alter table songs add column if not exists audio_duration_seconds numeric;
alter table songs add column if not exists chain_next boolean not null default false;

comment on column songs.audio_duration_seconds is
  'Duración de la pista en segundos, medida al subir el archivo.';
comment on column songs.chain_next is
  'true = al terminar, la siguiente arranca sola (medley). false = cuenta 5s, carga y espera el PLAY.';

-- Verificación: tiene que devolver 2
select count(*) as columnas_nuevas
from information_schema.columns
where table_name = 'songs'
  and column_name in ('audio_duration_seconds', 'chain_next');
