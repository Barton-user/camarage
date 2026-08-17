-- =============================================================================
-- CAMARAGE · Migración — Eventos MIDI salientes por canción
-- -----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase. Idempotente.
--
-- Guarda los eventos MIDI que la app DISPARA mientras corre la pista: cambios
-- de patch en los pedales, CC de efectos, escenas de luces. Es la contraparte
-- de midi_cues, que son los que la app RECIBE desde Logic.
--
-- Los tiempos están en segundos desde el inicio del archivo de audio — la misma
-- referencia que usan las letras. Si el bounce y el .mid arrancan en puntos
-- distintos, se corrige con el offset por canción, no reimportando.
--
-- target: quién dispara el evento.
--   'master'  → el dispositivo que reproduce la pista (precisión de ms, sin red)
--   'guitarist' / 'bassist' / 'drummer' / 'singer' / 'keys' / 'fx'
--             → el dispositivo de ese integrante, al equipo que tiene al lado
-- =============================================================================

create table if not exists midi_events (
  id            uuid primary key default uuid_generate_v4(),
  song_id       uuid not null references songs(id) on delete cascade,
  time_seconds  numeric(9,3) not null,
  kind          text not null check (kind in ('pc','cc','note_on','note_off')),
  channel       smallint not null default 0 check (channel between 0 and 15),
  data1         smallint not null check (data1 between 0 and 127),  -- programa / nº de CC / nota
  data2         smallint          check (data2 between 0 and 127),  -- valor / velocity
  label         text,
  target        text not null default 'master',
  enabled       boolean not null default true,
  source        text,                                   -- nombre del .mid importado
  created_at    timestamptz not null default now()
);

create index if not exists midi_events_song_idx on midi_events(song_id, time_seconds);

comment on table midi_events is
  'Eventos MIDI que la app dispara durante la reproducción, agendados sobre el reloj del audio.';
comment on column midi_events.target is
  'master = lo dispara quien reproduce. Un rol = lo dispara el dispositivo de ese integrante.';

-- RLS: mismo criterio que el resto — solo integrantes de la banda dueña
alter table midi_events enable row level security;

drop policy if exists "midi_events: lectura miembros" on midi_events;
drop policy if exists "midi_events: escritura miembros" on midi_events;

create policy "midi_events: lectura miembros"
  on midi_events for select
  using (exists (
    select 1 from songs s where s.id = midi_events.song_id and is_band_member(s.band_id)
  ));

create policy "midi_events: escritura miembros"
  on midi_events for all
  using (exists (
    select 1 from songs s where s.id = midi_events.song_id and is_band_member(s.band_id)
  ))
  with check (exists (
    select 1 from songs s where s.id = midi_events.song_id and is_band_member(s.band_id)
  ));

-- Verificación: tabla = 1 · politicas = 2
select
  (select count(*) from information_schema.tables
     where table_name = 'midi_events')                          as tabla,
  (select count(*) from pg_policies
     where tablename = 'midi_events')                           as politicas;
