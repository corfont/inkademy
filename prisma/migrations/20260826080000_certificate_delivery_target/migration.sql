-- La empresa decide a quién se envía el correo del certificado (alumno,
-- administrador de la empresa, o ambos); cada certificado guarda un
-- snapshot de a quién se envió realmente al emitirse.
ALTER TABLE "Company" ADD COLUMN "certificateDeliveryTarget" TEXT NOT NULL DEFAULT 'STUDENT';
ALTER TABLE "Certificate" ADD COLUMN "deliveredTo" TEXT NOT NULL DEFAULT 'STUDENT';
