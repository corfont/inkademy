-- Índices de rendimiento (ver REVIEW.md #4.1, #4.7, #4.8, #4.12, #4.13, #4.14)

-- Order: FK sin indexar + filtro de estado/fecha usado en dashboards admin
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_companyId_idx" ON "Order"("companyId");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- Payment: FK sin indexar + lookup por providerRef en cada webhook
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_providerRef_idx" ON "Payment"("providerRef");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- Enrollment: sweeps periódicos del worker filtran por status + accessExpiresAt
CREATE INDEX "Enrollment_status_accessExpiresAt_idx" ON "Enrollment"("status", "accessExpiresAt");

-- Quote: modelo con RLS por companyId, sin índice a diferencia de sus pares
CREATE INDEX "Quote_companyId_idx" ON "Quote"("companyId");

-- Notification: reemplaza el índice (userId, readAt) por uno que cubre el
-- orderBy real de GET /notifications/mine (readAt Y createdAt), además de channel
DROP INDEX "Notification_userId_readAt_idx";
CREATE INDEX "Notification_userId_channel_readAt_createdAt_idx" ON "Notification"("userId", "channel", "readAt", "createdAt");

-- AssessmentAttempt: las queries reales de resolveBestScore/attemptsUsed
-- filtran por (enrollmentId, assessmentId), no por (assessmentId, userId)
CREATE INDEX "AssessmentAttempt_enrollmentId_assessmentId_idx" ON "AssessmentAttempt"("enrollmentId", "assessmentId");

-- LessonProgress: sweeps que filtran por updatedAt (admin.service.ts, email-campaign.processor.ts)
CREATE INDEX "LessonProgress_updatedAt_idx" ON "LessonProgress"("updatedAt");
