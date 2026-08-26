import { Global, Logger, Module, OnApplicationShutdown } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { prisma, PrismaClient as PrismaClientCtor } from "@inkademy/db";
import { tenantContextStorage } from "./tenant-context";

const logger = new Logger("PrismaModule");

// "Verificado en vivo: el rol de DATABASE_URL (`inkademy`) es SUPERUSER en
// este entorno, y Postgres SIEMPRE exime a los superusuarios de RLS — ni
// FORCE ROW LEVEL SECURITY los alcanza (confirmado con dos empresas de
// prueba: con ese rol, las políticas no filtraban nada). La transacción
// con contexto de tenant necesita conectarse con un rol SIN privilegios
// especiales (creado en la migración 20260826200000_tenant_role) para que
// las políticas realmente apliquen — el resto de la app sigue con
// `prisma` (el cliente de siempre), sin tocar.
//
// Construcción PEREZOSA (no al cargar este módulo): este archivo se
// importa como parte de la cadena de imports de AppModule, que Node
// resuelve ANTES de que ConfigModule.forRoot() llegue a cargar el .env —
// leer process.env.TENANT_DATABASE_URL acá arriba (a nivel de módulo)
// siempre lo encontraba vacío aunque el .env sí lo tuviera (bug real,
// encontrado al verificar en vivo: el log mostraba "no configurado" pese a
// estar seteado). Postergarlo a la primera vez que de verdad hace falta
// (ya con la app arrancada del todo) lo evita.
let tenantPrisma: PrismaClient | null | undefined; // undefined = todavía no resuelto
function getTenantPrisma(): PrismaClient | null {
  if (tenantPrisma !== undefined) return tenantPrisma;
  if (!process.env.TENANT_DATABASE_URL) {
    logger.warn("TENANT_DATABASE_URL no configurado — el respaldo de RLS multi-tenant queda desactivado (companyId + Guards siguen aplicando igual)");
    tenantPrisma = null;
    return tenantPrisma;
  }
  tenantPrisma = new PrismaClientCtor({ datasources: { db: { url: process.env.TENANT_DATABASE_URL } } }) as unknown as PrismaClient;
  return tenantPrisma;
}

export const PRISMA = "PRISMA";

// Modelos con columna companyId (ver prisma/schema.prisma) a los que se les
// exige el contexto de tenant cuando hay uno activo. AuditLog queda afuera
// a propósito: es un registro de auditoría transversal — un admin necesita
// verlo completo aunque esté operando "dentro" del contexto de una empresa.
const TENANT_SCOPED_MODELS = new Set([
  "CompanyMembership",
  "Enrollment",
  "Order",
  "CompanySeatPool",
  "Quote",
  "SupportTicket",
  "NpsSurveyResponse",
]);

function uncapitalize(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * "Multi-tenancy con Postgres RLS" — companyId + Guards (CompanyGuard,
 * CompaniesService) ya aíslan correctamente los datos B2B; esto agrega una
 * SEGUNDA capa a nivel de base de datos, para que un filtro `where:
 * companyId` olvidado en el futuro no filtre datos entre empresas — no
 * reemplaza el modelo de aislamiento existente, es su respaldo.
 *
 * Cuando hay un contexto de tenant activo (TenantContextInterceptor, atado
 * a las rutas /companies/:companyId/* que ya pasan por CompanyGuard), cada
 * operación sobre un modelo con companyId corre dentro de una transacción
 * que primero fija `app.current_company_id` vía `set_config` (parametrizado,
 * sin interpolar el valor en el SQL). Las políticas RLS de la migración
 * 20260826190000_company_rls filtran las filas contra ese valor.
 *
 * Fuera de esas rutas (el resto de la app: admin, catálogo, worker, scripts
 * de verificación, prisma/seed.ts) esta variable nunca se fija — las
 * políticas RLS quedan "abiertas" en ese caso (ver migración: `current_
 * setting(...) IS NULL OR "companyId" = current_setting(...)`), así que
 * ningún otro flujo cambia de comportamiento.
 */
const extendedPrisma = prisma.$extends({
  name: "tenant-rls-context",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = tenantContextStorage.getStore();
        if (!ctx || !model || !TENANT_SCOPED_MODELS.has(model)) return query(args);
        const tenant = getTenantPrisma();
        if (!tenant) return query(args);
        return tenant.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_company_id', ${ctx.companyId}, true)`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (tx as any)[uncapitalize(model)][operation](args);
        });
      },
    },
  },
});

/**
 * Envuelve la instancia singleton de PrismaClient exportada por @inkademy/db
 * como provider inyectable en Nest, sin crear una segunda conexión. Se
 * extiende con el contexto de tenant (arriba) solo dentro de apps/api — el
 * paquete compartido @inkademy/db (también usado por apps/worker) sigue
 * exportando el cliente base sin tocar.
 */
@Global()
@Module({
  providers: [{ provide: PRISMA, useValue: extendedPrisma as unknown as PrismaClient }],
  exports: [PRISMA],
})
export class PrismaModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await prisma.$disconnect();
    await tenantPrisma?.$disconnect();
  }
}
