-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "trigger" "BackupTrigger" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredById" TEXT,
    "s3Key" TEXT,
    "sizeBytes" INTEGER,
    "modelCounts" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
