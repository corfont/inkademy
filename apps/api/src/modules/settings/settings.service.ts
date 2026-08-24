import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

const SETTINGS_ID = "default";

const DEFAULTS = {
  id: SETTINGS_ID,
  logoUrl: null as string | null,
  logoHeightPx: 64, // el doble del valor original (32px) — pedido explícito del cliente
  headingFontFamily: "Outfit",
  bodyFontFamily: "Work Sans",
  backgroundColor: null as string | null,
  backgroundImageUrl: null as string | null,
};

@Injectable()
export class SettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Fila única; si nunca se guardó nada, devuelve los valores de marca actuales (logo/tipografía real de Inkapitales). */
  async get() {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ?? DEFAULTS;
  }

  async update(input: Partial<Omit<typeof DEFAULTS, "id">>) {
    return this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...input },
      update: input,
    });
  }
}
