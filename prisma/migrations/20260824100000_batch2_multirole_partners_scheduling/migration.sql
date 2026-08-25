-- Multi-rol de usuario (User.secondaryRoles)
ALTER TABLE "User" ADD COLUMN "secondaryRoles" "GlobalRole"[] NOT NULL DEFAULT ARRAY[]::"GlobalRole"[];

-- Docente asignado a una sesión en vivo puntual + serie de recurrencia semanal
ALTER TABLE "LiveSession" ADD COLUMN "teacherId" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN "seriesId" TEXT;
CREATE INDEX "LiveSession_teacherId_idx" ON "LiveSession"("teacherId");
CREATE INDEX "LiveSession_seriesId_idx" ON "LiveSession"("seriesId");
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tipo de pregunta "ordenar"
ALTER TYPE "QuestionType" ADD VALUE 'ORDERING';

-- Yape/Plin fee + detracción por tipo de comprador (reemplaza el % plano)
ALTER TABLE "PlatformSettings" ADD COLUMN "yapePlinFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSettings" ALTER COLUMN "detractionEnabled" SET DEFAULT true;
ALTER TABLE "PlatformSettings" ADD COLUMN "detractionRucNaturalPercent" DOUBLE PRECISION NOT NULL DEFAULT 12;
ALTER TABLE "PlatformSettings" ADD COLUMN "detractionRucNaturalThreshold" DOUBLE PRECISION NOT NULL DEFAULT 700;
ALTER TABLE "PlatformSettings" ADD COLUMN "detractionRucEmpresaPercent" DOUBLE PRECISION NOT NULL DEFAULT 12;
ALTER TABLE "PlatformSettings" DROP COLUMN "detractionPercent";

-- IGV por defecto GRAVADO (Inkapitales no es institución educativa exonerada)
ALTER TABLE "SunatSettings" ALTER COLUMN "taxAffectation" SET DEFAULT 'GRAVADO';

-- Convenios institucionales (certificado con 3ra firma + facturación por convenio)
CREATE TYPE "PartnerBillingType" AS ENUM ('FIXED', 'PER_COURSE', 'PER_PERIOD');

CREATE TABLE "PartnerInstitution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "signerName" TEXT,
    "signerTitle" TEXT,
    "signatureAssetId" TEXT,
    "billingType" "PartnerBillingType" NOT NULL DEFAULT 'FIXED',
    "feeAmount" DECIMAL(10,2),
    "feeCurrency" TEXT NOT NULL DEFAULT 'PEN',
    "invoicesDirectly" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerInstitution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoursePartnership" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "partnerInstitutionId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoursePartnership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoursePartnership_courseId_partnerInstitutionId_key" ON "CoursePartnership"("courseId", "partnerInstitutionId");
CREATE INDEX "CoursePartnership_courseId_idx" ON "CoursePartnership"("courseId");
CREATE INDEX "CoursePartnership_partnerInstitutionId_idx" ON "CoursePartnership"("partnerInstitutionId");

ALTER TABLE "CoursePartnership" ADD CONSTRAINT "CoursePartnership_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoursePartnership" ADD CONSTRAINT "CoursePartnership_partnerInstitutionId_fkey" FOREIGN KEY ("partnerInstitutionId") REFERENCES "PartnerInstitution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
