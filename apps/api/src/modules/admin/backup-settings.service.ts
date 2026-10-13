import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { testSharePointConnection } from "@inkademy/shared";
import { z } from "zod";
import { PRISMA } from "../../common/prisma/prisma.module";
import { logAudit } from "./audit-log.util";

const SETTINGS_ID = "default";

export const backupSettingsSchema = z
  .object({
    sharepointEnabled: z.boolean(),
    sharepointFolderUrl: z.string().trim().max(1000).nullish(),
  })
  .superRefine((v, ctx) => {
    const url = v.sharepointFolderUrl?.trim();
    if (v.sharepointEnabled && !url) {
      ctx.addIssue({ code: "custom", path: ["sharepointFolderUrl"], message: "Pega el enlace de la carpeta de SharePoint para activar la copia externa." });
    }
    if (url && !/^https:\/\/[^/\s]+\.sharepoint\.com\//i.test(url)) {
      ctx.addIssue({ code: "custom", path: ["sharepointFolderUrl"], message: "Debe ser un enlace de SharePoint (https://…sharepoint.com/…)." });
    }
  });
export type BackupSettingsInput = z.infer<typeof backupSettingsSchema>;

/**
 * Dónde se guarda la copia EXTERNA de los respaldos. La ruta (enlace de la
 * carpeta de SharePoint) la pone el administrador aquí; las credenciales de
 * Microsoft salen de las variables MS_* del servidor y nunca se muestran.
 */
@Injectable()
export class BackupSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private static credentials() {
    const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
    return MS_TENANT_ID && MS_CLIENT_ID && MS_CLIENT_SECRET
      ? { tenantId: MS_TENANT_ID, clientId: MS_CLIENT_ID, clientSecret: MS_CLIENT_SECRET }
      : null;
  }

  async get() {
    const row = await this.prisma.backupSettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
      sharepointEnabled: row?.sharepointEnabled ?? false,
      sharepointFolderUrl: row?.sharepointFolderUrl ?? "",
      microsoftConfigured: Boolean(BackupSettingsService.credentials()),
      encryptionEnabled: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
      lastTestAt: row?.lastTestAt ?? null,
      lastTestOk: row?.lastTestOk ?? null,
      lastTestNote: row?.lastTestNote ?? null,
    };
  }

  async update(input: BackupSettingsInput, actorId: string) {
    const before = await this.get();
    const url = input.sharepointFolderUrl?.trim() || null;
    // Cambiar la carpeta invalida la última prueba: hay que volver a probar.
    const folderChanged = (before.sharepointFolderUrl || null) !== url;
    await this.prisma.backupSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, sharepointEnabled: input.sharepointEnabled, sharepointFolderUrl: url },
      update: {
        sharepointEnabled: input.sharepointEnabled,
        sharepointFolderUrl: url,
        ...(folderChanged ? { lastTestAt: null, lastTestOk: null, lastTestNote: null } : {}),
      },
    });
    await logAudit(this.prisma, {
      actorId,
      action: "BACKUP_SETTINGS_UPDATE",
      entity: "BackupSettings",
      entityId: SETTINGS_ID,
      before: { sharepointEnabled: before.sharepointEnabled, sharepointFolderUrl: before.sharepointFolderUrl },
      after: { sharepointEnabled: input.sharepointEnabled, sharepointFolderUrl: url },
    });
    return this.get();
  }

  /** Prueba REAL: inicia sesión en Microsoft, abre la carpeta y escribe (y borra) un archivo diminuto. */
  async test(actorId: string) {
    const settings = await this.get();
    if (!settings.sharepointFolderUrl) throw new BadRequestException("Primero guarda el enlace de la carpeta de SharePoint.");
    const creds = BackupSettingsService.credentials();
    const result = creds
      ? await testSharePointConnection(creds, settings.sharepointFolderUrl)
      : { ok: false, note: "El servidor no tiene las credenciales de Microsoft (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET): se configuran en el archivo .env del servidor." };
    await this.prisma.backupSettings.update({
      where: { id: SETTINGS_ID },
      data: { lastTestAt: new Date(), lastTestOk: result.ok, lastTestNote: result.note.slice(0, 500) },
    });
    await logAudit(this.prisma, { actorId, action: "BACKUP_SETTINGS_TEST", entity: "BackupSettings", entityId: SETTINGS_ID, after: { ok: result.ok } });
    return result;
  }
}
