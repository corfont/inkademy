ALTER TABLE "AssessmentAttempt" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "AssessmentAttempt" ADD COLUMN "flaggedSuspicious" BOOLEAN NOT NULL DEFAULT false;
