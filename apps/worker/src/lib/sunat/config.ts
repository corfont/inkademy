import { prisma } from "@inkademy/db";

/**
 * Resuelve la configuración SUNAT desde la fila única `SunatSettings`
 * (editable desde /admin/facturacion, apps/api) con fallback campo por
 * campo a las variables de entorno — así un despliegue que ya configuró
 * todo por .env sigue funcionando igual sin tocar nada. La fila en BD
 * tiene prioridad cuando el campo viene poblado.
 */
export interface ResolvedSunatConfig {
  env: "beta" | "production";
  ruc?: string;
  solUser?: string;
  solPassword?: string;
  razonSocial: string;
  address: string;
  ubigeo: string;
  boletaSeries: string;
  facturaSeries: string;
  boletaCreditSeries: string;
  facturaCreditSeries: string;
  certPem?: string;
  certKeyPem?: string;
  taxAffectation: "EXONERADO" | "GRAVADO";
  /** % de IGV vigente (18 en Perú desde 2011) — parametrizable porque es una tasa que fija el Estado y puede cambiar. */
  igvPercent: number;
}

export async function resolveSunatConfig(): Promise<ResolvedSunatConfig> {
  const row = await prisma.sunatSettings.findUnique({ where: { id: "default" } }).catch(() => null);

  return {
    env: (row?.env as "beta" | "production" | undefined) ?? (process.env.SUNAT_ENV as "beta" | "production" | undefined) ?? "beta",
    ruc: row?.ruc ?? process.env.SUNAT_RUC ?? undefined,
    solUser: row?.solUser ?? process.env.SUNAT_SOL_USER ?? undefined,
    solPassword: row?.solPassword ?? process.env.SUNAT_SOL_PASSWORD ?? undefined,
    razonSocial: row?.razonSocial ?? process.env.SUNAT_RAZON_SOCIAL ?? "Inkapitales SAC",
    address: row?.address ?? process.env.SUNAT_ADDRESS ?? "Lima, Peru",
    ubigeo: row?.ubigeo ?? process.env.SUNAT_UBIGEO ?? "150101",
    boletaSeries: row?.boletaSeries ?? process.env.SUNAT_BOLETA_SERIES ?? "B001",
    facturaSeries: row?.facturaSeries ?? process.env.SUNAT_FACTURA_SERIES ?? "F001",
    boletaCreditSeries: row?.boletaCreditSeries ?? process.env.SUNAT_BOLETA_CREDIT_SERIES ?? "BC01",
    facturaCreditSeries: row?.facturaCreditSeries ?? process.env.SUNAT_FACTURA_CREDIT_SERIES ?? "FC01",
    certPem: row?.certPem ?? process.env.SUNAT_CERT_PEM ?? undefined,
    certKeyPem: row?.certKeyPem ?? process.env.SUNAT_CERT_KEY_PEM ?? undefined,
    taxAffectation: ((row?.taxAffectation ?? process.env.SUNAT_TAX_AFFECTATION ?? "EXONERADO").toUpperCase() as "EXONERADO" | "GRAVADO"),
    igvPercent: row?.igvPercent ?? Number(process.env.SUNAT_IGV_PERCENT ?? 18),
  };
}
