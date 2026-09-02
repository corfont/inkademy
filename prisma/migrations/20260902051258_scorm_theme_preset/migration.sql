-- Brand kit reutilizable del editor de autoría SCORM (colores/tipografía/
-- tamaño/estilo) — catálogo global, solo para presets que el propio equipo
-- guarda (los "de fábrica" viven como constantes en @inkademy/shared).
CREATE TABLE "ScormThemePreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScormThemePreset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScormThemePreset" ADD CONSTRAINT "ScormThemePreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
