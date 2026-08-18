-- =============================================================================
-- CAMARAGE · "La nueva sangre"
-- Canción + secciones + letra con tiempos, sacados del análisis de CARNE 2026.mp3
-- -----------------------------------------------------------------------------
-- Correr entero en el SQL Editor de Supabase. Es idempotente: si la canción ya
-- existe la actualiza, y siempre reemplaza letras y secciones en vez de
-- duplicarlas, así que se puede correr las veces que haga falta.
--
-- DATOS MEDIDOS (no estimados a ojo):
--   tempo       135,00 BPM exactos. Se probó una rejilla de 132 a 140 BPM en
--               pasos de 0,02 contra los golpes del instrumental: 135 saca
--               puntaje 1,138 y sus vecinos 0,10-0,15. No hay ambigüedad.
--   primer golpe  a los 0,090 s → el tema arranca en el primer tiempo del
--               compás 1, casi sin aire adelante.
--   compás      4/4 → 1 compás = 1,7778 s · 1 tiempo = 0,4444 s
--   duración    el audio suena hasta 215,72 s (3:35,7) y después el MP3 tiene
--               62,4 s de SILENCIO hasta 278,1 s. Ver la nota del final.
--   tonalidad   Sol# menor (G#m) por correlación de perfil de croma (0,788,
--               contra 0,604 del segundo candidato, que es su relativo mayor).
--               Confirmalo con el guitarrista: la app solo lo muestra.
--
-- LOS TIEMPOS DE LA LETRA están en segundos desde el inicio de ESTE archivo.
-- Si después bounceás la pista de escenario y arranca en otro punto, NO hay que
-- rehacer nada: se corrige con el campo offset de la canción.
-- =============================================================================

do $$
declare
  v_band  uuid;
  v_song  uuid;
begin
  -- Banda: la misma a la que pertenecen las canciones que ya están cargadas
  select band_id into v_band from songs order by created_at limit 1;
  if v_band is null then
    raise exception 'No encontré ninguna banda. Cargá al menos una canción antes.';
  end if;

  -- ---------------------------------------------------------------- canción --
  select id into v_song from songs
   where band_id = v_band and lower(title) = lower('La nueva sangre') limit 1;

  if v_song is null then
    insert into songs (band_id, title, key, bpm, time_signature,
                       duration_seconds, has_click_track, notes)
    values (v_band, 'La nueva sangre', 'G#m', 135, '4/4', 216, true,
            'Tempo medido 135,00 BPM (rejilla contra el instrumental). Primer golpe a 0,090 s. '
            'Tiempos de letra tomados del mix CARNE 2026.mp3, que suena hasta 3:35,7.')
    returning id into v_song;
    raise notice 'Canción creada: %', v_song;
  else
    update songs set key = 'G#m', bpm = 135, time_signature = '4/4',
                     duration_seconds = 216, updated_at = now()
     where id = v_song;
    raise notice 'Canción ya existía, actualizada: %', v_song;
  end if;

  -- --------------------------------------------------------------- limpieza --
  delete from lyric_lines   where song_id = v_song;
  delete from song_sections where song_id = v_song;

  -- -------------------------------------------------------------- secciones --
  -- start_bar y bar_count salen de la rejilla de 135 BPM. Los cortes se
  -- eligieron sobre el compás más cercano al cambio real de energía del audio.
  insert into song_sections (song_id, section_type, label, order_index,
                             start_bar, bar_count, start_time_seconds) values
    (v_song, 'intro',     'Intro',            0,   1, 13,   0.090),
    (v_song, 'verse',     'Verso 1',          1,  14, 18,  23.200),
    (v_song, 'chorus',    'Estribillo 1',     2,  32,  6,  55.200),
    (v_song, 'verse',     'Verso 2',          3,  38, 17,  65.870),
    (v_song, 'chorus',    'Estribillo 2',     4,  55, 16,  96.090),
    (v_song, 'breakdown', 'Bajón',            5,  71,  8, 124.530),
    (v_song, 'solo',      'Solo',             6,  79, 24, 138.750),
    (v_song, 'bridge',    'Puente cantado',   7, 103,  7, 181.420),
    (v_song, 'chorus',    'Estribillo final', 8, 110, 12, 193.870);

  -- ------------------------------------------------------------------ letra --
  -- El tiempo de cada línea es el de su PRIMERA PALABRA cantada, medido con
  -- marcas por palabra sobre la voz aislada del instrumental.
  insert into lyric_lines (song_id, order_index, start_time_seconds, text,
                           is_chorus_emphasis) values
    (v_song,  0,  24.520, 'Entre ruinas me encontré,',                false),
    (v_song,  1,  27.860, 'sin voz, sin dirección.',                  false),
    (v_song,  2,  31.120, 'El tiempo ardía lento en mi interior.',    false),
    (v_song,  3,  38.420, 'Vi el reflejo del dolor caer y renacer.',  false),
    (v_song,  4,  45.380, 'Cada grieta se volvió',                    false),
    (v_song,  5,  48.800, 'en mi piel.',                              false),

    (v_song,  6,  55.100, 'Sangre nueva,',                            true),
    (v_song,  7,  60.720, 'vuelve a girar.',                          true),

    (v_song,  8,  65.900, 'En las sombras me oculté para no olvidar',  false),
    (v_song,  9,  73.680, 'lo que un día me hizo despertar.',         false),
    (v_song, 10,  81.780, 'Ya no espero salvación, solo respirar.',   false),
    (v_song, 11,  88.320, 'El vacío sabe transformar.',               false),

    (v_song, 12,  98.120, 'Sangre nueva,',                            true),
    (v_song, 13, 103.420, 'vuelve a girar.',                          true),
    (v_song, 14, 112.060, 'Sangre nueva,',                            true),
    (v_song, 15, 117.600, 'vuelve a girar.',                          true),

    -- 122 a 180 s: bajón + solo, sin voz. Una línea guía para que el cantante
    -- vea que no se colgó la app y sepa cuánto falta.
    (v_song, 16, 124.530, '— bajón + solo —',                         false),

    (v_song, 17, 180.620, 'Mi excepción, mi elección,',               false),
    (v_song, 18, 184.280, 'dar todo para y por vos,',                 false),
    (v_song, 19, 188.560, 'dejar atrás la vida que odiás.',           false),

    (v_song, 20, 194.140, '¡Carne!',                                  true),
    (v_song, 21, 197.460, 'Es mi carne.',                             true),
    (v_song, 22, 202.160, '¡Carne!',                                  true),
    (v_song, 23, 204.640, 'Es mi carne.',                             true);

  raise notice 'Listo: 24 líneas y 9 secciones para "%"', 'La nueva sangre';
