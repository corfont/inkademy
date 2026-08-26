-- Módulos SCORM: lecciones que reproducen un paquete SCORM 1.2/2004 subido
-- como .zip (desempaquetado a S3/MinIO), con progreso reportado por el
-- paquete mismo vía su propia API (cmi.core.lesson_status/completion_status).
ALTER TYPE "LessonContentType" ADD VALUE 'SCORM';

ALTER TABLE "Lesson"
  ADD COLUMN "scormPackagePrefix" TEXT,
  ADD COLUMN "scormEntryPath" TEXT,
  ADD COLUMN "scormVersion" TEXT;

ALTER TABLE "LessonProgress"
  ADD COLUMN "scormCompletionStatus" TEXT,
  ADD COLUMN "scormScoreRaw" DOUBLE PRECISION;
