-- Orden explícito de materiales (antes solo se ordenaban por fecha de
-- subida, sin forma de reordenarlos después de cargarlos).
ALTER TABLE "Material" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: conserva el orden actual (por fecha de subida) como punto de
-- partida, separado por lección/módulo — así ningún material "salta" de
-- posición al desplegar este cambio.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY COALESCE("lessonId", '') , COALESCE("moduleId", '') ORDER BY "createdAt" ASC) - 1 AS rn
  FROM "Material"
)
UPDATE "Material" m SET "order" = ranked.rn
FROM ranked
WHERE m."id" = ranked."id";
