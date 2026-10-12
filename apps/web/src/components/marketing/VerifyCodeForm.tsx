"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/** Campo para escribir el código de un certificado y abrir su verificación pública. */
export function VerifyCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = code.trim();
        if (clean) router.push(`/verificar/${encodeURIComponent(clean)}`);
      }}
    >
      <div>
        <Label htmlFor="cert-code">Código de certificado</Label>
        <Input id="cert-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="INK-XXXXXXXX" autoComplete="off" autoCapitalize="characters" />
      </div>
      <Button type="submit" disabled={code.trim().length === 0}>Verificar</Button>
    </form>
  );
}
