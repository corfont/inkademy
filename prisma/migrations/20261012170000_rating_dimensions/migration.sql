ALTER TABLE "CourseRating" ADD COLUMN IF NOT EXISTS "improvements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE IF NOT EXISTS "RatingDimension" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RatingDimension_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RatingDimension_key_key" ON "RatingDimension"("key");
CREATE TABLE IF NOT EXISTS "CourseRatingAnswer" (
    "id" TEXT NOT NULL,
    "ratingId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    CONSTRAINT "CourseRatingAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseRatingAnswer_ratingId_dimensionId_key" ON "CourseRatingAnswer"("ratingId", "dimensionId");
CREATE INDEX IF NOT EXISTS "CourseRatingAnswer_dimensionId_idx" ON "CourseRatingAnswer"("dimensionId");
DO $$ BEGIN
  ALTER TABLE "CourseRatingAnswer" ADD CONSTRAINT "CourseRatingAnswer_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "CourseRating"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CourseRatingAnswer" ADD CONSTRAINT "CourseRatingAnswer_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "RatingDimension"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Categorías iniciales (el administrador las puede renombrar, desactivar o ampliar).
INSERT INTO "RatingDimension" ("id","key","label","order") VALUES
  (gen_random_uuid()::text,'contenido','Contenido del curso',1),
  (gen_random_uuid()::text,'docente','Docente',2),
  (gen_random_uuid()::text,'plataforma','Plataforma y materiales',3),
  (gen_random_uuid()::text,'atencion','Atención y soporte',4)
ON CONFLICT ("key") DO NOTHING;
