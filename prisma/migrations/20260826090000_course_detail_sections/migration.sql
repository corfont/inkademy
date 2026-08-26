-- Secciones libres y opcionales en la ficha pública del curso (p.ej. "A
-- quién va dirigido", "Requisitos mínimos") — el admin decide si un curso
-- las tiene o no.
ALTER TABLE "Course" ADD COLUMN "detailSections" JSONB;
