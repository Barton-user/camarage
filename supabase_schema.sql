-- =============================================================================
-- CAMARAGE · Schema completo para Supabase (PostgreSQL)
-- -----------------------------------------------------------------------------
-- Cubre TODAS las listas/tablas necesarias para la app:
--   · Multi-banda y multi-usuario (con roles por banda)
--   · Setlists ordenables, canciones con metadata MIDI
--   · Secciones, letras (con timestamps), cifrado de bajo, cues de batería
--   · Historial de shows (performances)
--   · Dispositivos BLE MIDI pareados
--   · Preferencias de usuario
--
-- Incluye:
--   · Extensiones, tipos enumerados, tablas, FKs, índices
--   · Triggers de updated_at
--   · RLS (Row Level Security) por banda
--   · Vistas convenientes (vw_setlist_full)
--   · Datos seed mínimos para probar
--
-- Para correrlo: pegar este archivo entero en el SQL Editor de Supabase
-- y ejecutar. Idempotente — usa DROP IF EXISTS al inicio para refrescar.
-- =============================================================================

-- =========================== 0. EXTENSIONES ==================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =========================== 1. LIMPIEZA (idempotencia) ======================
drop view  if exists vw_setlist_full cascade;

drop table if exists ble_devices         cascade;
drop table if exists performances        cascade;
drop table if exists drum_cues           cascade;
drop table if exists chord_charts        cascade;
drop table if exists lyric_lines         cascade;
drop table if exists song_sections       cascade;
drop table if exists setlist_songs       cascade;
drop table if exists songs               cascade;
drop table if exists setlists            cascade;
drop table if exists band_members        cascade;
drop table if exists bands               cascade;
drop table if exists user_preferences    cascade;

drop type  if exists band_role           cascade;
drop type  if exists section_type        cascade;
drop type  if exists cue_type            cascade;

-- =========================== 2. TIPOS ENUMERADOS =============================
create type band_role as enum (
  'owner', 'singer', 'bassist', 'drummer', 'guitarist', 'keys', 'fx', 'other'
);

create type section_type as enum (
  'intro', 'verse', 'pre_chorus', 'chorus', 'bridge', 'solo', 'breakdown',
  'interlude', 'outro', 'silence', 'other'
);

create type cue_type as enum (
  'count_in', 'fill', 'hit', 'transition', 'tempo_change', 'mute', 'unmute',
  'cue_band', 'note'
);

-- =========================== 3. TABLAS PRINCIPALES ===========================

