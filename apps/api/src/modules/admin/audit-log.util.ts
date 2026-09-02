import type { PrismaClient } from "@inkademy/db";

/**
 * "Si me hacen alguna auditoría lo pueda sustentar lo que sucedió en un
 * momento dado" — helper único para escribir en `AuditLog`. Antes de esto,
 * 20 call sites repartidos en 5 servicios distintos (admin.service.ts,
 * commerce.service.ts, live-session.service.ts, sunat-settings.service.ts,
 * email-server-settings.service.ts) duplicaban `prisma.auditLog.create`
 * a mano, cada uno con su propia forma del payload — función de módulo (no
 * método de una clase) porque los 5 servicios ya inyectan el mismo
 * `PrismaClient` compartido pero no comparten ninguna clase base entre sí.
 */
export function logAudit(
  prisma: PrismaClient,
  input: {
    actorId?: string;
    companyId?: string;
    action: string;
    entity: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
  },
) {
  return prisma.auditLog.create({ data: input as never });
}
