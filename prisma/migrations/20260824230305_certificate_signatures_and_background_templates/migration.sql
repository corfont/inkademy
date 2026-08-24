-- Firma de docente (User)
ALTER TABLE "User" ADD COLUMN "signatureAssetId" TEXT;

-- Firma institucional (PlatformSettings)
ALTER TABLE "PlatformSettings" ADD COLUMN "institutionSignatureAssetId" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "institutionSignatureName" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "institutionSignatureTitle" TEXT;

-- Plantillas de certificado con fondo (PDF/PNG/JPG) además de HTML
CREATE TYPE "CertificateTemplateSourceType" AS ENUM ('HTML', 'BACKGROUND');
ALTER TABLE "CertificateTemplate" ADD COLUMN "sourceType" "CertificateTemplateSourceType" NOT NULL DEFAULT 'HTML';
ALTER TABLE "CertificateTemplate" ADD COLUMN "backgroundAssetId" TEXT;
ALTER TABLE "CertificateTemplate" ADD COLUMN "backgroundMimeType" TEXT;
ALTER TABLE "CertificateTemplate" ADD COLUMN "pageWidthPt" DOUBLE PRECISION DEFAULT 841.89;
ALTER TABLE "CertificateTemplate" ADD COLUMN "pageHeightPt" DOUBLE PRECISION DEFAULT 595.28;
ALTER TABLE "CertificateTemplate" ADD COLUMN "tagPositions" JSONB;
