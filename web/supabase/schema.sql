-- =============================================================================
-- CAMARAGE · Schema completo para Supabase v2 (con tabla midi_cues)
-- -----------------------------------------------------------------------------
-- Pegar en SQL Editor de Supabase y Run. Idempotente: usa DROP IF EXISTS.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================== LIMPIEZA ====================================
drop view  if exists vw_setlist_full cascade;

drop table if exists midi_cues          cascade;
drop table if exists ble_devices        cascade;
drop table if exists performances       cascade;
drop table if exists drum_cues          cascade;
drop table if exists chord_charts       cascade;
drop table if exists lyric_lines        cascade;
drop table if exists song_sections      cascade;
drop table if exists setlist_songs      cascade;
drop table if exists songs              cascade;
drop table if exists setlists           cascade;
drop table if exists band_members       cascade;
drop table if exists bands              cascade;
drop table if exists user_preferences   cascade;

drop type if exists band_role           cascade;
drop type if exists section_type        cascade;
drop type if exists cue_type            cascade;

-- ============================== TIPOS =======================================
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

-- ============================== TABLAS ======================================
create table bands (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  description text,
  cover_color text default '#22d3ee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table band_members (
  id uuid primary key default uuid_generate_v4(),
  band_id uuid not null references bands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role band_role not null default 'other',
  display_name text,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (band_id, user_id)
);

