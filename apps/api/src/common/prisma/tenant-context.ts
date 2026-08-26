import { AsyncLocalStorage } from "node:async_hooks";

/**
 * "Multi-tenancy con Postgres RLS" — el aislamiento real ya lo dan
 * companyId + CompanyGuard (ver CompaniesService); esto es el hilo que
 * conecta ese contexto de request con las políticas RLS de la base (ver
 * migración 20260826190000_company_rls y el $extends en prisma.module.ts):
 * TenantContextInterceptor llena esto en las rutas /companies/:companyId/*,
 * y cada operación de Prisma sobre un modelo con companyId lo lee para
 * fijar `app.current_company_id` antes de esa operación.
 */
export interface TenantContext {
  companyId: string;
}

export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();
