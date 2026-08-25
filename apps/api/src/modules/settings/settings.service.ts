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
  // Manual de marca Inkapitales: #586BD8 primario, #D8B26C acento — ya son
  // el default real horneado en globals.css; null = "usa ese default real".
  primaryColor: null as string | null,
  accentColor: null as string | null,
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
    const [row, sunat] = await Promise.all([
      this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.sunatSettings.findUnique({ where: { id: SETTINGS_ID } }),
    ]);
    // taxAffectation es el único campo de SunatSettings seguro de exponer en
    // público (nunca un secreto) — el checkout lo necesita para mostrarle al
    // comprador si el precio incluye IGV o está exonerado, ANTES de pagar
    // (antes esto era invisible: el desglose de IGV solo existía, tarde, al
    // generar el XML del comprobante en apps/worker).
    const taxAffectation = (sunat?.taxAffectation as "EXONERADO" | "GRAVADO" | undefined) ?? "EXONERADO";
    if (!row) {
      return {
        ...DEFAULTS,
        institutionSignatureAssetId: null,
        institutionSignatureUrl: null,
        institutionSignatureName: null,
        institutionSignatureTitle: null,
        watermarkAssetId: null,
        watermarkUrl: null,
        watermarkOpacityPct: 15,
        watermarkSizePercent: 30,
        sidebarColor: null,
        menuFontFamily: null,
        menuFontSizePx: null,
        menuFontColor: null,
        primaryColor: null,
        accentColor: null,
        taxAffectation,
      };
    }
    return {
      ...row,
      contactEmail: row.contactEmail ?? DEFAULTS.contactEmail,
      contactPhone: row.contactPhone ?? DEFAULTS.contactPhone,
      contactAddress: row.contactAddress ?? DEFAULTS.contactAddress,
      courseCardFields: (row.courseCardFields as Record<string, boolean> | null) ?? DEFAULTS.courseCardFields,
      institutionSignatureUrl: row.institutionSignatureAssetId ? this.storage.getPublicUrl(row.institutionSignatureAssetId) : null,
      // "Sello de agua... para que figure en las pantallas" — logo + opacidad
      // + tamaño calibrables desde /admin/apariencia (WatermarkOverlay.tsx lo
      // consume vía useBrandSettings()).
      watermarkUrl: row.watermarkAssetId ? this.storage.getPublicUrl(row.watermarkAssetId) : null,
      taxAffectation,
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
