import type { ConfigService } from "@nestjs/config";

/**
 * Los proveedores de pago simulan cobros (referencia "sim_…") cuando no hay claves, útil en desarrollo. En producción eso permitiría "comprar" gratis,
 * así que ahí la simulación está APAGADA salvo que se active a propósito con ALLOW_PAYMENT_SIMULATION=true (p. ej. para probar el flujo antes de cargar las claves reales).
 */
export function paymentSimulationAllowed(config: ConfigService): boolean {
  return config.get<string>("NODE_ENV") !== "production" || config.get<string>("ALLOW_PAYMENT_SIMULATION") === "true";
}

export const PAYMENTS_NOT_CONFIGURED = "Los pagos con este medio todavía no están disponibles. Intenta con otro medio o escríbenos.";
