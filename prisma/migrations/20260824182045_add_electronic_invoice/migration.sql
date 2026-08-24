-- CreateEnum
CREATE TYPE "ElectronicDocumentType" AS ENUM ('BOLETA', 'FACTURA');

-- CreateEnum
CREATE TYPE "ElectronicDocumentStatus" AS ENUM ('SIMULATED', 'ACCEPTED', 'REJECTED', 'ERROR');

-- CreateTable
CREATE TABLE "ElectronicInvoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "documentType" "ElectronicDocumentType" NOT NULL,
    "series" TEXT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "buyerDocumentType" TEXT NOT NULL,
    "buyerDocumentNumber" TEXT NOT NULL,
    "buyerLegalName" TEXT NOT NULL,
    "buyerCountry" TEXT NOT NULL DEFAULT 'PE',
    "currency" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "xml" TEXT,
    "cdrXml" TEXT,
    "status" "ElectronicDocumentStatus" NOT NULL DEFAULT 'SIMULATED',
    "sunatResponseCode" TEXT,
    "sunatDescription" TEXT,
    "pdfAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectronicInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicInvoice_orderId_key" ON "ElectronicInvoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicInvoice_documentType_series_correlativo_key" ON "ElectronicInvoice"("documentType", "series", "correlativo");

-- AddForeignKey
ALTER TABLE "ElectronicInvoice" ADD CONSTRAINT "ElectronicInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
