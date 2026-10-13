-- Copia externa de los respaldos en SharePoint (COMPLETITUD.md BD-50): el respaldo
-- vivía solo en el mismo VPS. Estado de la copia por respaldo + configuración (ruta).
ALTER TABLE "BackupRecord"
  ADD COLUMN IF NOT EXISTS "offsiteStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "offsiteUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "offsiteNote" TEXT,
  ADD COLUMN IF NOT EXISTS "offsiteAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "offsiteEncrypted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "BackupSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "sharepointEnabled" BOOLEAN NOT NULL DEFAULT false,
  "sharepointFolderUrl" TEXT,
  "lastTestAt" TIMESTAMP(3),
  "lastTestOk" BOOLEAN,
  "lastTestNote" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackupSettings_pkey" PRIMARY KEY ("id")
);
