-- Dominios de correo que saltan directo al SSO de Microsoft en el login.
ALTER TABLE "PlatformSettings" ADD COLUMN "ssoMicrosoftDomains" TEXT;
