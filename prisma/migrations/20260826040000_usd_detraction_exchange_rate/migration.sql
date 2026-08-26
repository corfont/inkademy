-- Tipo de cambio USD->PEN (editable por el admin) y link de referencia
-- (SBS por defecto) para calcular la detracción SUNAT de ventas en dólares,
-- que siempre se deposita en soles.
ALTER TABLE "PlatformSettings"
  ADD COLUMN "usdExchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 3.75,
  ADD COLUMN "exchangeRateSourceUrl" TEXT DEFAULT 'https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tipocambiopromedio.aspx';
