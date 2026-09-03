import { Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { normalizePage } from "../../common/utils/pagination";

/**
 * Bandeja in-app (campana del layout, ver NotificationBell.tsx) — solo
 * lee/marca filas `Notification` con `channel: "IN_APP"` que ya crean los
 * distintos sweeps/servicios (ver apps/worker/src/lib/notify.ts::notifyInApp
 * y NotificationService.sendSupportTicketUpdate). No hay POST de creación
 * acá — las notificaciones nacen de eventos del sistema, no de una llamada
 * directa del cliente.
 */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get("mine")
  @ApiOperation({ summary: "Mis notificaciones in-app, paginadas, no leídas primero" })
  async listMine(@CurrentUser() user: RequestUser, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const { skip, take, page: p, pageSize: ps } = normalizePage({ page: Number(page), pageSize: Number(pageSize) });
    const where = { userId: user.id, channel: "IN_APP" as const };
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        // Postgres: NULLS FIRST en "asc" — las no leídas (readAt=null) salen primero.
        orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { rows, total, page: p, pageSize: ps, unreadCount };
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Cantidad de notificaciones no leídas (para el badge de la campana)" })
  async unreadCount(@CurrentUser() user: RequestUser) {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, channel: "IN_APP", readAt: null },
    });
    return { count };
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Marca una notificación como leída" })
  async markRead(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post("read-all")
  @ApiOperation({ summary: "Marca todas mis notificaciones como leídas" })
  async markAllRead(@CurrentUser() user: RequestUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, channel: "IN_APP", readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
