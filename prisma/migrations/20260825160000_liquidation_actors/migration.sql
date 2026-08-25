-- TeacherLiquidation: quién generó/aprobó/pagó/perdonó la deducción — antes sin rastro.
ALTER TABLE "TeacherLiquidation" ADD COLUMN "createdById" TEXT;
ALTER TABLE "TeacherLiquidation" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "TeacherLiquidation" ADD COLUMN "paidById" TEXT;
ALTER TABLE "TeacherLiquidation" ADD COLUMN "waivedById" TEXT;
ALTER TABLE "TeacherLiquidation" ADD COLUMN "waivedAt" TIMESTAMP(3);
