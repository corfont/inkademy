-- La pregunta cualitativa (comentario abierto) de la encuesta NPS también
-- la puede redactar el admin ahora, antes era un texto fijo en código.
ALTER TABLE "NpsSurvey" ADD COLUMN "commentPrompt" JSONB;
