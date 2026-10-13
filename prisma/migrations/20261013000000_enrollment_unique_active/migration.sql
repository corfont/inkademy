-- Una persona no puede tener dos matrículas ACTIVAS del mismo curso ni del mismo
-- programa. Antes solo lo evitaba código de aplicación, y dos solicitudes en
-- paralelo (doble clic, webhook + redirección, reintento) podían crear dos
-- (REVIEW.md §3, COMPLETITUD.md BD-03). Índice PARCIAL y solo sobre ACTIVE:
-- "volver a llevar un curso" (retakeCourse) crea una matrícula nueva mientras la
-- anterior queda COMPLETED, así que varias COMPLETED del mismo curso son
-- legítimas; una vencida o cancelada tampoco bloquea volver a matricularse.
-- Verificado en producción antes de crearlo: 0 duplicados activos existentes.
CREATE UNIQUE INDEX IF NOT EXISTS "Enrollment_user_course_active_key"
  ON "Enrollment" ("userId", "courseId")
  WHERE "courseId" IS NOT NULL AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "Enrollment_user_program_active_key"
  ON "Enrollment" ("userId", "programId")
  WHERE "programId" IS NOT NULL AND "status" = 'ACTIVE';
