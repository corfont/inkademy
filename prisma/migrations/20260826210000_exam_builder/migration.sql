-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "examFooterText" JSONB,
ADD COLUMN     "examHeaderText" JSONB,
ADD COLUMN     "examInstructionsText" JSONB;

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "footerTextOverride" JSONB,
ADD COLUMN     "headerTextOverride" JSONB,
ADD COLUMN     "instructionsOverride" JSONB,
ADD COLUMN     "titleFontFamily" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: no había ningún orden persistido antes (ni siquiera createdAt en
-- Question), así que se asigna un orden estable pero arbitrario por examen,
-- determinista por id — de acá en adelante el drag-and-drop del builder
-- controla el valor real.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "assessmentId" ORDER BY "id") - 1 AS rn
  FROM "Question"
  WHERE "assessmentId" IS NOT NULL
)
UPDATE "Question" q
SET "order" = ranked.rn
FROM ranked
WHERE q."id" = ranked."id";
