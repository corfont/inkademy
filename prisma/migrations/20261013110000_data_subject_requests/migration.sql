-- Derechos ARCO (Ley 29733): registro de solicitudes de acceso, rectificación,
-- cancelación y oposición, con plazo y respuesta (COMPLETITUD.md MOD-15, BD-62).
CREATE TABLE IF NOT EXISTS "DataSubjectRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "requesterEmail" TEXT,
  "requesterName" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataSubjectRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DataSubjectRequest_status_dueAt_idx" ON "DataSubjectRequest" ("status", "dueAt");
CREATE INDEX IF NOT EXISTS "DataSubjectRequest_userId_idx" ON "DataSubjectRequest" ("userId");