create table setlists (
  id uuid primary key default uuid_generate_v4(),
  band_id uuid not null references bands(id) on delete cascade,
  name text not null,
  show_date date,
  venue text,
  notes text,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table songs (
  id uuid primary key default uuid_generate_v4(),
  band_id uuid not null references bands(id) on delete cascade,
  title text not null,
  artist text,
  key text,
  bpm numeric(6,2) not null default 120,
  time_signature text not null default '4/4',
  program_change smallint check (program_change between 0 and 127),
  daw_session_name text,
  duration_seconds integer,
  has_click_track boolean not null default true,
  notes text,
  tags text[] default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_band_id_idx on songs(band_id);

create table setlist_songs (
  id uuid primary key default uuid_generate_v4(),
  setlist_id uuid not null references setlists(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  position integer not null,
  transition_notes text,
  created_at timestamptz not null default now(),
  unique (setlist_id, song_id)
);
create index setlist_songs_setlist_idx on setlist_songs(setlist_id, position);

create table song_sections (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  section_type section_type not null default 'verse',
  label text,
  order_index integer not null,
  start_bar integer not null default 0,
  bar_count integer not null default 4,
  start_time_seconds numeric(8,3),
  unique (song_id, order_index)
);

create table lyric_lines (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  section_id uuid references song_sections(id) on delete set null,
  order_index integer not null,
  text text not null,
  start_time_seconds numeric(8,3) not null,
  hold_seconds numeric(6,3),
  is_chorus_emphasis boolean not null default false,
  unique (song_id, order_index)
);
create index lyric_lines_song_idx on lyric_lines(song_id, start_time_seconds);

create table chord_charts (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  section_id uuid references song_sections(id) on delete set null,
  order_index integer not null,
  chord_symbol text not null,
  root_note text not null,
  quality text default '',
  bass_note text,
  start_bar integer not null,
  bar_count integer not null default 1,
  start_time_seconds numeric(8,3),
  unique (song_id, order_index)
);

create table drum_cues (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  section_id uuid references song_sections(id) on delete set null,
  order_index integer not null,
  cue_type cue_type not null default 'note',
  label text,
  start_bar integer not null,
  start_time_seconds numeric(8,3),
  duration_bars integer default 1,
  notes text,
  unique (song_id, order_index)
);

-- MIDI cues: nota MIDI que dispara salto a una parte de la canción
create table midi_cues (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  midi_note smallint not null check (midi_note between 0 and 127),
  label text not null,
  jump_to_seconds numeric(8,3) not null default 0,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  unique (song_id, midi_note)
);
create index midi_cues_song_idx on midi_cues(song_id, order_index);

create table performances (
  id uuid primary key default uuid_generate_v4(),
  band_id uuid not null references bands(id) on delete cascade,
  setlist_id uuid references setlists(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  venue text,
  songs_played integer default 0,
  audience_size integer,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table ble_devices (
  id uuid primary key default uuid_generate_v4(),
  band_id uuid not null references bands(id) on delete cascade,
  device_name text not null,
  device_uuid text not null,
  daw text,
  is_default boolean not null default false,
  paired_by uuid references auth.users(id),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (band_id, device_uuid)
);

create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_role band_role default 'singer',
  preferred_subdiv smallint default 1,
  show_metronome_flash boolean default true,
  haptic_feedback boolean default true,
  font_size_scale numeric(3,2) default 1.0,
  theme_intensity text default 'deep_black',
  audio_latency_ms integer default 88,
  updated_at timestamptz not null default now()
);

-- =============================== TRIGGERS ===================================
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  for t in select unnest(array['bands','setlists','songs','user_preferences']) loop
    execute format('drop trigger if exists trg_%I_updated on %I;', t, t);
    execute format('create trigger trg_%I_updated before update on %I
                    for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- =============================== RLS ========================================
alter table bands enable row level security;
alter table band_members enable row level security;
alter table setlists enable row level security;
alter table setlist_songs enable row level security;
alter table songs enable row level security;
alter table song_sections enable row level security;
alter table lyric_lines enable row level security;
alter table chord_charts enable row level security;
alter table drum_cues enable row level security;
alter table midi_cues enable row level security;
alter table performances enable row level security;
alter table ble_devices enable row level security;
alter table user_preferences enable row level security;

create or replace function is_band_member(p_band_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from band_members
    where band_id = p_band_id and user_id = auth.uid() and is_active = true
  );
$$;

-- BANDS
create policy "bands_select" on bands for select using (is_band_member(id) or owner_id = auth.uid());
create policy "bands_insert" on bands for insert with check (owner_id = auth.uid());
create policy "bands_update" on bands for update using (owner_id = auth.uid());
create policy "bands_delete" on bands for delete using (owner_id = auth.uid());

-- BAND_MEMBERS
create policy "band_members_select" on band_members for select using (is_band_member(band_id) or user_id = auth.uid());
create policy "band_members_insert" on band_members for insert with check (
  exists (select 1 from bands where id = band_id and owner_id = auth.uid())
  or user_id = auth.uid()  -- self-join (para que al crear banda el owner se agregue)
);
create policy "band_members_update" on band_members for update using (
  user_id = auth.uid() or exists (select 1 from bands where id = band_id and owner_id = auth.uid())
);
create policy "band_members_delete" on band_members for delete using (
  exists (select 1 from bands where id = band_id and owner_id = auth.uid())
);

-- Mismo patrón para tablas de banda
do $$ declare tbl text; begin
  for tbl in select unnest(array['setlists','songs','performances','ble_devices']) loop
    execute format($f$create policy "%1$s_rw" on %1$s
      for all using (is_band_member(band_id)) with check (is_band_member(band_id));$f$, tbl);
  end loop;
end $$;

-- setlist_songs heredan de setlist
create policy "setlist_songs_rw" on setlist_songs for all
  using (exists (select 1 from setlists s where s.id = setlist_id and is_band_member(s.band_id)))
  with check (exists (select 1 from setlists s where s.id = setlist_id and is_band_member(s.band_id)));

-- Tablas hijas de song
do $$ declare tbl text; begin
  for tbl in select unnest(array['song_sections','lyric_lines','chord_charts','drum_cues','midi_cues']) loop
    execute format($f$create policy "%1$s_rw" on %1$s for all
      using (exists (select 1 from songs s where s.id = song_id and is_band_member(s.band_id)))
      with check (exists (select 1 from songs s where s.id = song_id and is_band_member(s.band_id)));$f$, tbl);
  end loop;
end $$;

create policy "user_preferences_self" on user_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================== TRIGGER: owner auto-member =================
-- Cuando creás una banda, te agrega automáticamente como member con rol owner
create or replace function add_owner_as_member() returns trigger language plpgsql security definer as $$
begin
  insert into band_members (band_id, user_id, role, display_name)
  values (new.id, new.owner_id, 'owner', null)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_band_owner_member on bands;
create trigger trg_band_owner_member after insert on bands
for each row execute function add_owner_as_member();

-- ============================== VIEW ÚTIL ==================================
create or replace view vw_setlist_full as
select
  sl.id as setlist_id, sl.band_id, sl.name as setlist_name, sl.show_date, sl.venue,
  ss.position, s.id as song_id, s.title, s.artist, s.key, s.bpm,
  s.time_signature, s.program_change, s.daw_session_name, s.duration_seconds, s.tags
from setlists sl
join setlist_songs ss on ss.setlist_id = sl.id
join songs s on s.id = ss.song_id
order by sl.created_at desc, ss.position asc;

-- ============================== FIN ========================================
-- Para test rápido después de aplicar:
-- 1) Andá a Authentication → Sign Up con tu mail (magic link)
-- 2) En SQL Editor: insert into bands (name, owner_id) values ('Mi Banda', auth.uid());
-- 3) Volvé al cliente Supabase y ya tenés data.
