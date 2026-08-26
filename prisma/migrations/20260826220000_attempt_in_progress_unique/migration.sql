-- "Solo me dejó hacer 2 de 3 intentos" — un remontaje del runner del
-- examen (recargar, atrás del navegador, o una carrera real entre dos
-- requests casi simultáneas) podía crear más de un AssessmentAttempt
-- IN_PROGRESS para el mismo (assessmentId, userId, enrollmentId), quemando
-- intentos que el alumno nunca llegó a responder. AssessmentService.
-- createAttempt ya retoma el existente si lo encuentra, pero eso por sí
-- solo no cierra una carrera real entre dos requests que llegan casi al
-- mismo tiempo (ambas ven "no hay ninguno" antes de que la primera
-- termine de crear el suyo) — este índice único parcial es lo que
-- garantiza, a nivel de base de datos, que nunca pueda haber dos.
CREATE UNIQUE INDEX "AssessmentAttempt_one_in_progress_per_enrollment"
ON "AssessmentAttempt" ("assessmentId", "userId", "enrollmentId")
WHERE status = 'IN_PROGRESS';
