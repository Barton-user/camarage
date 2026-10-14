-- ============================================================================
-- CAMARAGE · Permisos por integrante
-- Correr UNA vez en Supabase → SQL Editor → Run. Se puede repetir sin problema.
--
-- Cada integrante tiene casillas:
--   edit_songs      editar canciones (datos, letras, cues, cifrado, pentagrama, MIDI out)
--   upload_audio    subir / reemplazar / borrar pistas
--   edit_setlists   crear setlists y ordenar canciones (también desde la app)
--   manage_members  crear usuarios y cambiar permisos
-- El dueño de la banda (bands.owner_id) tiene todo, siempre.
-- VER todo (web y app) lo puede cualquier integrante activo, como hasta ahora.
--
-- Los que ya están quedan como antes: pueden editar todo, menos integrantes.
-- ============================================================================

-- 1 · La columna -------------------------------------------------------------
alter table band_members add column if not exists permissions jsonb not null
  default '{"edit_songs":true,"upload_audio":true,"edit_setlists":true,"manage_members":false}'::jsonb;

-- 2 · ¿El usuario actual tiene este permiso en esta banda? ------------------
create or replace function has_band_perm(p_band_id uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bands b where b.id = p_band_id and b.owner_id = auth.uid())
      or exists (
        select 1 from band_members m
         where m.band_id = p_band_id and m.user_id = auth.uid() and m.is_active
           and coalesce((m.permissions ->> p_perm)::boolean, false)
      );
$$;
grant execute on function has_band_perm(uuid, text) to authenticated;

