-- AlterTable
ALTER TABLE "PlatformSettings" ALTER COLUMN "logoHeightPx" SET DEFAULT 64;

-- El default anterior (32) ya había quedado guardado en la fila única de
-- configuración antes de este cambio (nadie lo había tocado explícitamente
-- desde /admin/apariencia todavía) — se actualiza esa fila para que el
-- nuevo default aplique también en entornos ya inicializados, sin pisar
-- una personalización real de un admin que sí haya elegido 32px a propósito.
UPDATE "PlatformSettings" SET "logoHeightPx" = 64 WHERE "logoHeightPx" = 32;
