-- Colores de marca configurables (item 1)
ALTER TABLE "PlatformSettings" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "accentColor" TEXT;

-- Servidor de correo SMTP (item 3)
CREATE TABLE "EmailServerSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT,
    "port" INTEGER,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "password" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailServerSettings_pkey" PRIMARY KEY ("id")
);

-- Campañas de correo (item 2)
CREATE TYPE "EmailCampaignMode" AS ENUM ('AUTOMATIC_AI', 'MANUAL');
CREATE TYPE "EmailCampaignGoal" AS ENUM ('RELATED_COURSES', 'NEW_COURSES', 'DISCOUNTED_COURSES', 'BY_INTEREST');
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'CANCELLED');
CREATE TYPE "EmailCampaignRecurrence" AS ENUM ('ONCE', 'WEEKLY', 'MONTHLY');

CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "EmailCampaignMode" NOT NULL,
    "goal" "EmailCampaignGoal",
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "bodyHtml" TEXT,
    "audienceFilter" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recurrence" "EmailCampaignRecurrence" NOT NULL DEFAULT 'ONCE',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Liquidación de docentes (item 5)
CREATE TYPE "PaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'END_OF_COURSE');

CREATE TABLE "TeacherRate" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT,
    "hourlyRateTeaching" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hourlyRateOtherActivities" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "toleranceMinutes" INTEGER NOT NULL DEFAULT 10,
    "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeacherRate_teacherId_courseId_key" ON "TeacherRate"("teacherId", "courseId");
ALTER TABLE "TeacherRate" ADD CONSTRAINT "TeacherRate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherRate" ADD CONSTRAINT "TeacherRate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeacherActivityLog" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT,
    "activityType" TEXT NOT NULL DEFAULT 'GRADING',
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherActivityLog_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TeacherActivityLog" ADD CONSTRAINT "TeacherActivityLog_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherActivityLog" ADD CONSTRAINT "TeacherActivityLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "LiquidationStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

CREATE TABLE "TeacherLiquidation" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "hoursTeaching" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hoursOtherActivities" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deductionsWaived" BOOLEAN NOT NULL DEFAULT false,
    "waivedReason" TEXT,
    "advancesDeducted" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "status" "LiquidationStatus" NOT NULL DEFAULT 'DRAFT',
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    CONSTRAINT "TeacherLiquidation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TeacherLiquidation" ADD CONSTRAINT "TeacherLiquidation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeacherAdvance" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "liquidationId" TEXT,
    CONSTRAINT "TeacherAdvance_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TeacherAdvance" ADD CONSTRAINT "TeacherAdvance_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherAdvance" ADD CONSTRAINT "TeacherAdvance_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "TeacherLiquidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regalías (item 6)
CREATE TYPE "RoyaltyBillingType" AS ENUM ('PER_ENROLLMENT', 'PER_COMPLETION', 'PER_REFERRAL');

CREATE TABLE "RoyaltyRecipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "billingType" "RoyaltyBillingType" NOT NULL DEFAULT 'PER_ENROLLMENT',
    "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feeCurrency" TEXT NOT NULL DEFAULT 'PEN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoyaltyRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseRoyalty" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "royaltyRecipientId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseRoyalty_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseRoyalty_courseId_royaltyRecipientId_key" ON "CourseRoyalty"("courseId", "royaltyRecipientId");
CREATE INDEX "CourseRoyalty_courseId_idx" ON "CourseRoyalty"("courseId");
ALTER TABLE "CourseRoyalty" ADD CONSTRAINT "CourseRoyalty_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseRoyalty" ADD CONSTRAINT "CourseRoyalty_royaltyRecipientId_fkey" FOREIGN KEY ("royaltyRecipientId") REFERENCES "RoyaltyRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Course: bloqueo de descarga del video principal (item 14)
ALTER TABLE "Course" ADD COLUMN "blockMainVideoDownload" BOOLEAN NOT NULL DEFAULT true;

-- Lesson: cuál lección inicia el curso (item 14)
ALTER TABLE "Lesson" ADD COLUMN "isCourseStarter" BOOLEAN NOT NULL DEFAULT false;

-- Material: assetId ahora opcional (kind="link" no sube archivo) + externalUrl (item 14)
ALTER TABLE "Material" ALTER COLUMN "assetId" DROP NOT NULL;
ALTER TABLE "Material" ADD COLUMN "externalUrl" TEXT;

-- Assessment / AssessmentAttempt: exámenes cualitativos basados en archivo (item 5)
ALTER TABLE "Assessment" ADD COLUMN "sourceFileAssetId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "sourceFileMimeType" TEXT;
ALTER TABLE "AssessmentAttempt" ADD COLUMN "submissionAssetId" TEXT;
ALTER TABLE "AssessmentAttempt" ADD COLUMN "submissionMimeType" TEXT;

-- Convenios institucionales: nuevo tipo de cobro por alumno matriculado (item 8)
ALTER TYPE "PartnerBillingType" ADD VALUE 'PER_ENROLLMENT';
