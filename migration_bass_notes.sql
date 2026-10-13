-- ============================================================================
-- Pentagrama del bajo + afinación por canción
-- Correr UNA vez en Supabase → SQL Editor → Run.
-- ============================================================================

-- Notas de la línea de bajo. Altura en MIDI ESCRITO (clave de fa, como se
-- escribe el bajo: suena una octava más grave). Tiempo en negras desde el
-- compás 1 (0 = primer tiempo del compás 1; 0.5 = la corchea siguiente).
create table if not exists bass_notes (
  id              uuid primary key default uuid_generate_v4(),
  song_id         uuid not null references songs(id) on delete cascade,
  midi            smallint not null check (midi between 0 and 127),
  start_beat      numeric(9,3) not null check (start_beat >= 0),
  duration_beats  numeric(6,3) not null default 0.5 check (duration_beats > 0),
  created_at      timestamptz not null default now()
);
create index if not exists bass_notes_song_idx on bass_notes(song_id, start_beat);

alter table bass_notes enable row level security;
drop policy if exists "bass_notes_rw" on bass_notes;
create policy "bass_notes_rw" on bass_notes for all
  using (exists (select 1 from songs s where s.id = song_id and is_band_member(s.band_id)))
  with check (exists (select 1 from songs s where s.id = song_id and is_band_member(s.band_id)));

-- Afinación real del tema respecto de la escrita: un Fa escrito suena
-- Fa + semitonos + cents. Ej.: medio tono abajo = -1 / 0; La=432 ≈ 0 / -32.
alter table songs add column if not exists tuning_semitones smallint     not null default 0;
alter table songs add column if not exists tuning_cents     numeric(5,1) not null default 0;
