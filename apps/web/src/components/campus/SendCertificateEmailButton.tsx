"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { certificateApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";

export function SendCertificateEmailButton({ certificateId }: { certificateId: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleClick() {
    setStatus("sending");
    try {
      await certificateApi.emailToSelf(certificateId);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return <span className="text-sm text-success">Enviado a tu correo ✓</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="ghost" onClick={handleClick} disabled={status === "sending"}>
        <Mail className="h-4 w-4" aria-hidden="true" />
        {status === "sending" ? "Enviando…" : "Enviar por correo"}
      </Button>
      {status === "error" && <p className="text-xs text-danger">No pudimos enviarlo. Intenta de nuevo.</p>}
    </div>
  );
}
