ALTER TABLE "CourseSuggestion"
  ADD COLUMN "adminResponse" TEXT,
  ADD COLUMN "respondedAt" TIMESTAMP(3),
  ADD COLUMN "respondedById" TEXT;

ALTER TABLE "CourseSuggestion"
  ADD CONSTRAINT "CourseSuggestion_respondedById_fkey"
  FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
