-- =============================================================================
-- CAMARAGE · "Caminé sin mirar atrás"
-- Canción + secciones + letra con tiempos, del análisis de
-- "camine sin mirar atras 18 julio.mp3"
-- -----------------------------------------------------------------------------
-- Correr entero en el SQL Editor de Supabase. Idempotente: si la canción existe
-- la actualiza, y siempre reemplaza letras y secciones en vez de duplicarlas.
--
-- DATOS MEDIDOS:
--   tempo       125,00 BPM exactos. Búsqueda de 60 a 185 BPM en pasos de 0,1 y
--               después afinado a 0,01: 125,00 saca puntaje 1,388 y sus vecinos
--               (124, 124.5, 125.5, 126) entre 0,098 y 0,128. Sin ambigüedad.
--               Ojo: el candidato más alto en bruto fue 62,5 BPM, que es la
--               MITAD de 125 — el tema tiene el golpe fuerte cada dos tiempos.
--               125 es el tempo con el que hay que programar el click.
--   sin deriva  Medido por separado en la primera y la segunda mitad: 125,00 en
--               las dos. El tempo no se mueve en todo el tema.
--   primer golpe  0,084 s → arranca en el primer tiempo del compás 1.
--   compás      4/4 → 1 compás = 1,92 s · 1 tiempo = 0,48 s
--   duración    suena hasta 262,44 s (4:22,4). Después hay 14,3 s de silencio
--               en el MP3, hasta 276,8 s.
--   tonalidad   Sol menor (Gm) por correlación de perfil de croma: 0,896, muy
--               por encima del segundo candidato (0,649). Es el resultado más
--               firme de las dos canciones que analicé hoy.
--
-- LA VOZ ENTRA A LOS 46 s. Los primeros 46 segundos son instrumentales: son
-- 24 compases justos, y la voz entra exactamente en el compás 25. Lo que suena
-- en el stem de voz entre 21 y 34 s NO es voz (medido: "voicedness" 0,12 y
-- dispersión de altura de 1200 cents) — es filtración de un instrumento.
--
-- Los tiempos son en segundos desde el inicio de ESTE archivo. Si bounceás la
-- pista de escenario y arranca en otro punto, se corrige con el offset.
-- =============================================================================

do $$
declare
  v_band uuid;
  v_song uuid;
