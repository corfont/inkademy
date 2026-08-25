ALTER TABLE "PlatformSettings"
  ADD COLUMN "watermarkAssetId" TEXT,
  ADD COLUMN "watermarkOpacityPct" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "watermarkSizePercent" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "sidebarColor" TEXT,
  ADD COLUMN "menuFontFamily" TEXT,
  ADD COLUMN "menuFontSizePx" INTEGER,
  ADD COLUMN "menuFontColor" TEXT;