create or replace function song_band(p_song uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select band_id from songs where id = p_song
$$;
create or replace function setlist_band(p_setlist uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select band_id from setlists where id = p_setlist
$$;
grant execute on function song_band(uuid), setlist_band(uuid) to authenticated;

-- 3 · Borrar las políticas viejas de estas tablas (tengan el nombre que tengan)
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('band_members','songs','setlists','setlist_songs',
                         'song_sections','lyric_lines','chord_charts','drum_cues',
                         'midi_cues','midi_events','bass_notes')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 4 · Integrantes: ver = cualquier miembro · cambiar = manage_members --------
create policy "band_members: ver"    on band_members for select
  using (is_band_member(band_id) or user_id = auth.uid());
create policy "band_members: alta"   on band_members for insert
  with check (has_band_perm(band_id, 'manage_members'));
create policy "band_members: cambiar" on band_members for update
  using (has_band_perm(band_id, 'manage_members')) with check (has_band_perm(band_id, 'manage_members'));
create policy "band_members: sacar"  on band_members for delete
  using (has_band_perm(band_id, 'manage_members'));

-- 5 · Canciones ----------------------------------------------------------------
create policy "songs: ver"     on songs for select using (is_band_member(band_id));
create policy "songs: crear"   on songs for insert with check (has_band_perm(band_id, 'edit_songs'));
-- update: editar canciones, o subir audios (la ficha guarda el nombre/duración de la pista)
create policy "songs: cambiar" on songs for update
  using (has_band_perm(band_id, 'edit_songs') or has_band_perm(band_id, 'upload_audio'))
  with check (has_band_perm(band_id, 'edit_songs') or has_band_perm(band_id, 'upload_audio'));
create policy "songs: borrar"  on songs for delete using (has_band_perm(band_id, 'edit_songs'));

-- Quien solo puede subir audios, en la ficha de la canción solo toca los datos de la pista
create or replace function songs_guard_audio_only() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ignorar text[] := array['audio_path','audio_filename','audio_bytes','audio_updated_at',
                          'audio_duration_seconds','audio_end_seconds','updated_at'];
begin
  if auth.uid() is null or has_band_perm(old.band_id, 'edit_songs') then return new; end if;
  if (to_jsonb(new) - ignorar) is distinct from (to_jsonb(old) - ignorar) then
    raise exception 'Sin permiso para editar canciones: solo podés cambiar la pista de audio.';
  end if;
  return new;
end $$;
drop trigger if exists trg_songs_guard_audio_only on songs;
create trigger trg_songs_guard_audio_only before update on songs
  for each row execute function songs_guard_audio_only();

-- 6 · Tablas hijas de la canción (las que existan) ---------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array['song_sections','lyric_lines','chord_charts','drum_cues',
                             'midi_cues','midi_events','bass_notes']
  loop
    if to_regclass('public.' || tbl) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tbl);
    execute format($f$create policy "%1$s: ver" on public.%1$s for select
                     using (is_band_member(song_band(song_id)))$f$, tbl);
    execute format($f$create policy "%1$s: crear" on public.%1$s for insert
                     with check (has_band_perm(song_band(song_id), 'edit_songs'))$f$, tbl);
    execute format($f$create policy "%1$s: cambiar" on public.%1$s for update
                     using (has_band_perm(song_band(song_id), 'edit_songs'))
                     with check (has_band_perm(song_band(song_id), 'edit_songs'))$f$, tbl);
    execute format($f$create policy "%1$s: borrar" on public.%1$s for delete
                     using (has_band_perm(song_band(song_id), 'edit_songs'))$f$, tbl);
  end loop;
end $$;

-- 7 · Setlists -----------------------------------------------------------------
create policy "setlists: ver"     on setlists for select using (is_band_member(band_id));
create policy "setlists: crear"   on setlists for insert with check (has_band_perm(band_id, 'edit_setlists'));
create policy "setlists: cambiar" on setlists for update
  using (has_band_perm(band_id, 'edit_setlists')) with check (has_band_perm(band_id, 'edit_setlists'));
create policy "setlists: borrar"  on setlists for delete using (has_band_perm(band_id, 'edit_setlists'));

create policy "setlist_songs: ver"     on setlist_songs for select using (is_band_member(setlist_band(setlist_id)));
create policy "setlist_songs: crear"   on setlist_songs for insert with check (has_band_perm(setlist_band(setlist_id), 'edit_setlists'));
create policy "setlist_songs: cambiar" on setlist_songs for update
  using (has_band_perm(setlist_band(setlist_id), 'edit_setlists'))
  with check (has_band_perm(setlist_band(setlist_id), 'edit_setlists'));
create policy "setlist_songs: borrar"  on setlist_songs for delete using (has_band_perm(setlist_band(setlist_id), 'edit_setlists'));

-- 8 · Pistas de audio (Storage, bucket song-audio: carpeta = id de la banda) --
-- (también las que tengan otro nombre pero sean de este bucket)
do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and (coalesce(qual, '') || coalesce(with_check, '')) like '%song-audio%'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;
drop policy if exists "song-audio: leer miembros"       on storage.objects;
drop policy if exists "song-audio: subir miembros"      on storage.objects;
drop policy if exists "song-audio: actualizar miembros" on storage.objects;
drop policy if exists "song-audio: borrar miembros"     on storage.objects;
create policy "song-audio: leer miembros" on storage.objects for select to authenticated
  using (bucket_id = 'song-audio' and is_band_member(((storage.foldername(name))[1])::uuid));
create policy "song-audio: subir miembros" on storage.objects for insert to authenticated
  with check (bucket_id = 'song-audio' and has_band_perm(((storage.foldername(name))[1])::uuid, 'upload_audio'));
create policy "song-audio: actualizar miembros" on storage.objects for update to authenticated
  using (bucket_id = 'song-audio' and has_band_perm(((storage.foldername(name))[1])::uuid, 'upload_audio'))
  with check (bucket_id = 'song-audio' and has_band_perm(((storage.foldername(name))[1])::uuid, 'upload_audio'));
create policy "song-audio: borrar miembros" on storage.objects for delete to authenticated
  using (bucket_id = 'song-audio' and has_band_perm(((storage.foldername(name))[1])::uuid, 'upload_audio'));

-- 9 · Verificación: tiene que listar las políticas nuevas ---------------------
select tablename, count(*) as politicas from pg_policies
 where schemaname = 'public'
   and tablename in ('band_members','songs','setlists','setlist_songs','lyric_lines','chord_charts','bass_notes')
 group by tablename order by tablename;