-- 3.1 · Bandas ----------------------------------------------------------------
create table bands (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text unique,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  description  text,
  cover_color  text default '#22d3ee',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table bands is 'Cada banda es un namespace independiente. Todo cuelga de acá.';

-- 3.2 · Miembros de banda + rol -----------------------------------------------
create table band_members (
  id            uuid primary key default uuid_generate_v4(),
  band_id       uuid not null references bands(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          band_role not null default 'other',
  display_name  text,
  is_active     boolean not null default true,
  joined_at     timestamptz not null default now(),
  unique (band_id, user_id)
);
comment on table band_members is 'Relación N:N usuarios↔bandas con rol asignado.';

-- 3.3 · Setlists --------------------------------------------------------------
create table setlists (
  id           uuid primary key default uuid_generate_v4(),
  band_id      uuid not null references bands(id) on delete cascade,
  name         text not null,
  show_date    date,
  venue        text,
  notes        text,
  is_archived  boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table setlists is 'Listado de shows / ensayos planificados por banda.';

-- 3.4 · Canciones (biblioteca de la banda) ------------------------------------
create table songs (
  id                uuid primary key default uuid_generate_v4(),
  band_id           uuid not null references bands(id) on delete cascade,
  title             text not null,
  artist            text,
  key               text,                                  -- 'Am', 'C#', etc.
  bpm               numeric(6,2) not null default 120,
  time_signature    text not null default '4/4',           -- '4/4', '6/8', '7/8'
  program_change    smallint check (program_change between 0 and 127),
  daw_session_name  text,                                  -- nombre de sesión en Ableton/Logic
  duration_seconds  integer,
  has_click_track   boolean not null default true,
  notes             text,
  tags              text[] default '{}',                   -- ej: {'energetica','cierre'}
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table songs is 'Biblioteca de canciones de la banda. Una canción puede estar en muchos setlists.';

create index songs_band_id_idx on songs(band_id);
create index songs_tags_idx    on songs using gin (tags);

-- 3.5 · Relación setlist ↔ canciones (con orden) ------------------------------
create table setlist_songs (
  id           uuid primary key default uuid_generate_v4(),
  setlist_id   uuid not null references setlists(id) on delete cascade,
  song_id      uuid not null references songs(id)    on delete cascade,
  position     integer not null,                            -- 1..N
  transition_notes text,                                    -- 'segue a la siguiente', 'pausa 30s'
  created_at   timestamptz not null default now(),
  unique (setlist_id, position),
  unique (setlist_id, song_id)
);
create index setlist_songs_setlist_idx on setlist_songs(setlist_id, position);

-- 3.6 · Secciones de una canción (Intro / Verse / Chorus / …) -----------------
create table song_sections (
  id                    uuid primary key default uuid_generate_v4(),
  song_id               uuid not null references songs(id) on delete cascade,
  section_type          section_type not null default 'verse',
  label                 text,                                -- 'Verse 1', 'Chorus 2'
  order_index           integer not null,                    -- orden dentro de la canción
  start_bar             integer not null default 0,          -- en qué compás arranca
  bar_count             integer not null default 4,          -- cuántos compases dura
  start_time_seconds    numeric(8,3),                        -- cache calculado en base a BPM
  unique (song_id, order_index)
);
create index song_sections_song_idx on song_sections(song_id, order_index);

-- 3.7 · Letras (vista del Cantante) -------------------------------------------
create table lyric_lines (
  id                   uuid primary key default uuid_generate_v4(),
  song_id              uuid not null references songs(id) on delete cascade,
  section_id           uuid references song_sections(id) on delete set null,
  order_index          integer not null,
  text                 text not null,
  start_time_seconds   numeric(8,3) not null,                -- cuándo aparece (desde t=0)
  hold_seconds         numeric(6,3),                          -- opcional: cuánto se queda
  is_chorus_emphasis   boolean not null default false,
  unique (song_id, order_index)
);
create index lyric_lines_song_idx on lyric_lines(song_id, start_time_seconds);

-- 3.8 · Cifrado / progresión armónica (vista del Bajista y Tecladista) -------
create table chord_charts (
  id                   uuid primary key default uuid_generate_v4(),
  song_id              uuid not null references songs(id) on delete cascade,
  section_id           uuid references song_sections(id) on delete set null,
  order_index          integer not null,
  chord_symbol         text not null,                        -- 'Am7', 'F/A', 'C#m'
  root_note            text not null,                        -- 'A','B♭','C#'
  quality              text default '',                      -- 'm', '7', 'sus4'
  bass_note            text,                                 -- en caso de slash chord
  start_bar            integer not null,
  bar_count            integer not null default 1,
  start_time_seconds   numeric(8,3),                          -- cache
  unique (song_id, order_index)
);
create index chord_charts_song_idx on chord_charts(song_id, start_bar);

-- 3.9 · Cues del baterista (claqueta especial, fills, transitions) -----------
create table drum_cues (
  id                   uuid primary key default uuid_generate_v4(),
  song_id              uuid not null references songs(id) on delete cascade,
  section_id           uuid references song_sections(id) on delete set null,
  order_index          integer not null,
  cue_type             cue_type not null default 'note',
  label                text,                                  -- 'Fill 4 compases', 'Stop banda'
  start_bar            integer not null,
  start_time_seconds   numeric(8,3),
  duration_bars        integer default 1,
  notes                text,
  unique (song_id, order_index)
);
create index drum_cues_song_idx on drum_cues(song_id, start_bar);

-- 3.10 · Historial de shows (performances) ------------------------------------
create table performances (
  id              uuid primary key default uuid_generate_v4(),
  band_id         uuid not null references bands(id) on delete cascade,
  setlist_id      uuid references setlists(id) on delete set null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  venue           text,
  songs_played    integer default 0,
  audience_size   integer,
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index performances_band_idx on performances(band_id, started_at desc);

-- 3.11 · Dispositivos BLE MIDI pareados ---------------------------------------
create table ble_devices (
  id              uuid primary key default uuid_generate_v4(),
  band_id         uuid not null references bands(id) on delete cascade,
  device_name     text not null,                            -- 'MacBook Pro · Ableton'
  device_uuid     text not null,                            -- identificador BLE
  daw             text,                                     -- 'ableton' | 'logic' | 'other'
  is_default      boolean not null default false,
  paired_by       uuid references auth.users(id),
  paired_at       timestamptz not null default now(),
  last_seen_at    timestamptz,
  unique (band_id, device_uuid)
);

-- 3.12 · Preferencias por usuario --------------------------------------------
create table user_preferences (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  default_role         band_role default 'singer',
  preferred_subdiv     smallint default 1,                   -- 1=negras, 2=corcheas, 4=semis
  show_metronome_flash boolean default true,
  haptic_feedback      boolean default true,
  font_size_scale      numeric(3,2) default 1.0,
  theme_intensity      text default 'deep_black',            -- deep_black | soft_dark
  updated_at           timestamptz not null default now()
);

-- =========================== 4. TRIGGERS de updated_at =======================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array['bands','setlists','songs','user_preferences'])
  loop
    execute format('drop trigger if exists trg_%I_updated on %I;', t, t);
    execute format('create trigger trg_%I_updated before update on %I
                    for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- =========================== 5. RLS (Row Level Security) =====================
-- Política base: un usuario solo ve datos de bandas a las que pertenece.

alter table bands              enable row level security;
alter table band_members       enable row level security;
alter table setlists           enable row level security;
alter table setlist_songs      enable row level security;
alter table songs              enable row level security;
alter table song_sections      enable row level security;
alter table lyric_lines        enable row level security;
alter table chord_charts       enable row level security;
alter table drum_cues          enable row level security;
alter table performances       enable row level security;
alter table ble_devices        enable row level security;
alter table user_preferences   enable row level security;

-- Helper: ¿el usuario actual pertenece a esta banda?
create or replace function is_band_member(p_band_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from band_members
    where band_id = p_band_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

-- ----- Bandas -----
create policy "bands: lectura para miembros"
  on bands for select using (is_band_member(id) or owner_id = auth.uid());
create policy "bands: insert por usuario autenticado"
  on bands for insert with check (owner_id = auth.uid());
create policy "bands: update solo owner"
  on bands for update using (owner_id = auth.uid());
create policy "bands: delete solo owner"
  on bands for delete using (owner_id = auth.uid());

-- ----- Band members -----
create policy "band_members: lectura por miembros mismos"
  on band_members for select using (is_band_member(band_id) or user_id = auth.uid());
create policy "band_members: insert por owner"
  on band_members for insert with check (
    exists (select 1 from bands where id = band_id and owner_id = auth.uid())
  );
create policy "band_members: update owner o self"
  on band_members for update using (
    user_id = auth.uid()
    or exists (select 1 from bands where id = band_id and owner_id = auth.uid())
  );
create policy "band_members: delete owner"
  on band_members for delete using (
    exists (select 1 from bands where id = band_id and owner_id = auth.uid())
  );

-- ----- Setlists, songs y tablas hijas (mismo patrón: ser miembro de la banda) -----
do $$
declare tbl text;
begin
  for tbl in select unnest(array['setlists','songs','performances','ble_devices'])
  loop
    execute format($f$create policy "%1$s: rw por miembros" on %1$s
      for all using (is_band_member(band_id)) with check (is_band_member(band_id));$f$, tbl);
  end loop;
end $$;

-- setlist_songs: heredan permiso vía setlist
create policy "setlist_songs: rw por miembros"
  on setlist_songs for all
  using (exists (select 1 from setlists s where s.id = setlist_id and is_band_member(s.band_id)))
  with check (exists (select 1 from setlists s where s.id = setlist_id and is_band_member(s.band_id)));

-- song_sections / lyric_lines / chord_charts / drum_cues: heredan vía song
do $$
declare tbl text;
begin
  for tbl in select unnest(array['song_sections','lyric_lines','chord_charts','drum_cues'])
  loop
    execute format($f$create policy "%1$s: rw por miembros" on %1$s
      for all
      using (exists (select 1 from songs s where s.id = song_id and is_band_member(s.band_id)))
      with check (exists (select 1 from songs s where s.id = song_id and is_band_member(s.band_id)));$f$, tbl);
  end loop;
end $$;

-- user_preferences: cada usuario sus propias prefs
create policy "user_preferences: self only"
  on user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================== 6. VISTAS ÚTILES ================================
create or replace view vw_setlist_full as
select
  sl.id              as setlist_id,
  sl.band_id,
  sl.name            as setlist_name,
  sl.show_date,
  sl.venue,
  ss.position,
  s.id               as song_id,
  s.title,
  s.artist,
  s.key,
  s.bpm,
  s.time_signature,
  s.program_change,
  s.daw_session_name,
  s.duration_seconds,
  s.tags
from setlists sl
join setlist_songs ss on ss.setlist_id = sl.id
join songs s          on s.id = ss.song_id
order by sl.created_at desc, ss.position asc;

comment on view vw_setlist_full is 'Setlist completo con la metadata de cada canción, ya ordenado.';

-- =========================== 7. DATOS SEED (opcional) ========================
-- Estos INSERTs asumen que ya hay un usuario logueado. Reemplazar
-- '00000000-0000-0000-0000-000000000000' por un user id real (auth.users.id)
-- antes de ejecutar el bloque.

-- do $$
-- declare
--   v_user uuid := '00000000-0000-0000-0000-000000000000';  -- <-- cambiar
--   v_band uuid; v_setlist uuid; v_song uuid;
-- begin
--   insert into bands (name, slug, owner_id, description, cover_color)
--   values ('CAMARAGE Demo Band', 'camarage-demo', v_user, 'Banda de prueba', '#22d3ee')
--   returning id into v_band;
--
--   insert into band_members (band_id, user_id, role, display_name)
--   values (v_band, v_user, 'owner', 'Pato');
--
--   insert into setlists (band_id, name, show_date, venue, created_by)
--   values (v_band, 'Setlist · Vivo Niceto', current_date + 14, 'Niceto Club', v_user)
--   returning id into v_setlist;
--
--   insert into songs (band_id, title, key, bpm, time_signature, program_change, daw_session_name, duration_seconds, created_by)
--   values (v_band, 'Lluvia de Neón', 'Am', 112, '4/4', 3, 'lluvia_neon_v2', 240, v_user)
--   returning id into v_song;
--
--   insert into setlist_songs (setlist_id, song_id, position) values (v_setlist, v_song, 1);
--
--   insert into song_sections (song_id, section_type, label, order_index, start_bar, bar_count) values
--     (v_song,'intro','Intro',1,0,4),
--     (v_song,'verse','Verse 1',2,4,8),
--     (v_song,'pre_chorus','Pre',3,12,4),
--     (v_song,'chorus','Chorus',4,16,8),
--     (v_song,'bridge','Bridge',5,24,4),
--     (v_song,'outro','Outro',6,28,4);
--
--   insert into lyric_lines (song_id, order_index, text, start_time_seconds) values
--     (v_song,1,'Caminamos bajo la lluvia de neón', 6),
--     (v_song,2,'la ciudad respira en cámara lenta', 10),
--     (v_song,3,'y tu voz es la única señal', 14),
--     (v_song,4,'que llega clara entre la tormenta', 18);
--
--   insert into chord_charts (song_id, order_index, chord_symbol, root_note, quality, start_bar, bar_count) values
--     (v_song,1,'Am','A','m',0,2),
--     (v_song,2,'F','F','',2,2),
--     (v_song,3,'Am','A','m',4,2),
--     (v_song,4,'G','G','',6,2),
--     (v_song,5,'F','F','',8,2),
--     (v_song,6,'E7','E','7',10,2);
--
--   insert into drum_cues (song_id, order_index, cue_type, label, start_bar, duration_bars) values
--     (v_song,1,'count_in','Count-in 4 negras',0,1),
--     (v_song,2,'fill','Fill antes de chorus',15,1),
--     (v_song,3,'transition','Break a bridge',23,1);
-- end $$;

-- =============================================================================
-- FIN del schema
-- =============================================================================
