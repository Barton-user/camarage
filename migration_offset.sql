-- =============================================================================
-- CAMARAGE · Migración — Offset por canción
-- -----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase. Idempotente.
--
-- Corrige un desfase CONSTANTE entre el archivo de audio y los tiempos de las
-- letras / eventos MIDI. Sirve cuando el bounce nuevo arranca en un punto
-- distinto del que se usó para transcribir las letras con Whisper.
--
--   offset_seconds > 0  → el contenido va ADELANTADO: la app suma tiempo,
--                          o sea la letra aparece MÁS TARDE
--   offset_seconds < 0  → el contenido va ATRASADO: la letra aparece MÁS TEMPRANO
--
-- Se aplica a letras, cifrado y eventos MIDI a la vez. NO afecta el tiempo que
-- muestra el transporte, que sigue siendo la posición real dentro del archivo.
-- =============================================================================

alter table songs add column if not exists offset_seconds numeric(6,3) not null default 0;

comment on column songs.offset_seconds is
  'Corrección de desfase constante, en segundos. Se suma a la posición del audio antes de buscar la letra, el acorde o el evento MIDI. 0 = sin corrección.';

-- Verificación: tiene que devolver 1
select count(*) as columna
from information_schema.columns
where table_name = 'songs' and column_name = 'offset_seconds';
