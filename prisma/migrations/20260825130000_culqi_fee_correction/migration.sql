-- Culqi cobra 3.44% (+IGV) en tarjeta nacional y Yape/Plin, no 3.99% (esa es
-- la tarifa de tarjeta internacional, que ya está separada en stripeFeePercent).
ALTER TABLE "PlatformSettings" ALTER COLUMN "culqiFeePercent" SET DEFAULT 3.44;
UPDATE "PlatformSettings" SET "culqiFeePercent" = 3.44 WHERE id = 'default' AND "culqiFeePercent" = 3.99;
