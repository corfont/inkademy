-- Sílabo del curso
ALTER TABLE "Course" ADD COLUMN "syllabusAssetId" TEXT;

-- Material: ahora puede colgar de un módulo entero (no solo de una lección),
-- con categoría (principal/complementario) y visibilidad para el alumno.
CREATE TYPE "MaterialCategory" AS ENUM ('MAIN', 'SUPPLEMENTARY');

ALTER TABLE "Material" ALTER COLUMN "lessonId" DROP NOT NULL;
ALTER TABLE "Material" ADD COLUMN "moduleId" TEXT;
ALTER TABLE "Material" ADD COLUMN "category" "MaterialCategory" NOT NULL DEFAULT 'MAIN';
ALTER TABLE "Material" ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Material" ADD CONSTRAINT "Material_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
