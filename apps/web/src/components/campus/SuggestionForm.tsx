"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suggestionsApi, ApiError } from "@/lib/api-client";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export function SuggestionForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    try {
      await suggestionsApi.create(message.trim());
      setMessage("");
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos enviar tu sugerencia.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        {sent && (
          <Callout variant="success" className="mb-4">
            ¡Gracias! Tu sugerencia llegó al equipo de contenido.
          </Callout>
        )}
        {error && <Callout variant="danger" className="mb-4">{error}</Callout>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Textarea
            placeholder="Ej: Me encantaría un curso de Excel avanzado para finanzas…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[6rem]"
          />
          <Button type="submit" disabled={sending || !message.trim()} className="self-start">
            {sending ? "Enviando…" : "Enviar sugerencia"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
