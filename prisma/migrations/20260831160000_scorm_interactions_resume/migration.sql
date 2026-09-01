-- Editor SCORM v2: analítica por pregunta (cmi.interactions) + reanudar
-- donde quedó (cmi.core.lesson_location / cmi.location).
ALTER TABLE "LessonProgress"
  ADD COLUMN "scormInteractions" JSONB,
  ADD COLUMN "scormLessonLocation" TEXT;
