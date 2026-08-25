import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

const SETTINGS_ID = "default";

export interface UpsertChatbotSettingsInput {
  enabled?: boolean;
  provider?: string;
  model?: string;
  apiKey?: string; // solo se sobreescribe si viene no-vacío — ver update()
  systemPrompt?: string | null;
  suggestionAutoRespond?: boolean;
  suggestionAutoRespondDelayMinutes?: number;
}

/**
 * Configuración del asistente de IA (mismo patrón que SunatSettingsService):
 * la API key nunca se devuelve tal cual al frontend, solo un flag
 * `hasApiKey`; dejar el campo en blanco al guardar significa "no la cambies".
 * ChatbotService (módulo chatbot) lee esta fila primero y cae a
 * process.env.GEMINI_API_KEY si no hay fila o el campo viene vacío.
 */
@Injectable()
export class ChatbotSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get() {
    const row = await this.prisma.chatbotSettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
      enabled: row?.enabled ?? false,
      provider: row?.provider ?? "gemini",
      model: row?.model ?? "gemini-2.5-flash",
      systemPrompt: row?.systemPrompt ?? null,
      hasApiKey: Boolean(row?.apiKey) || Boolean(process.env.GEMINI_API_KEY),
      // "Parametrizarse si se quiere de manera automática o si se quiere un
      // paso extra donde el administrador dé su aprobación" — y el plazo en
      // minutos para que la respuesta automática no llegue "inmediata".
      suggestionAutoRespond: row?.suggestionAutoRespond ?? false,
      suggestionAutoRespondDelayMinutes: row?.suggestionAutoRespondDelayMinutes ?? 30,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async update(input: UpsertChatbotSettingsInput) {
    const { apiKey, ...rest } = input;
    const data: Record<string, unknown> = { ...rest };
    if (apiKey) data.apiKey = apiKey;

    await this.prisma.chatbotSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    return this.get();
  }
}
