-- Un Assessment puede estar respaldado por un SCORM (Lesson o Material) en
-- vez de tener preguntas propias — relación 1:1 (@unique en ambos lados).
ALTER TABLE "Assessment" ADD COLUMN "scormLessonId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "scormMaterialId" TEXT;

CREATE UNIQUE INDEX "Assessment_scormLessonId_key" ON "Assessment"("scormLessonId");
CREATE UNIQUE INDEX "Assessment_scormMaterialId_key" ON "Assessment"("scormMaterialId");

ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_scormLessonId_fkey" FOREIGN KEY ("scormLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_scormMaterialId_fkey" FOREIGN KEY ("scormMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
