-- =============================================================================
-- CAMARAGE · Subir el límite de tamaño por archivo a 200 MB
-- -----------------------------------------------------------------------------
-- Para poder subir bounces en WAV. Requiere plan Pro (ya lo tenés).
--
-- OJO: esto solo levanta el techo DEL BUCKET. El proyecto tiene además un
-- límite global que por defecto está en 50 MB y manda sobre este. Hay que
-- subirlo a mano en:
--     Dashboard → Settings → Storage → "Upload file size limit" → 200 MB
-- Si no hacés ese paso, este SQL no alcanza y la subida va a seguir fallando.
-- =============================================================================

update storage.buckets
set file_size_limit = 209715200          -- 200 MB
where id = 'song-audio';

-- Verificación: tiene que devolver 209715200 y 200 MB
select
  file_size_limit                                as bytes,
  round(file_size_limit / 1048576.0)::int        as megas
from storage.buckets
where id = 'song-audio';
