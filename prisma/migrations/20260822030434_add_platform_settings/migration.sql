-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "logoUrl" TEXT,
    "logoHeightPx" INTEGER NOT NULL DEFAULT 32,
    "headingFontFamily" TEXT NOT NULL DEFAULT 'Outfit',
    "bodyFontFamily" TEXT NOT NULL DEFAULT 'Work Sans',
    "backgroundColor" TEXT,
    "backgroundImageUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
