"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { authApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

/** Enlace personal de referido: el alumno lo comparte por su cuenta; Inkademy nunca pide ni guarda contactos de terceros. */
export function ReferralCard() {
  const [data, setData] = useState<{ code: string | null; registered: number; enrolled: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    authApi.referral().then(setData).catch(() => setData(null));
  }, []);

  if (!data?.code) return null;
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/registro?ref=${data.code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="mt-8 max-w-2xl">
      <CardContent className="flex flex-col gap-3 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Invita a tus compañeros</h2>
        <p className="text-sm text-ash-600">
          Comparte tu enlace personal. Quien se registre con él queda asociado a ti; nosotros no le escribimos a nadie en tu nombre.
        </p>
        <div className="flex items-center gap-2">
          <input readOnly value={link} aria-label="Tu enlace de referido" className="h-10 flex-1 rounded-md border border-paper-border bg-paper-muted px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <Check className="mr-1 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-1 h-4 w-4" aria-hidden="true" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="text-sm text-ash-500">
          Tu código: <strong className="font-mono text-ink-900">{data.code}</strong> · {data.registered} {data.registered === 1 ? "persona se registró" : "personas se registraron"}
          {data.enrolled > 0 ? ` (${data.enrolled} ya ${data.enrolled === 1 ? "se matriculó" : "se matricularon"})` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
