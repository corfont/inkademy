-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "moduleId" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Assessment_moduleId_idx" ON "Assessment"("moduleId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: no había ningún orden persistido antes (getMineDetail ordenaba
-- por "id", sin ningún significado) — se asigna un orden estable pero
-- arbitrario por curso, determinista por id; de acá en adelante el
-- drag-and-drop del admin controla el valor real (AssessmentService.reorderAssessments).
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "courseId" ORDER BY "id") - 1 AS rn
  FROM "Assessment"
)
UPDATE "Assessment" a
SET "order" = ranked.rn
FROM ranked
WHERE a."id" = ranked."id";
