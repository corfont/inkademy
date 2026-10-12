ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "SupportTicket_assigneeId_idx" ON "SupportTicket"("assigneeId");
-- Los tickets que ya tienen una respuesta del equipo: la primera respuesta es el primer mensaje de un administrador o de soporte.
UPDATE "SupportTicket" t SET "firstResponseAt" = sub.first
FROM (
  SELECT m."ticketId", MIN(m."createdAt") AS first
  FROM "SupportMessage" m JOIN "User" u ON u.id = m."authorId"
  WHERE u."globalRole" IN ('ADMIN','SUPPORT') AND m."authorId" <> (SELECT "createdById" FROM "SupportTicket" x WHERE x.id = m."ticketId")
  GROUP BY m."ticketId"
) sub
WHERE t.id = sub."ticketId" AND t."firstResponseAt" IS NULL;
