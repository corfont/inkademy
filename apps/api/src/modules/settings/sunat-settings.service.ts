import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

const SETTINGS_ID = "default";

export interface UpsertSunatSettingsInput {
  env?: string;
  ruc?: string | null;
  solUser?: string | null;
  solPassword?: string; // solo se sobreescribe si viene no-vacío — ver update()
  razonSocial?: string | null;
  address?: string | null;
  ubigeo?: string | null;
  boletaSeries?: string | null;
  facturaSeries?: string | null;
  boletaCreditSeries?: string | null;
  facturaCreditSeries?: string | null;
  certPem?: string; // idem solPassword
  certKeyPem?: string; // idem solPassword
  taxAffectation?: string;
  igvPercent?: number;
}

/**
 * Antes SUNAT_RUC/SUNAT_SOL_USER/SUNAT_SOL_PASSWORD/etc. SOLO se podían
 * configurar editando el .env del servidor — no había ninguna pantalla.
 * Esta fila la lee apps/worker directamente (mismo Prisma client, ver
 * invoice.processor.ts) con fallback a las variables de entorno para no
 * romper un despliegue que ya las configuró así.
 *
 * Los secretos (solPassword/certPem/certKeyPem) NUNCA se devuelven al
 * frontend en texto plano — get() solo informa si ya están configurados
 * (hasSolPassword/hasCertPem/hasCertKeyPem) para que el formulario pueda
 * mostrar "ya configurado" sin arriesgar exponerlos. update() solo
 * sobreescribe un secreto cuando llega un valor no vacío — dejar el campo
 * en blanco en el formulario NO borra lo ya guardado.
 */
@Injectable()
export class SunatSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get() {
    const row = await this.prisma.sunatSettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
      env: row?.env ?? "beta",
      ruc: row?.ruc ?? null,
      solUser: row?.solUser ?? null,
      razonSocial: row?.razonSocial ?? null,
      address: row?.address ?? null,
      ubigeo: row?.ubigeo ?? null,
      boletaSeries: row?.boletaSeries ?? null,
      facturaSeries: row?.facturaSeries ?? null,
      boletaCreditSeries: row?.boletaCreditSeries ?? null,
      facturaCreditSeries: row?.facturaCreditSeries ?? null,
      taxAffectation: row?.taxAffectation ?? "EXONERADO",
      igvPercent: row?.igvPercent ?? 18,
      hasSolPassword: Boolean(row?.solPassword),
      hasCertPem: Boolean(row?.certPem),
      hasCertKeyPem: Boolean(row?.certKeyPem),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async update(input: UpsertSunatSettingsInput) {
    const { solPassword, certPem, certKeyPem, ...rest } = input;
    const data: Record<string, unknown> = { ...rest };
    // Solo se toca el secreto si vino un valor no vacío — un string vacío o
    // ausente significa "no lo cambies", no "bórralo".
    if (solPassword) data.solPassword = solPassword;
    if (certPem) data.certPem = certPem;
    if (certKeyPem) data.certKeyPem = certKeyPem;

    await this.prisma.sunatSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    return this.get();
  }
}
