import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";

const SETTINGS_ID = "default";

const DEFAULT_COURSE_CARD_FIELDS = {
  showTeacher: true,
  showDuration: true,
  showNextLiveSession: true,
  showCertificationBadge: true,
};

const DEFAULTS = {
  id: SETTINGS_ID,
  logoUrl: null as string | null,
  logoHeightPx: 64, // el doble del valor original (32px) — pedido explícito del cliente
  headingFontFamily: "Outfit",
  bodyFontFamily: "Work Sans",
  backgroundColor: null as string | null,
  backgroundImageUrl: null as string | null,
  contactEmail: "hola@inkademy.com" as string | null,
  contactPhone: "+51 1 234 5678" as string | null,
  contactAddress: "Lima, Perú" as string | null,
  courseCardFields: DEFAULT_COURSE_CARD_FIELDS as Record<string, boolean>,
};

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  /**
   * Fila única; si nunca se guardó nada, devuelve los valores de marca
   * actuales (logo/tipografía real de Inkapitales). Los campos de contacto
   * y courseCardFields se agregaron después — una fila ya existente los
   * tiene en `null` (nunca se guardaron), así que se completan campo por
   * campo con DEFAULTS en vez de solo sustituir la fila entera cuando no
   * existe ninguna.
   */
  async get() {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) return { ...DEFAULTS, institutionSignatureAssetId: null, institutionSignatureUrl: null, institutionSignatureName: null, institutionSignatureTitle: null };
    return {
      ...row,
      contactEmail: row.contactEmail ?? DEFAULTS.contactEmail,
      contactPhone: row.contactPhone ?? DEFAULTS.contactPhone,
      contactAddress: row.contactAddress ?? DEFAULTS.contactAddress,
      courseCardFields: (row.courseCardFields as Record<string, boolean> | null) ?? DEFAULTS.courseCardFields,
      institutionSignatureUrl: row.institutionSignatureAssetId ? this.storage.getPublicUrl(row.institutionSignatureAssetId) : null,
    };
  }

  async update(input: Partial<Omit<typeof DEFAULTS, "id">>) {
    return this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...input },
      update: input,
    });
  }
}
