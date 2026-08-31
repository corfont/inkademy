-- Lecciones de solo audio: contentType="AUDIO", misma mecánica de subida/
-- reproducción/progreso que VIDEO (ver ScormService/SCORM para el mismo
-- patrón de agregar un contentType nuevo).
ALTER TYPE "LessonContentType" ADD VALUE 'AUDIO';

ALTER TABLE "Lesson" ADD COLUMN "audioAssetId" TEXT;
