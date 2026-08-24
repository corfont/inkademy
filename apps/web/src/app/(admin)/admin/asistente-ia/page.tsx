import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { ChatbotSettingsForm } from "@/components/admin/ChatbotSettingsForm";

export const metadata: Metadata = { title: "Asistente de IA" };

export default async function ChatbotSettingsPage() {
  const accessToken = getServerAccessToken();
  const settings = await adminApi.chatbotSettings(accessToken);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-serif text-2xl font-semibold text-ink-900">Asistente de IA</h1>
      <p className="mb-6 text-sm text-ash-500">
        Un chat flotante con inteligencia artificial (Google Gemini) para resolver dudas frecuentes de alumnos,
        docentes y empresas. Usa la capa gratuita de Gemini — solo necesitas una API key de Google AI Studio.
      </p>
      <ChatbotSettingsForm settings={settings} />
    </div>
  );
}
