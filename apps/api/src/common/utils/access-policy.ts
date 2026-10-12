import type { AccessDurationPolicy } from "@inkademy/db";

/** Fecha de vencimiento del acceso según la política del curso; null = permanente. */
export function computeAccessExpiresAt(policy: AccessDurationPolicy, from: Date): Date | null {
  const date = new Date(from);
  if (policy === "DAYS_7") {
    date.setDate(date.getDate() + 7);
    return date;
  }
  if (policy === "DAYS_30") {
    date.setDate(date.getDate() + 30);
    return date;
  }
  if (policy === "MONTHS_6") {
    date.setMonth(date.getMonth() + 6);
    return date;
  }
  return null; // PERMANENT
}
