-- Listas de correo reutilizables (audiencia de marketing guardada) —
-- antes el filtro solo vivía suelto dentro de cada EmailCampaign.
CREATE TABLE "MailingList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filter" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailingList_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MailingList" ADD CONSTRAINT "MailingList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
