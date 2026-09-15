-- Bloqueo temporal de cuenta tras intentos fallidos de contraseña — mismo
-- umbral que el CRM del portafolio (5 intentos, 30 minutos), ver
-- AuthService.validateLocalUser y ../../CLAUDE.md ("Estandarización: Seguridad").
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
