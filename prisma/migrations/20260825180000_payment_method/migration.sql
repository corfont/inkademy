-- Captura el método real dentro del proveedor de pago (p.ej. Culqi
-- devuelve "card" o "yape" en source.type) para poder aplicar la comisión
-- adicional de Yape/Plin solo a esos pagos, no a toda tarjeta vía Culqi.
ALTER TABLE "Payment" ADD COLUMN "paymentMethod" TEXT;
