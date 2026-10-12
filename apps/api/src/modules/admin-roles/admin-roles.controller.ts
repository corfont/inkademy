import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminRolesService } from "./admin-roles.service";

const permissionsSchema = z.record(z.enum(["VIEW", "EDIT"]));
const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: permissionsSchema,
  active: z.boolean().optional(),
});
const updateSchema = createSchema.partial();
const assignSchema = z.object({ userId: z.string().uuid(), adminRoleId: z.string().uuid().nullable() });

/** Gestión de roles de administrador por módulo — solo para administradores completos (lo impone AdminModuleGuard: "admin-roles" es owner-only). */
@ApiTags("admin-roles")
@UseGuards(RolesGuard)
@Controller("admin/admin-roles")
export class AdminRolesController {
  constructor(private readonly service: AdminRolesService) {}

  @Roles("ADMIN")
  @Get()
  @ApiOperation({ summary: "Roles de administrador y quién los tiene" })
  list() {
    return this.service.list();
  }

  @Roles("ADMIN")
  @Post()
  @ApiOperation({ summary: "Crea un rol de administrador" })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createSchema)) dto: z.infer<typeof createSchema>) {
    return this.service.create(user.id, dto);
  }

  @Roles("ADMIN")
  @Put("assign")
  @ApiOperation({ summary: "Asigna (o quita) un rol de administrador a un usuario" })
  assign(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(assignSchema)) dto: z.infer<typeof assignSchema>) {
    return this.service.assign(user.id, dto.userId, dto.adminRoleId);
  }

  @Roles("ADMIN")
  @Patch(":id")
  @ApiOperation({ summary: "Edita un rol de administrador" })
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateSchema)) dto: z.infer<typeof updateSchema>) {
    return this.service.update(user.id, id, dto);
  }

  @Roles("ADMIN")
  @Delete(":id")
  @ApiOperation({ summary: "Elimina un rol sin usuarios" })
  remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.service.remove(user.id, id);
  }
}

/** Lo que el panel necesita saber de quien está dentro: ¿tiene un rol acotado y con qué permisos? */
@ApiTags("admin-roles")
@Controller("profile")
export class AdminAccessController {
  constructor(private readonly service: AdminRolesService) {}

  @Get("admin-access")
  @ApiOperation({ summary: "Permisos de administración del usuario autenticado" })
  access(@CurrentUser() user: RequestUser) {
    return this.service.accessFor(user.id);
  }
}
