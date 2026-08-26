CREATE TABLE "MaterialProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialProgress_enrollmentId_materialId_key" ON "MaterialProgress"("enrollmentId", "materialId");

ALTER TABLE "MaterialProgress" ADD CONSTRAINT "MaterialProgress_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialProgress" ADD CONSTRAINT "MaterialProgress_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialProgress" ADD CONSTRAINT "MaterialProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
