-- =============================================================================
-- CAMARAGE · Lo que falta correr en Supabase
-- -----------------------------------------------------------------------------
-- Junta las dos migraciones pendientes. Idempotente: se puede correr de nuevo
-- sin romper nada.
--
--   A · Subir el tope de tamaño por archivo a 200 MB (para bounces en WAV)
--   B · Duración de pista y encadenado de canciones
--
-- Ya corriste antes migration_audio.sql (bucket + columnas de audio + políticas),
-- así que eso NO hace falta repetirlo.
--
-- ⚠ Después de correr esto falta UN paso a mano que el SQL no puede hacer:
--     Dashboard → Settings → Storage → "Upload file size limit" → 200 MB
--   Ese límite global manda sobre el del bucket. Si queda en 50, los WAV
--   grandes van a seguir fallando aunque el bucket diga 200.
-- =============================================================================


-- A · TOPE DE 200 MB POR ARCHIVO ---------------------------------------------
update storage.buckets
set file_size_limit = 209715200
where id = 'song-audio';


-- B · DURACIÓN Y ENCADENADO ---------------------------------------------------
alter table songs add column if not exists audio_duration_seconds numeric;
alter table songs add column if not exists chain_next boolean not null default false;

comment on column songs.audio_duration_seconds is
  'Duración de la pista en segundos, medida al subir el archivo desde la web admin.';
comment on column songs.chain_next is
  'true = al terminar, la siguiente arranca sola (medley). false = cuenta 5s y espera el PLAY.';


-- VERIFICACIÓN ----------------------------------------------------------------
select
  (select round(file_size_limit / 1048576.0)::int
     from storage.buckets where id = 'song-audio')          as tope_mb,
  (select count(*) from information_schema.columns
     where table_name = 'songs'
       and column_name in ('audio_duration_seconds','chain_next')) as columnas_nuevas;
-- Esperado:  tope_mb = 200 · columnas_nuevas = 2
