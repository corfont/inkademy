ALTER TABLE "PlatformSettings"
  ADD COLUMN "detractionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "detractionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
