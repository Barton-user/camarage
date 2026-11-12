-- =============================================================================
-- CAMARAGE · "El pulso del tiempo"
-- Canción + secciones + letra con tiempos, sacados del análisis de
-- "cancion el pulso del tiempo.mp3" (19 oct 2026).
-- -----------------------------------------------------------------------------
-- Correr entero en el SQL Editor de Supabase. Es idempotente: si la canción ya
-- existe la actualiza, y siempre reemplaza letras y secciones en vez de
-- duplicarlas, así que se puede correr las veces que haga falta.
--
-- MÉTODO (el mismo de §13 del CONTEXT.md): voz separada con Demucs, Whisper
-- large-v3 con marcas por palabra sobre la voz aislada, y los tiempos de línea
-- ajustados contra los valles de energía de la voz y, en los estribillos
-- repetidos, por correlación de la envolvente con el estribillo 1.
--
-- DATOS MEDIDOS (no estimados a ojo):
--   tempo       85,00 BPM hasta ~3:00 (rejilla de clicks contra el
--               instrumental: 85,00 saca 5,09 y los vecinos 4,4-4,9; el
--               detector automático de librosa tiró 112, que es falso).
--               ⚠ De 3:00 (compás 65, el puente) hasta el final el tema corre
--               a 85,9 BPM. No es un error de medición: la rejilla de 85 pierde
--               la fase justo ahí. Para la app se carga 85; la grilla de la
--               solapa Letras va a quedar ~0,7 s adelantada en el estribillo
--               final y ~1,3 s en el outro. Los tiempos de las LÍNEAS no se
--               ven afectados porque son absolutos.
--               (Si el tema se grabó con click, confirmá con el batero si
--               hay un cambio de tempo real en el puente.)
--   primer golpe  a los 0,035 s → compás 1 arranca prácticamente en t=0.
--   compás      4/4 → 1 compás = 2,8235 s · 1 tiempo = 0,7059 s
--   duración    el audio suena hasta 291,04 s (4:51,0) y después el MP3 tiene
--               8,3 s de silencio hasta 299,4 s.
--   tonalidad   Mi menor (Em) por correlación de perfil de croma (0,766,
--               contra 0,701 de Mi mayor y Si menor). Confirmalo con el
--               guitarrista: la app solo lo muestra.
--   entra la voz  0:42,5 (compás 16 justo). El grito "¡El pulso del tiempo!"
--               del principio (0,9 s) va como primera línea.
--   sin letra   199,6 → 243,9 s (solo de guitarra, 16 compases) y
--               267,3 → 291,0 s (final instrumental; Whisper no reconoce
--               palabras ahí, aunque el stem de voz tiene contenido: puede
--               ser la "más" sostenida o un "ahh". Si hay algo cantado,
--               agregalo a mano).
--
-- DUDAS DE TRANSCRIPCIÓN (marcadas con  -- ?  en la letra):
--   · "Dejos que giran" — Whisper lo oye así dos veces; podría ser "Ecos".
--   · "fugaz, perfecta y racional" — también salió "irracional" en otra
--     pasada. Elegí "racional" por la métrica, revisalo.
--   · "Vivir despacio, sentir vibrar" — en el estribillo 2 sonó como
--     "vive despacio, sentí vibrar". Dejé la misma letra en los tres.
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
   where band_id = v_band and lower(title) = lower('El pulso del tiempo') limit 1;

  if v_song is null then
    insert into songs (band_id, title, key, bpm, time_signature,
                       duration_seconds, has_click_track, notes)
    values (v_band, 'El pulso del tiempo', 'Em', 85, '4/4', 291, true,
            'Tempo medido 85,00 BPM (rejilla contra el instrumental) hasta el puente (3:00); '
            'de ahí al final corre a 85,9 BPM. Primer golpe a 0,035 s. '
            'Tiempos de letra tomados de "cancion el pulso del tiempo.mp3", que suena hasta 4:51,0.')
    returning id into v_song;
    raise notice 'Canción creada: %', v_song;
  else
    update songs set key = 'Em', bpm = 85, time_signature = '4/4',
                     duration_seconds = 291, updated_at = now()
     where id = v_song;
    raise notice 'Canción ya existía, actualizada: %', v_song;
  end if;

  -- --------------------------------------------------------------- limpieza --
  delete from lyric_lines   where song_id = v_song;
  delete from song_sections where song_id = v_song;

  -- -------------------------------------------------------------- secciones --
  -- start_bar y bar_count salen de la rejilla de 85 BPM. Los cortes se
  -- eligieron sobre el compás más cercano al cambio real de energía del audio.
  -- Del compás 65 en adelante start_time_seconds está medido con la rejilla
  -- de 85,9 BPM (por eso no coincide con start_bar × 2,8235).
  insert into song_sections (song_id, section_type, label, order_index,
                             start_bar, bar_count, start_time_seconds) values
    (v_song, 'intro',   'Intro',            0,   1, 15,   0.035),
    (v_song, 'verse',   'Verso 1',          1,  16, 16,  42.390),
    (v_song, 'chorus',  'Estribillo 1',     2,  32,  9,  87.560),
    (v_song, 'verse',   'Verso 2',          3,  41, 15, 112.980),
    (v_song, 'chorus',  'Estribillo 2',     4,  56,  9, 155.330),
    (v_song, 'bridge',  'Puente',           5,  65,  7, 180.740),
    (v_song, 'solo',    'Solo',             6,  72, 16, 200.290),
    (v_song, 'chorus',  'Estribillo final', 7,  88,  8, 244.980),
    (v_song, 'outro',   'Final',            8,  96,  8, 267.320);

  -- ------------------------------------------------------------------ letra --
  -- El tiempo de cada línea es el de su PRIMERA PALABRA cantada.
  insert into lyric_lines (song_id, order_index, start_time_seconds, text,
                           is_chorus_emphasis) values
    (v_song,  0,   0.900, '¡El pulso del tiempo!',                     false),
    (v_song,  1,   3.500, '— intro —',                                 false),

    (v_song,  2,  42.540, 'El tiempo respira',                         false),
    (v_song,  3,  45.420, 'detrás del sol.',                           false),
    (v_song,  4,  53.800, 'Nos va desnudando',                         false),
    (v_song,  5,  56.500, 'de lo que fue hoy.',                        false),
    (v_song,  6,  65.230, 'Somos reflejos',                            false),
    (v_song,  7,  67.410, 'en el mismo andar.',                        false),
    (v_song,  8,  76.500, 'Dejos que giran,',                          false), -- ? ¿"Ecos"?
    (v_song,  9,  78.430, 'vuelven y se van.',                         false),

    (v_song, 10,  86.160, 'Y si no hay más que este lugar,',           true),
    (v_song, 11,  90.260, 'deja que el viento te pueda guiar.',        true),
    (v_song, 12,  97.160, 'Vivir despacio, sentir vibrar,',            true),
    (v_song, 13, 102.900, 'la eternidad cabe en un parpadeo más.',     true),

    (v_song, 14, 116.010, 'Nada nos debe,',                            false),
    (v_song, 15, 118.840, 'nada nos da.',                              false),
    (v_song, 16, 127.400, 'Todo sucederá',                             false),
    (v_song, 17, 129.540, 'y se disolverá.',                           false),
    (v_song, 18, 138.460, 'Cada momento es una señal,',                false),
    (v_song, 19, 144.500, 'fugaz, perfecta y racional.',               false), -- ? ¿"irracional"?

    (v_song, 20, 153.930, 'Y si no hay más que este lugar,',           true),
    (v_song, 21, 158.030, 'deja que el viento te pueda guiar.',        true),
    (v_song, 22, 164.930, 'Vivir despacio, sentir vibrar,',            true),
    (v_song, 23, 170.670, 'la eternidad cabe en un parpadeo más.',     true),

    (v_song, 24, 177.610, 'Entre la sombra y la claridad,',            false),
    (v_song, 25, 183.600, 'algo te llama, no quiere esperar.',         false),
    (v_song, 26, 189.300, 'El tiempo observa, no dice más,',           false),
    (v_song, 27, 194.800, 'solo te invita a continuar.',               false),

    -- 199,6 a 243,9 s: solo de guitarra, sin voz. Línea guía para que el
    -- cantante vea que no se colgó la app y sepa cuánto falta.
    (v_song, 28, 199.600, '— solo —',                                  false),

    (v_song, 29, 243.920, 'Y si no hay más que este lugar,',           true),
    (v_song, 30, 247.940, 'deja que el viento te pueda guiar.',        true),
    (v_song, 31, 254.770, 'Vivir despacio, sentir vibrar,',            true),
    (v_song, 32, 260.440, 'la eternidad cabe en un parpadeo más.',     true),

    -- 267,3 a 291,0 s: final instrumental (ver nota arriba).
    (v_song, 33, 267.320, '— final —',                                 false);

  raise notice 'Listo: 34 líneas y 9 secciones para "%"', 'El pulso del tiempo';
