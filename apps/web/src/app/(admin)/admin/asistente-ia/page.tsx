import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { ChatbotSettingsForm } from "@/components/admin/ChatbotSettingsForm";
import { ChatbotDocumentsManager } from "@/components/admin/ChatbotDocumentsManager";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Asistente de IA" };

export default async function ChatbotSettingsPage() {
  const accessToken = getServerAccessToken();
  const [settings, documents] = await Promise.all([
    adminApi.chatbotSettings(accessToken),
    adminApi.chatbotDocuments(accessToken).catch(() => []),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="mb-1 font-serif text-2xl font-semibold text-ink-900">Asistente de IA</h1>
        <p className="text-sm text-ash-500">
          Un chat flotante con inteligencia artificial (Google Gemini) para resolver dudas frecuentes de alumnos,
          docentes y empresas. Usa la capa gratuita de Gemini — solo necesitas una API key de Google AI Studio.
        </p>
      </div>
      <ChatbotSettingsForm settings={settings} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Base de conocimiento</h2>
          <ChatbotDocumentsManager documents={documents} />
        </CardContent>
      </Card>
    </div>
  );
}
