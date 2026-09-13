-- No-op: superada por 20260824100000_batch2_multirole_partners_scheduling,
-- que ahora crea "detractionEnabled" directamente (bug de orden de
-- migraciones — ver el comentario largo en esa carpeta). Esta migración
-- se deja como un SELECT sin efecto en vez de borrarla para no romper el
-- historial ya aplicado contra las bases de datos de desarrollo
-- existentes (que ya la tienen marcada como aplicada bajo este nombre).
SELECT 1;
