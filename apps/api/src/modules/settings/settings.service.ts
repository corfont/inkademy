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
  showRating: false,
};

const DEFAULTS = {
  id: SETTINGS_ID,
  logoUrl: null as string | null,
  logoHeightPx: 64, // el doble del valor original (32px) — pedido explícito del cliente
  headingFontFamily: "Outfit",
  bodyFontFamily: "Work Sans",
  backgroundColor: null as string | null,
  backgroundImageUrl: null as string | null,
  // Manual de marca Inkapitales: #586BD8 primario (CTA/gradiente — "indigo"
  // en globals.css), #D8B26C acento ("gold"). Ya son el default real
  // horneado en globals.css, con una escala completa afinada a mano para
  // contraste WCAG — por eso el default de estos dos campos sigue siendo
  // `null` ("no lo pises, usa la escala afinada") en vez del hex real: si
  // se devolviera el hex acá, layout.tsx SIEMPRE dispararía el override de
  // --indigo-500/400 (ver hexToHslTriplet) y reemplazaría el 52% de
  // luminosidad afinado por el 60% que da ese hex sin ajustar, aclarando el
  // botón/CTA y arriesgando el contraste ya verificado. El valor real para
  // mostrar en /admin/apariencia se resuelve en el frontend (ver
  // AppearanceForm), no acá.
  primaryColor: null as string | null,
  accentColor: null as string | null,
  contactEmail: "hola@inkademy.com" as string | null,
  contactPhone: "+51 1 234 5678" as string | null,
  contactAddress: "Lima, Perú" as string | null,
  courseCardFields: DEFAULT_COURSE_CARD_FIELDS as Record<string, boolean>,
  certificateEmailText: null as Record<string, string> | null,
  certificateEmailFontFamily: null as string | null,
  certificateEmailTextAlign: "left" as string,
  certificateEmailTextColor: null as string | null,
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
        certificateEmailText: null,
        certificateEmailFontFamily: null,
        certificateEmailTextAlign: "left",
        certificateEmailTextColor: null,
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
      // `as never`: los campos Json (courseCardFields, certificateEmailText)
      // aceptan `null` en runtime pero Prisma exige el sentinel especial
      // `Prisma.JsonNull` en su tipo — mismo patrón ya usado en otros
      // services de este proyecto para inputs de Prisma con Json anidado.
      create: { id: SETTINGS_ID, ...input } as never,
      update: input as never,
    });
  }
}
