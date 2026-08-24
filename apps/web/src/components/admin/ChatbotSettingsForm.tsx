"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError, type ChatbotSettingsDTO } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Configuración del asistente de IA (widget flotante para alumnos/docentes/
 * empresas). Mismo patrón que SunatSettingsForm: la API key nunca vuelve
 * del servidor en texto plano, solo un placeholder si ya está configurada.
 */
export function ChatbotSettingsForm({ settings }: { settings: ChatbotSettingsDTO }) {
  const router = useRouter();
  const [form, setForm] = useState({
    enabled: settings.enabled,
    provider: settings.provider,
    model: settings.model,
    apiKey: "",
    systemPrompt: settings.systemPrompt ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await adminApi.updateChatbotSettings(form);
      setSaved(true);
      setForm((f) => ({ ...f, apiKey: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {saved && <Callout variant="success">Configuración guardada.</Callout>}
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            Mostrar el asistente de IA a los usuarios (campus, empresa y docente)
          </label>
          {form.enabled && !settings.hasApiKey && !form.apiKey && (
            <Callout variant="warning">Falta configurar la API key para que el asistente funcione.</Callout>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="chatbot-provider">Proveedor</Label>
              <Select id="chatbot-provider" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                <option value="gemini">Google Gemini (capa gratuita)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="chatbot-model">Modelo</Label>
              <Select id="chatbot-model" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}>
                <option value="gemini-2.5-flash">gemini-2.5-flash (rápido, recomendado)</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro (más capaz, más lento)</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="chatbot-api-key">API key de Google AI Studio</Label>
            <Input
              id="chatbot-api-key"
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder={settings.hasApiKey ? "•••••••• (ya configurada — deja en blanco para no cambiarla)" : "Pega aquí tu API key"}
            />
            <p className="mt-1 text-xs text-ash-500">
              Gratis en{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">
                aistudio.google.com/apikey
              </a>
              . Si el asistente no responde tras guardar, prueba con "gemini-2.5-pro" o revisa que la clave no tenga
              espacios de más al copiarla.
            </p>
          </div>

          <div>
            <Label htmlFor="chatbot-prompt">Instrucciones del asistente (opcional)</Label>
            <textarea
              id="chatbot-prompt"
              className="min-h-[6rem] w-full rounded-md border border-paper-border bg-paper p-2 text-sm"
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="Eres el asistente virtual de Inkademy… (si lo dejas vacío, se usa un mensaje por defecto)"
            />
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="self-start" disabled={saving} onClick={handleSave}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
    </div>
  );
}
