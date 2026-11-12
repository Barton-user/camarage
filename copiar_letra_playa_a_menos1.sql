-- =============================================================================
-- CAMARAGE · Copiar la letra de 'Hace mucho que no voy a la playa'
--            a 'Hace mucho que no voy a la playa -1'
-- Correr en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- Los tiempos se copian tal cual: subir o bajar el tono no cambia la duración del audio.
-- =============================================================================

-- 1 · LETRA (borra la que tenga la -1 y copia la de la original)
delete from lyric_lines
where song_id = (select id from songs where title = 'Hace mucho que no voy a la playa -1');

with orig as (select id from songs where title = 'Hace mucho que no voy a la playa'),
     dest as (select id from songs where title = 'Hace mucho que no voy a la playa -1')
insert into lyric_lines (song_id, order_index, start_time_seconds, hold_seconds, is_chorus_emphasis, text)
select (select id from dest), l.order_index, l.start_time_seconds, l.hold_seconds, l.is_chorus_emphasis, l.text
from lyric_lines l
where l.song_id = (select id from orig);

-- 2 · Offset y tono B. Medido el 12 nov 2026: el bounce -1 de Logic arranca
--     UN COMPÁS más tarde que el original (3,38 s a 71 BPM), constante en todo el tema.
update songs d
set offset_seconds = o.offset_seconds + 3.380,
    key            = 'B'
from songs o
where o.title = 'Hace mucho que no voy a la playa'
  and d.title = 'Hace mucho que no voy a la playa -1';

-- 3 · OPCIONAL · Pentagrama del bajo transpuesto un semitono abajo.
--     Sacale los "--" si querés que el bajista lea las notas ya bajadas.
--     (Si prefiere afinar el bajo medio tono abajo y leer igual, NO corras esto:
--      copiá las notas sin el "- 1" y poné tuning_semitones = -1 en la -1.)
-- delete from bass_notes
-- where song_id = (select id from songs where title = 'Hace mucho que no voy a la playa -1');
-- with orig as (select id from songs where title = 'Hace mucho que no voy a la playa'),
--      dest as (select id from songs where title = 'Hace mucho que no voy a la playa -1')
-- insert into bass_notes (song_id, midi, start_beat, duration_beats, accidental)
-- select (select id from dest), b.midi - 1, b.start_beat, b.duration_beats, null
-- from bass_notes b
-- where b.song_id = (select id from orig);

-- Verificación: las dos columnas tienen que dar el mismo número de renglones
select
  (select count(*) from lyric_lines l join songs s on s.id = l.song_id
     where s.title = 'Hace mucho que no voy a la playa')    as renglones_original,
  (select count(*) from lyric_lines l join songs s on s.id = l.song_id
     where s.title = 'Hace mucho que no voy a la playa -1') as renglones_menos1;
