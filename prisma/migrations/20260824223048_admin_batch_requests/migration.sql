-- DurationUnit + Course.durationUnit
CREATE TYPE "DurationUnit" AS ENUM ('HOURS', 'WEEKS', 'MONTHS');
ALTER TABLE "Course" ADD COLUMN "durationUnit" "DurationUnit" NOT NULL DEFAULT 'HOURS';

-- AssessmentDisplayMode + Assessment.displayMode
CREATE TYPE "AssessmentDisplayMode" AS ENUM ('ALL_AT_ONCE', 'ONE_BY_ONE');
ALTER TABLE "Assessment" ADD COLUMN "displayMode" "AssessmentDisplayMode" NOT NULL DEFAULT 'ALL_AT_ONCE';

-- ChatbotSettings (singleton, mismo patrón que SunatSettings/PlatformSettings)
CREATE TABLE "ChatbotSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'gemini',
    "model" TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    "apiKey" TEXT,
    "systemPrompt" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotSettings_pkey" PRIMARY KEY ("id")
);
