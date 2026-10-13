/**
 * Etiquetas en español de estados que el sistema guarda como código (PAID, ACTIVE…). Una persona nunca debe ver el código crudo
 * (COMPLETITUD.md: TBL-27). SIN "use client": lo importan páginas de servidor y componentes de cliente.
 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PAID: "Pagada",
  PENDING: "Pendiente",
  FAILED: "Fallida",
  REFUNDED: "Reembolsada",
  CANCELLED: "Cancelada",
};

export const ORDER_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PENDING: "warning",
  FAILED: "danger",
  REFUNDED: "neutral",
  CANCELLED: "neutral",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: "En cola",
  SIMULATED: "Simulado",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  ERROR: "Con error",
};
