import { Global, Module } from "@nestjs/common";
import { RolesGuard } from "./guards/roles.guard";
import { CompanyGuard } from "./guards/company.guard";

/**
 * Provee los guards reutilizables (RolesGuard, CompanyGuard) para que Nest
 * pueda resolver sus dependencias vía DI en cualquier controller que los use
 * con `@UseGuards(RolesGuard)` / `@UseGuards(CompanyGuard)`.
 */
@Global()
@Module({
  providers: [RolesGuard, CompanyGuard],
  exports: [RolesGuard, CompanyGuard],
})
export class CommonModule {}
