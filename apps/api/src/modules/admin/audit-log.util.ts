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

const SECRET_KEY = /pass|secret|token|apikey|api_key|key_?pem|cert_?pem|solpassword/i;

/**
 * Qué cambió entre lo guardado y lo que se pide guardar, SIN secretos: devuelve solo los campos que de verdad cambian, con su valor anterior y
 * nuevo. Un secreto (contraseña, clave, certificado) nunca se guarda: solo queda constancia de que se cambió («(modificado)»).
 */
export function diffForAudit(before: Record<string, unknown> | null | undefined, input: Record<string, unknown>, extraSecretKeys: string[] = []) {
  const prev = before ?? {};
  const secret = (k: string) => SECRET_KEY.test(k) || extraSecretKeys.includes(k);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (secret(k)) {
      if (v) a[k] = "(modificado)";
      continue;
    }
    if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(v ?? null)) {
      b[k] = prev[k] ?? null;
      a[k] = v ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
