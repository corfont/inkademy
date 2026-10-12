ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
