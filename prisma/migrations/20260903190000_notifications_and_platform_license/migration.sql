-- NotificationType (nuevo enum)
CREATE TYPE "NotificationType" AS ENUM (
  'COURSE_ACCESS_EXPIRING',
  'LIVE_SESSION_UPCOMING',
  'ASSESSMENT_DUE',
  'PARTNERSHIP_EXPIRING',
  'SUPPORT_TICKET_UPDATE',
  'SUGGESTION_UNANSWERED',
  'PLATFORM_LICENSE_EXPIRING',
  'GENERIC'
);

-- Notification: nuevos campos, todos opcionales/con default (no rompe filas existentes)
ALTER TABLE "Notification" ADD COLUMN "type" "NotificationType" NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "Notification" ADD COLUMN "title" TEXT;
ALTER TABLE "Notification" ADD COLUMN "body" TEXT;
ALTER TABLE "Notification" ADD COLUMN "url" TEXT;
ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- NotificationSettings (singleton, mismo patrón que ChatbotSettings)
CREATE TABLE "NotificationSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "courseAccessExpiringEmail" BOOLEAN NOT NULL DEFAULT true,
  "courseAccessExpiringInApp" BOOLEAN NOT NULL DEFAULT true,
  "liveSessionUpcomingEmail" BOOLEAN NOT NULL DEFAULT true,
  "liveSessionUpcomingInApp" BOOLEAN NOT NULL DEFAULT true,
  "assessmentDueEmail" BOOLEAN NOT NULL DEFAULT true,
  "assessmentDueInApp" BOOLEAN NOT NULL DEFAULT true,
  "partnershipExpiringEmail" BOOLEAN NOT NULL DEFAULT true,
  "partnershipExpiringInApp" BOOLEAN NOT NULL DEFAULT true,
  "partnershipExpiringLeadDays" INTEGER NOT NULL DEFAULT 30,
  "supportTicketUpdateEmail" BOOLEAN NOT NULL DEFAULT true,
  "supportTicketUpdateInApp" BOOLEAN NOT NULL DEFAULT true,
  "suggestionUnansweredEmail" BOOLEAN NOT NULL DEFAULT false,
  "suggestionUnansweredInApp" BOOLEAN NOT NULL DEFAULT true,
  "suggestionUnansweredAfterHours" INTEGER NOT NULL DEFAULT 48,
  "platformLicenseExpiringEmail" BOOLEAN NOT NULL DEFAULT true,
  "platformLicenseExpiringInApp" BOOLEAN NOT NULL DEFAULT true,
  "platformLicenseExpiringLeadDays" INTEGER NOT NULL DEFAULT 30,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- PlatformLicenseStatus / BillingCycle (nuevos enums)
CREATE TYPE "PlatformLicenseStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- PlatformLicense
CREATE TABLE "PlatformLicense" (
  "id" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "domain" TEXT,
  "deploymentUrl" TEXT,
  "billingCycle" "BillingCycle" NOT NULL,
  "priceAmount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PEN',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "PlatformLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformLicense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformLicense_status_endsAt_idx" ON "PlatformLicense"("status", "endsAt");
