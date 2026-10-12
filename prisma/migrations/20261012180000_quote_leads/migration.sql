DO $$ BEGIN
  CREATE TYPE "QuoteLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "QuoteLead" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "taxIdType" TEXT,
  "taxId" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT,
  "seatsRange" TEXT,
  "interest" TEXT,
  "message" TEXT NOT NULL,
  "status" "QuoteLeadStatus" NOT NULL DEFAULT 'NEW',
  "internalNotes" TEXT,
  "crmSyncedAt" TIMESTAMP(3),
  "crmSyncNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteLead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuoteLead_status_createdAt_idx" ON "QuoteLead"("status", "createdAt");
