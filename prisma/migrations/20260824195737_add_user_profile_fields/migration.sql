-- AlterTable
ALTER TABLE "User" ADD COLUMN "address" TEXT;
ALTER TABLE "User" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "socialLinks" JSONB;
