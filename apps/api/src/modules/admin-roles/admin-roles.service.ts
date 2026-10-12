import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { ADMIN_MODULES, type AdminPermissions } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { clearAdminAccessCache, loadAdminAccess } from "../../common/guards/admin-module.guard";
import { logAudit } from "../admin/audit-log.util";

const MODULE_KEYS = new Set<string>(ADMIN_MODULES.map((m) => m.key));

function cleanPermissions(input: Record<string, string> | undefined): AdminPermissions {
  const out: AdminPermissions = {};
  for (const [key, level] of Object.entries(input ?? {})) {
    if (!MODULE_KEYS.has(key)) throw new BadRequestException(`Módulo desconocido: ${key}`);
    if (level === "VIEW" || level === "EDIT") out[key as keyof AdminPermissions] = level;
  }
  return out;
}

@Injectable()
export class AdminRolesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list() {
    const roles = await this.prisma.adminRole.findMany({
      orderBy: { name: "asc" },
      include: { users: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    return roles;
  }

  async create(actorId: string, input: { name: string; description?: string | null; permissions: Record<string, string>; active?: boolean }) {
    const exists = await this.prisma.adminRole.findUnique({ where: { name: input.name } });
    if (exists) throw new ConflictException("Ya existe un rol con ese nombre");
    const role = await this.prisma.adminRole.create({
      data: { name: input.name, description: input.description ?? null, permissions: cleanPermissions(input.permissions) as object, active: input.active ?? true },
    });
    await logAudit(this.prisma, { actorId, action: "CREATE_ADMIN_ROLE", entity: "AdminRole", entityId: role.id, after: { name: role.name, permissions: role.permissions } });
    clearAdminAccessCache();
    return role;
  }

  async update(actorId: string, id: string, input: { name?: string; description?: string | null; permissions?: Record<string, string>; active?: boolean }) {
    const before = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Rol no encontrado");
    if (input.name && input.name !== before.name) {
      const clash = await this.prisma.adminRole.findUnique({ where: { name: input.name } });
      if (clash) throw new ConflictException("Ya existe un rol con ese nombre");
    }
    const role = await this.prisma.adminRole.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.permissions !== undefined ? { permissions: cleanPermissions(input.permissions) as object } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await logAudit(this.prisma, {
      actorId,
      action: "UPDATE_ADMIN_ROLE",
      entity: "AdminRole",
      entityId: id,
      before: { name: before.name, permissions: before.permissions, active: before.active },
      after: { name: role.name, permissions: role.permissions, active: role.active },
    });
    clearAdminAccessCache();
    return role;
  }

  async remove(actorId: string, id: string) {
    const role = await this.prisma.adminRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException("Rol no encontrado");
    if (role._count.users > 0) throw new ConflictException("Hay usuarios con este rol: quítaselo primero o desactívalo");
    await this.prisma.adminRole.delete({ where: { id } });
    await logAudit(this.prisma, { actorId, action: "DELETE_ADMIN_ROLE", entity: "AdminRole", entityId: id, before: { name: role.name } });
    clearAdminAccessCache();
    return { deleted: true };
  }

  /** Asigna un rol acotado a un usuario (o se lo quita con null: vuelve a ser administrador completo). */
  async assign(actorId: string, userId: string, adminRoleId: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, adminRoleId: true } });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    if (adminRoleId) {
      const role = await this.prisma.adminRole.findUnique({ where: { id: adminRoleId } });
      if (!role) throw new NotFoundException("Rol no encontrado");
    }
    // Un administrador no puede acotarse a sí mismo: dejaría el panel sin nadie que gestione los roles.
    if (adminRoleId && userId === actorId) throw new BadRequestException("No puedes asignarte un rol acotado a ti mismo");
    await this.prisma.user.update({ where: { id: userId }, data: { adminRoleId } });
    await logAudit(this.prisma, {
      actorId,
      action: "ASSIGN_ADMIN_ROLE",
      entity: "User",
      entityId: userId,
      before: { adminRoleId: user.adminRoleId },
      after: { adminRoleId },
    });
    clearAdminAccessCache();
    return { userId, adminRoleId };
  }

  /** Qué puede hacer quien consulta: lo usa el panel para ocultar del menú lo que no corresponde. */
  async accessFor(userId: string) {
    const access = await loadAdminAccess(this.prisma, userId);
    return { restricted: access.restricted, active: access.active, permissions: access.permissions };
  }
}
