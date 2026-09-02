-- Tolerancia de inicio y de fin de clase eran un solo valor
-- (TeacherRate.toleranceMinutes) usado igual para tardanza y salida
-- temprana. Se separan en dos columnas, backfilleadas con el valor único
-- que ya existía (mismo comportamiento hasta que el admin las ajuste).
ALTER TABLE "TeacherRate" ADD COLUMN "toleranceStartMinutes" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "TeacherRate" ADD COLUMN "toleranceEndMinutes" INTEGER NOT NULL DEFAULT 10;
UPDATE "TeacherRate" SET "toleranceStartMinutes" = "toleranceMinutes", "toleranceEndMinutes" = "toleranceMinutes";
ALTER TABLE "TeacherRate" DROP COLUMN "toleranceMinutes";

-- Comisión de Yape (BCP) y Plin (Interbank) por cuenta empresa son
-- costos separados y distintos entre sí — antes un solo
-- PlatformSettings.yapePlinFeePercent trataba ambas billeteras igual.
ALTER TABLE "PlatformSettings" ADD COLUMN "yapeFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSettings" ADD COLUMN "plinFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE "PlatformSettings" SET "yapeFeePercent" = "yapePlinFeePercent", "plinFeePercent" = "yapePlinFeePercent";
ALTER TABLE "PlatformSettings" DROP COLUMN "yapePlinFeePercent";
