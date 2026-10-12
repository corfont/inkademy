import { Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { normalizePage } from "../../common/utils/pagination";
import { NotificationService } from "./notification.service";

/**
 * Comprobación de las notificaciones para el administrador: historial de envíos (evento, destinatario, canal, fecha y resultado, con el motivo si
 * falló) y una prueba que manda un correo real al propio admin por el mismo camino que usan los avisos. Activar una casilla en la configuración
 * expresa una intención; esto permite verificar que de verdad llega.
 */
@ApiTags("admin-notifications")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("admin/notifications")
export class AdminNotificationController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  @Get("log")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Historial de notificaciones enviadas (o intentadas), con filtros" })
  async log(
    @Query("channel") channel?: string,
    @Query("status") status?: string,
    @Query("template") template?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const { skip, take, page: p, pageSize: ps } = normalizePage({ page: Number(page), pageSize: Number(pageSize) || 30 });
    const where = {
      ...(channel === "EMAIL" || channel === "IN_APP" ? { channel: channel as "EMAIL" | "IN_APP" } : {}),
      ...(status === "PENDING" || status === "SENT" || status === "FAILED" ? { status: status as "PENDING" | "SENT" | "FAILED" } : {}),
      ...(template ? { template: { contains: template.trim(), mode: "insensitive" as const } } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(new Date(to).getTime() + 24 * 3_600_000 - 1) } : {}) } }
        : {}),
    };
    const [rows, total, failed] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) } } }),
    ]);
    return {
      rows: rows.map((n) => ({
        id: n.id,
        createdAt: n.createdAt.toISOString(),
        sentAt: n.sentAt?.toISOString() ?? null,
        channel: n.channel,
        template: n.template,
        type: n.type,
        title: n.title,
        status: n.status,
        attempts: n.attempts,
        errorMessage: n.errorMessage,
        recipient: { id: n.user.id, name: `${n.user.firstName} ${n.user.lastName}`, email: n.user.email },
      })),
      total,
      page: p,
      pageSize: ps,
      failedLast7d: failed,
    };
  }

  @Post("test")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Envía un correo de prueba al propio administrador por el mismo camino que usan los avisos" })
  async test(@CurrentUser() user: RequestUser) {
    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
    if (!me) return { queued: false };
    return this.notifications.sendTestEmail(me.email, user.id);
  }
}
