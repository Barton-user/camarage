-- =============================================================================
-- CAMARAGE · Migración — Pistas de audio en Supabase Storage
-- -----------------------------------------------------------------------------
-- Correr UNA VEZ en el SQL Editor del dashboard de Supabase.
-- Es idempotente: si la corrés dos veces no rompe nada.
--
-- Qué hace:
--   1. Agrega a `songs` las columnas que apuntan al audio.
--   2. Crea el bucket privado `song-audio` con tope de 50 MB por archivo
--      (el máximo del plan gratis).
--   3. Políticas de acceso: cada integrante solo puede ver y subir audios
--      de las bandas a las que pertenece. Reusa la función is_band_member()
--      que ya existe en tu schema.
--
-- Convención de rutas dentro del bucket:  <band_id>/<song_id>.<ext>
-- El primer nivel de carpeta ES el band_id — de ahí sale el permiso.
-- =============================================================================

-- 1 · Columnas de audio en songs ----------------------------------------------
alter table songs add column if not exists audio_path       text;
alter table songs add column if not exists audio_filename   text;
alter table songs add column if not exists audio_bytes      bigint;
alter table songs add column if not exists audio_updated_at timestamptz;

comment on column songs.audio_path is
  'Ruta dentro del bucket song-audio: <band_id>/<song_id>.<ext>. NULL = sin pista.';
comment on column songs.audio_updated_at is
  'Cuándo se subió. Los dispositivos lo comparan con su caché para saber si hay que rebajar el archivo.';

-- 2 · Bucket privado -----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'song-audio',
  'song-audio',
  false,                     -- privado: se accede solo con sesión y según las políticas
  52428800,                  -- 50 MB, el tope del plan gratis de Supabase
  array[
    'audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/x-m4a',
    'audio/wav','audio/x-wav','audio/vnd.wave','audio/ogg','audio/flac'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = false;

-- 3 · Políticas de Storage -----------------------------------------------------
-- Se borran primero para que la migración se pueda repetir sin error.
drop policy if exists "song-audio: leer miembros"      on storage.objects;
drop policy if exists "song-audio: subir miembros"     on storage.objects;
drop policy if exists "song-audio: actualizar miembros" on storage.objects;
drop policy if exists "song-audio: borrar miembros"    on storage.objects;

-- Lectura: cualquier integrante activo de la banda dueña de la carpeta.
create policy "song-audio: leer miembros"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'song-audio'
    and is_band_member( ((storage.foldername(name))[1])::uuid )
  );

create policy "song-audio: subir miembros"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'song-audio'
    and is_band_member( ((storage.foldername(name))[1])::uuid )
  );

create policy "song-audio: actualizar miembros"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'song-audio'
    and is_band_member( ((storage.foldername(name))[1])::uuid )
  )
  with check (
    bucket_id = 'song-audio'
    and is_band_member( ((storage.foldername(name))[1])::uuid )
  );

create policy "song-audio: borrar miembros"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'song-audio'
    and is_band_member( ((storage.foldername(name))[1])::uuid )
  );

-- 4 · Verificación -------------------------------------------------------------
-- Después de correr todo, esto tiene que devolver una fila con el bucket
-- y cuatro políticas.
select
  (select count(*) from storage.buckets where id = 'song-audio')      as buckets,
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'song-audio:%')                            as politicas,
  (select count(*) from information_schema.columns
     where table_name = 'songs' and column_name like 'audio%')        as columnas_audio;
-- Esperado:  buckets = 1 · politicas = 4 · columnas_audio = 4
