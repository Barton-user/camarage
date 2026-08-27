-- ============================================================================
-- Fin marcado de la pista ("acá termina este audio")
-- ============================================================================
-- Algunos bounces traen silencio de cola (hasta ~20 s). En vez de recortar los
-- archivos, songs.audio_end_seconds guarda el segundo DEL ARCHIVO DE AUDIO
-- donde la canción termina de verdad. NULL = usar el archivo entero.
--
-- La app trata ese punto como el final real: la barra de progreso y el tiempo
-- restante terminan ahí, el countdown de auto-avance se arma 5 s antes de ese
-- punto, y el encadenado (chain_next) salta a la siguiente en ese instante.
--
-- Se setea desde la web: solapa Audio (campo mm:ss) o arrastrando la bandera
-- FIN sobre la forma de onda en la solapa Letras.
--
-- Correr en el SQL Editor de Supabase.

alter table songs add column if not exists audio_end_seconds numeric(8,3);

comment on column songs.audio_end_seconds is
  'Segundo del archivo de audio donde termina la canción (corta el silencio de cola). NULL = archivo entero.';
