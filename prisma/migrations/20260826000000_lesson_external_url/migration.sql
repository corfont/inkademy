-- Lecciones tipo LINK necesitan un campo real para guardar la URL — antes
-- no existía ninguno, así que ese tipo de lección era imposible de usar.
ALTER TABLE "Lesson" ADD COLUMN "externalUrl" TEXT;
