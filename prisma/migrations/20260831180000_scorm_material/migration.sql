ALTER TABLE "Material" ADD COLUMN "scormPackagePrefix" TEXT,
  ADD COLUMN "scormEntryPath" TEXT,
  ADD COLUMN "scormVersion" TEXT,
  ADD COLUMN "scormAuthoredContent" JSONB;

CREATE TABLE "MaterialScormProgress" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scormCompletionStatus" TEXT,
  "scormScoreRaw" DOUBLE PRECISION,
  "scormInteractions" JSONB,
  "scormLessonLocation" TEXT,
  "scormSuspendData" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MaterialScormProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialScormProgress_enrollmentId_materialId_key" ON "MaterialScormProgress"("enrollmentId", "materialId");

ALTER TABLE "MaterialScormProgress" ADD CONSTRAINT "MaterialScormProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialScormProgress" ADD CONSTRAINT "MaterialScormProgress_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialScormProgress" ADD CONSTRAINT "MaterialScormProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