end $$;

-- =============================================================================
-- VERIFICACIÓN — tiene que devolver 34 líneas y 9 secciones
-- =============================================================================
select s.title, s.bpm, s.key, s.time_signature, s.duration_seconds,
       (select count(*) from lyric_lines   l where l.song_id = s.id) as lineas,
       (select count(*) from song_sections x where x.song_id = s.id) as secciones
  from songs s
 where lower(s.title) = lower('El pulso del tiempo');

-- =============================================================================
-- PENDIENTES QUE NO PUEDO RESOLVER DESDE EL AUDIO
-- -----------------------------------------------------------------------------
-- 1 · program_change. Depende de qué patch usás en los pedales para este tema.
--     Cuando lo sepas:
--         update songs set program_change = <0-127>
--          where lower(title) = lower('El pulso del tiempo');
--
-- 2 · Eventos MIDI salientes. Ejemplo para entrar en el solo (compás 72 = 200,29 s):
--         insert into midi_events (song_id, time_seconds, kind, channel,
--                                  data1, label, target)
--         select id, 200.290, 'pc', 0, 12, 'Patch solo', 'master'
--           from songs where lower(title) = lower('El pulso del tiempo');
--
-- 3 · Si confirmás que el tempo cambia de verdad en el puente, la app hoy no
--     soporta dos tempos por canción: queda 85 y la grilla se corre un poco
--     al final (las letras no).
