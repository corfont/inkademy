-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerCountry" TEXT,
ADD COLUMN     "buyerDocumentNumber" TEXT,
ADD COLUMN     "buyerDocumentType" TEXT,
ADD COLUMN     "buyerLegalName" TEXT;
