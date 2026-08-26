import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tenantContextStorage } from "../prisma/tenant-context";

/**
 * "Multi-tenancy con Postgres RLS" — companyId + CompanyGuard ya aíslan
 * correctamente los datos B2B; esto agrega una segunda capa a nivel de
 * base de datos para que un `where: companyId` olvidado en el futuro no
 * filtre entre empresas (ver $extends en prisma.module.ts y la migración
 * 20260826190000_company_rls).
 *
 * Solo arma el contexto cuando CompanyGuard ya resolvió una membresía
 * REAL — `req.companyMembership` viene de ahí, y para ADMIN/SUPPORT ese
 * guard adjunta un objeto sintético SIN companyId (necesitan ver
 * cualquier empresa) — en ese caso esto no hace nada, y las políticas RLS
 * quedan "abiertas" para esa request (mismo criterio: admin ve todo).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const companyId: string | undefined = req.companyMembership?.companyId;
    if (!companyId) return next.handle();

    return new Observable((subscriber) => {
      tenantContextStorage.run({ companyId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
