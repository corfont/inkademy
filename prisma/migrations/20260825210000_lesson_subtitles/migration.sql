-- Subtítulos/transcripción automática de lecciones en video (Gemini).
ALTER TABLE "Lesson" ADD COLUMN "subtitlesAssetId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "subtitlesStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Lesson" ADD COLUMN "subtitlesError" TEXT;
