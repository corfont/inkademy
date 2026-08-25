ALTER TABLE "PlatformSettings"
  ADD COLUMN "culqiFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 3.99,
  ADD COLUMN "stripeFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 4.99;

CREATE TABLE "PlatformExpense" (
  "id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PEN',
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformExpense_incurredAt_idx" ON "PlatformExpense"("incurredAt");
