-- CreateEnum
CREATE TYPE "ElectronicNoteType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "ElectronicNote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "noteType" "ElectronicNoteType" NOT NULL,
    "series" TEXT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "referenceDocType" "ElectronicDocumentType" NOT NULL,
    "referenceSeries" TEXT NOT NULL,
    "referenceCorrelativo" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonDescription" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "xml" TEXT,
    "cdrXml" TEXT,
    "status" "ElectronicDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "sunatResponseCode" TEXT,
    "sunatDescription" TEXT,
    "pdfAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectronicNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicNote_noteType_series_correlativo_key" ON "ElectronicNote"("noteType", "series", "correlativo");

-- AddForeignKey
ALTER TABLE "ElectronicNote" ADD CONSTRAINT "ElectronicNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
