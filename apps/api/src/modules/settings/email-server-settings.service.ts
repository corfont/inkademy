import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

const SETTINGS_ID = "default";

export interface UpsertEmailServerSettingsInput {
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  username?: string | null;
  password?: string; // solo se sobreescribe si viene no-vacío — ver update()
  fromEmail?: string | null;
  fromName?: string | null;
}

/**
 * "Se debe configurar los servidores para poder mandar correos" — antes el
 * SMTP solo se configuraba con variables de entorno del worker
 * (SMTP_HOST/PORT/USER/PASS, ver apps/worker/src/lib/mailer.ts), sin
 * ninguna pantalla de admin. Mismo patrón "DB primero, env de respaldo" y
 * "el secreto nunca se devuelve tal cual" que SunatSettings/ChatbotSettings
 * — apps/worker/src/lib/mailer.ts lee esta misma fila antes de caer a env.
 */
@Injectable()
export class EmailServerSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get() {
    const row = await this.prisma.emailServerSettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
      host: row?.host ?? process.env.SMTP_HOST ?? null,
      port: row?.port ?? Number(process.env.SMTP_PORT ?? 1025),
      secure: row?.secure ?? process.env.SMTP_SECURE === "true",
      username: row?.username ?? process.env.SMTP_USER ?? null,
      hasPassword: Boolean(row?.password) || Boolean(process.env.SMTP_PASS),
      fromEmail: row?.fromEmail ?? process.env.EMAIL_FROM_ADDRESS ?? null,
      fromName: row?.fromName ?? "Inkademy",
      configuredInDb: Boolean(row?.host),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async update(input: UpsertEmailServerSettingsInput, actorId?: string) {
    const { password, ...rest } = input;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.password = password;

    await this.prisma.emailServerSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    // Nunca se guarda la contraseña en el log, solo qué campos cambiaron y quién.
    await this.prisma.auditLog.create({
      data: { actorId, action: "EMAIL_SERVER_SETTINGS_UPDATE", entity: "EmailServerSettings", entityId: SETTINGS_ID, after: { changedFields: Object.keys(input) } },
    });
    return this.get();
  }
}
