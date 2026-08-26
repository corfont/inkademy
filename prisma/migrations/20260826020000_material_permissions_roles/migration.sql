-- Material: permitir descarga y/o visualización por separado.
ALTER TABLE "Material" ADD COLUMN "allowDownload" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Material" ADD COLUMN "allowView" BOOLEAN NOT NULL DEFAULT true;

-- GlobalRole: rol Empresa (login directo a /empresa) y Externo (solo regalías).
ALTER TYPE "GlobalRole" ADD VALUE 'COMPANY';
ALTER TYPE "GlobalRole" ADD VALUE 'EXTERNAL';

-- RoyaltyRecipient: vínculo opcional a una cuenta real de la plataforma.
ALTER TABLE "RoyaltyRecipient" ADD COLUMN "userId" TEXT;
ALTER TABLE "RoyaltyRecipient" ADD CONSTRAINT "RoyaltyRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
