-- Pipeline comercial de cotizaciones B2B: monto, vigencia, notas internas,
-- y el vínculo (opcional) al pool de cupos real que se creó al aceptarse.
ALTER TABLE "Quote" ADD COLUMN "courseId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "programId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "seatsQuoted" INTEGER;
ALTER TABLE "Quote" ADD COLUMN "amount" DECIMAL(10,2);
ALTER TABLE "Quote" ADD COLUMN "currency" TEXT;
ALTER TABLE "Quote" ADD COLUMN "validUntil" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "internalNotes" TEXT;
ALTER TABLE "Quote" ADD COLUMN "respondedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "convertedSeatPoolId" TEXT;
CREATE UNIQUE INDEX "Quote_convertedSeatPoolId_key" ON "Quote"("convertedSeatPoolId");