begin
  select band_id into v_band from songs order by created_at limit 1;
  if v_band is null then
    raise exception 'No encontré ninguna banda. Cargá al menos una canción antes.';
  end if;

  select id into v_song from songs
   where band_id = v_band and lower(title) = lower('Caminé sin mirar atrás') limit 1;

  if v_song is null then
    insert into songs (band_id, title, key, bpm, time_signature,
                       duration_seconds, has_click_track, notes)
    values (v_band, 'Caminé sin mirar atrás', 'Gm', 125, '4/4', 263, true,
            'Tempo medido 125,00 BPM, sin deriva entre la primera y la segunda mitad. '
            'Primer golpe a 0,084 s. Intro instrumental de 24 compases: la voz entra en el compás 25 (46 s). '
            'Tiempos tomados del mix del 18 de julio, que suena hasta 4:22,4.')
    returning id into v_song;
    raise notice 'Canción creada: %', v_song;
  else
    update songs set key = 'Gm', bpm = 125, time_signature = '4/4',
                     duration_seconds = 263, updated_at = now()
     where id = v_song;
    raise notice 'Canción ya existía, actualizada: %', v_song;
  end if;

  delete from lyric_lines   where song_id = v_song;
  delete from song_sections where song_id = v_song;

  -- -------------------------------------------------------------- secciones --
  -- Los cortes caen en compases exactos y encajan sin huecos: la última termina
  -- en el compás 138 (263,1 s), a 0,7 s del final real del audio.
  insert into song_sections (song_id, section_type, label, order_index,
                             start_bar, bar_count, start_time_seconds) values
    (v_song, 'intro',      'Intro',            0,   1, 24,   0.084),
    (v_song, 'verse',      'Verso 1',          1,  25, 16,  46.164),
    (v_song, 'pre_chorus', 'Pre-estribillo',   2,  41, 15,  76.884),
    (v_song, 'chorus',     'Estribillo 1',     3,  56, 12, 105.684),
    (v_song, 'verse',      'Verso 2',          4,  68,  7, 128.724),
    (v_song, 'chorus',     'Estribillo 2',     5,  75,  9, 142.164),
    (v_song, 'interlude',  'Instrumental',     6,  84,  8, 159.444),
    (v_song, 'bridge',     'Puente cantado',   7,  92, 16, 174.804),
    (v_song, 'outro',      'Outro instrumental', 8, 108, 22, 205.524),
    (v_song, 'chorus',     'Coda',             9, 130,  8, 247.764);

  -- ------------------------------------------------------------------ letra --
  -- El tiempo de cada línea es el de su primera palabra cantada, con marcas por
  -- palabra sobre la voz aislada del instrumental.
  insert into lyric_lines (song_id, order_index, start_time_seconds, text,
                           is_chorus_emphasis) values
    (v_song,  0,  46.240, 'Caminé en la oscuridad,',              false),
    (v_song,  1,  49.040, 'bajo el sol cansado,',                 false),
    (v_song,  2,  50.300, 'un sueño largo.',                      false),
    (v_song,  3,  54.480, 'Respiré sin dudar.',                   false),
    (v_song,  4,  61.380, 'Me extrañé, luché sin pensar',         false),
    (v_song,  5,  64.600, 'y quedé agotado.',                     false),
    (v_song,  6,  65.700, 'Pasó muy largo,',                      false),
    (v_song,  7,  67.540, 'te dejé avanzar.',                     false),

    (v_song,  8,  76.980, 'Nunca el tiempo no volvió a marcar',   false),
    (v_song,  9,  80.680, 'lo que fui, lo que perdí.',            false),
    (v_song, 10,  83.080, 'En el ruido me encontré,',             false),
    (v_song, 11,  88.920, 'volviendo a mí.',                      false),
    (v_song, 12,  91.620, 'Vi mi sombra al despertar.',           false),
    (v_song, 13,  94.880, 'Ya no hay nada que temer.',            false),
    (v_song, 14,  99.580, 'Si el vacío no va a quedar',           false),
    (v_song, 15, 104.400, 'esperándome.',                         false),

    (v_song, 16, 105.280, 'He seguido hasta el final,',           true),
    (v_song, 17, 107.960, 'pero sigo en pie.',                    true),
    (v_song, 18, 109.480, 'He vuelto a soñar',                    true),
    (v_song, 19, 114.020, 'lo que quise encontrar.',              true),
    (v_song, 20, 116.020, 'Lo hallé en tu piel,',                 true),
    (v_song, 21, 118.700, 'vuelvo a empezar.',                    true),

    (v_song, 22, 129.740, 'Me quedé',                             false),
    (v_song, 23, 131.860, 'frente al mismo mar,',                 false),
    (v_song, 24, 133.580, 'donde todo arde,',                     false),
    (v_song, 25, 135.560, 'donde acaba el mar.',                  false),
    (v_song, 26, 137.260, 'Vi tu voz romper el cristal,',         false),
    (v_song, 27, 141.380, 'son mil sombras que no saben olvidar.', false),

    (v_song, 28, 145.540, 'He seguido hasta el final,',           true),
    (v_song, 29, 148.520, 'pero sigo en pie,',                    true),
    (v_song, 30, 150.040, 'vuelvo a soñar',                       true),
    (v_song, 31, 152.440, 'lo que quise encontrar.',              true),
    (v_song, 32, 156.460, 'Lo hallé en tu piel,',                 true),
    (v_song, 33, 158.200, 'vuelvo a empezar.',                    true),

    (v_song, 34, 159.444, '— instrumental —',                     false),

    (v_song, 35, 174.400, 'Cada sombra que dejé',                 false),
    (v_song, 36, 178.760, 'se disuelve al despertar.',            false),
    (v_song, 37, 182.540, 'Hoy mi voz vuelve a nacer.',           false),
    (v_song, 38, 186.480, 'Ya no hay miedo, puedo amar.',         false),
    (v_song, 39, 190.560, 'Siento el aire respirar.',             false),
    (v_song, 40, 195.160, 'Ya no miro hacia atrás.',              false),
    (v_song, 41, 199.840, 'Sin un pie, sin un paso,',             false),
    (v_song, 42, 201.740, 'vuelvo a empezar.',                    false),

    (v_song, 43, 205.524, '— instrumental —',                     false),
    (v_song, 44, 248.920, 'Es ahí donde encontré la paz.',        true);

  raise notice 'Listo: 45 líneas y 10 secciones para "%"', 'Caminé sin mirar atrás';
end $$;

-- =============================================================================
-- VERIFICACIÓN — tiene que devolver 45 líneas y 10 secciones
-- =============================================================================
select s.title, s.bpm, s.key, s.time_signature, s.duration_seconds,
       (select count(*) from lyric_lines   l where l.song_id = s.id) as lineas,
       (select count(*) from song_sections x where x.song_id = s.id) as secciones
  from songs s
 where lower(s.title) = lower('Caminé sin mirar atrás');

-- =============================================================================
-- LO QUE NO PUEDO RESOLVER DESDE EL AUDIO
-- -----------------------------------------------------------------------------
-- 1 · program_change: depende del patch de los pedales para este tema.
--         update songs set program_change = <0-127>
--          where lower(title) = lower('Caminé sin mirar atrás');
--
-- 2 · Eventos MIDI salientes. Ejemplo para el arranque del puente cantado
--     (compás 92 = 174,80 s), comentado a propósito:
--         insert into midi_events (song_id, time_seconds, kind, channel,
--                                  data1, label, target)
--         select id, 174.804, 'pc', 0, 12, 'Patch puente', 'master'
--           from songs where lower(title) = lower('Caminé sin mirar atrás');
--
-- 3 · El archivo NO sirve como pista de escenario: correlación L/R de 0,435 con
--     contenido lateral y sin click detectable en ninguno de los dos canales
--     (puntajes negativos en la rejilla de 125 BPM). Es un mix normal. Para el
--     escenario hay que bouncear la versión con click a la izquierda, arrancando
--     en el primer sonido y sin los 14 s de cola.
-- =============================================================================
