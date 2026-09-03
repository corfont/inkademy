import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

const SETTINGS_ID = "default";

export interface UpsertNotificationSettingsInput {
  courseAccessExpiringEmail?: boolean;
  courseAccessExpiringInApp?: boolean;
  liveSessionUpcomingEmail?: boolean;
  liveSessionUpcomingInApp?: boolean;
  assessmentDueEmail?: boolean;
  assessmentDueInApp?: boolean;
  partnershipExpiringEmail?: boolean;
  partnershipExpiringInApp?: boolean;
  partnershipExpiringLeadDays?: number;
  supportTicketUpdateEmail?: boolean;
  supportTicketUpdateInApp?: boolean;
  suggestionUnansweredEmail?: boolean;
  suggestionUnansweredInApp?: boolean;
  suggestionUnansweredAfterHours?: number;
  platformLicenseExpiringEmail?: boolean;
  platformLicenseExpiringInApp?: boolean;
  platformLicenseExpiringLeadDays?: number;
}

/**
 * Mismo patrón singleton que ChatbotSettingsService (id fijo "default").
 * `get()` upsert-ea la fila si no existe (a diferencia de ChatbotSettings,
 * acá no hay ningún secreto que ocultar — todo el objeto se devuelve tal
 * cual). El worker lee esta MISMA tabla directo con Prisma (ver
 * apps/worker/src/lib/notify.ts::getNotificationSettingsCached) — no hay
 * duplicación de defaults porque ambos leen la fila real de Postgres, los
 * defaults de columna (`@default(true)` etc.) son la única fuente.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get() {
    return this.prisma.notificationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  async update(input: UpsertNotificationSettingsInput) {
    await this.prisma.notificationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...input },
      update: input,
    });
    return this.get();
  }
}
