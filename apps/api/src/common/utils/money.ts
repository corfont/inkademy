import type { Prisma } from "@inkademy/db";

/** Convierte un Decimal de Prisma (o número/string) al string usado en los DTOs compartidos. */
export function decimalToString(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) return "0.00";
  return typeof value === "object" && "toFixed" in value
    ? (value as Prisma.Decimal).toFixed(2)
    : Number(value).toFixed(2);
}
