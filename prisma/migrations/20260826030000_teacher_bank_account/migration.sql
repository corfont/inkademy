-- Cuenta bancaria del docente, para saber a dónde transferir su liquidación.
ALTER TABLE "User" ADD COLUMN "bankName" TEXT;
ALTER TABLE "User" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "bankAccountCci" TEXT;
