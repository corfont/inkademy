import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

export interface UpsertPlatformLicenseInput {
  clientName: string;
  domain?: string | null;
  deploymentUrl?: string | null;
  billingCycle: "MONTHLY" | "ANNUAL";
  priceAmount: number;
  currency?: string;
  startsAt: string;
  endsAt: string;
  status?: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "CANCELLED";
  notes?: string | null;
}

/**
 * Registro de NEGOCIO de Inkapitales sobre terceros que arriendan el
 * sistema completo como instancia aislada (ver PlatformLicense en
 * schema.prisma y docs/aprovisionar-instancia-arrendada.md — el
 * aislamiento real es a nivel de despliegue, no de esta tabla). Esto solo
 * lleva la cuenta de quién arrienda, desde cuándo, hasta cuándo y a qué
 * precio, para que el sweep de vencimiento (reminder.processor.ts) pueda
 * avisar a tiempo.
 */
@Injectable()
export class PlatformLicenseService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  list() {
    return this.prisma.platformLicense.findMany({ orderBy: { endsAt: "asc" } });
  }

  async get(id: string) {
    const license = await this.prisma.platformLicense.findUnique({ where: { id } });
    if (!license) throw new NotFoundException("Licencia no encontrada");
    return license;
  }

  create(input: UpsertPlatformLicenseInput) {
    return this.prisma.platformLicense.create({
      data: {
        ...input,
        currency: input.currency ?? "PEN",
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
      },
    });
  }

  async update(id: string, input: Partial<UpsertPlatformLicenseInput>) {
    await this.get(id);
    return this.prisma.platformLicense.update({
      where: { id },
      data: {
        ...input,
        ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.endsAt ? { endsAt: new Date(input.endsAt) } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.platformLicense.delete({ where: { id } });
    return { ok: true };
  }
}
