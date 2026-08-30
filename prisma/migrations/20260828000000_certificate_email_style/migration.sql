-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "certificateEmailText" JSONB,
ADD COLUMN     "certificateEmailFontFamily" TEXT,
ADD COLUMN     "certificateEmailTextAlign" TEXT NOT NULL DEFAULT 'left',
ADD COLUMN     "certificateEmailTextColor" TEXT;
