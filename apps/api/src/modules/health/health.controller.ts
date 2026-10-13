import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PrismaClient } from "@inkademy/db";
import { Public } from "../../common/decorators/public.decorator";
import { PRISMA } from "../../common/prisma/prisma.module";

/**
 * Health check para el healthcheck de Docker y para un monitor externo
 * (COMPLETITUD.md: CAL-41). Responde 200 solo si la base de datos contesta;
 * si no, 503 — así un contenedor "vivo pero sin base" se marca como no sano
 * en vez de seguir recibiendo tráfico. No expone versiones ni detalles.
 */
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: "Estado del servicio (base de datos)" })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: "error", db: "down" });
    }
    return { status: "ok", db: "up" };
  }
}
