-- No-op: superada por 20260824180016_add_course_suggestions (crea la
-- tabla "CourseSuggestion" con estas mismas columnas desde el CREATE TABLE
-- — bug de orden de migraciones, ver el comentario largo ahí). Se deja
-- como SELECT sin efecto para no romper el historial ya aplicado contra
-- las bases de datos de desarrollo existentes.
SELECT 1;