end $$;

-- =============================================================================
-- VERIFICACIÓN — tiene que devolver 24 líneas y 9 secciones
-- =============================================================================
select s.title, s.bpm, s.key, s.time_signature, s.duration_seconds,
       (select count(*) from lyric_lines   l where l.song_id = s.id) as lineas,
       (select count(*) from song_sections x where x.song_id = s.id) as secciones
  from songs s
 where lower(s.title) = lower('La nueva sangre');

-- =============================================================================
-- PENDIENTES QUE NO PUEDO RESOLVER DESDE EL AUDIO
-- -----------------------------------------------------------------------------
-- 1 · program_change. Depende de qué patch usás en los pedales para este tema.
--     Cuando lo sepas:
--         update songs set program_change = <0-127>
--          where lower(title) = lower('La nueva sangre');
--
-- 2 · Eventos MIDI salientes. Si querés que la app dispare cambios de patch
--     durante el tema, van en midi_events con el tiempo en segundos de ESTE
--     archivo. Ejemplo para entrar en el solo (compás 79 = 138,75 s):
--         insert into midi_events (song_id, time_seconds, kind, channel,
--                                  data1, label, target)
--         select id, 138.750, 'pc', 0, 12, 'Patch solo', 'master'
--           from songs where lower(title) = lower('La nueva sangre');
--     Lo dejo comentado a propósito: inventar números de patch sería peor que
--     no poner nada.
--
-- 3 · El archivo de audio. Este MP3 NO sirve como pista de escenario:
--     es un mix estéreo normal, sin click y sin la separación de canales que
--     usás (izquierda click+secuencias, derecha solo secuencias). Y arrastra
--     62 s de silencio al final que la app va a contar como duración.
--     Para el escenario hay que bouncear la versión con click, arrancando en
--     el primer sonido y sin cola.
-- =============================================================================
