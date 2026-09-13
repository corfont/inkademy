-- CreateTable
--
-- adminResponse/respondedAt/respondedById se agregan directo acá (en vez
-- de en 20260824120000_suggestion_admin_response, que por nombre de
-- carpeta corre ANTES que esta y fallaba con "relation CourseSuggestion
-- does not exist" en una base de datos nueva — mismo bug de orden que
-- 20260824100000_batch2_multirole_partners_scheduling, ver el comentario
-- ahí). Se mantienen ambos nombres de carpeta para no invalidar el
-- historial ya aplicado en desarrollo.
CREATE TABLE "CourseSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "adminResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseSuggestion_status_idx" ON "CourseSuggestion"("status");

-- AddForeignKey
ALTER TABLE "CourseSuggestion" ADD CONSTRAINT "CourseSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSuggestion" ADD CONSTRAINT "CourseSuggestion_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
