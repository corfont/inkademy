DO $$ BEGIN CREATE TYPE "ComplaintKind" AS ENUM ('RECLAMO', 'QUEJA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ComplaintStatus" AS ENUM ('PENDING', 'RESPONDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Complaint" (
  "id" TEXT NOT NULL,
  "number" SERIAL NOT NULL,
  "kind" "ComplaintKind" NOT NULL,
  "fullName" TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "docNumber" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "request" TEXT NOT NULL,
  "status" "ComplaintStatus" NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "response" TEXT,
  "respondedAt" TIMESTAMP(3),
  "respondedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_number_key" ON "Complaint"("number");
CREATE INDEX IF NOT EXISTS "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");
