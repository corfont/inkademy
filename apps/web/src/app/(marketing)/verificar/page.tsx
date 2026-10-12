import type { Metadata } from "next";
import { VerifyCodeForm } from "@/components/marketing/VerifyCodeForm";

export const metadata: Metadata = {
  title: "Verificar certificado",
  description: "Comprueba la autenticidad de un certificado de Inkademy con el código impreso en el documento.",
};

export default function VerifyIndexPage() {
  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-lg rounded-lg border border-paper-border bg-paper p-8 shadow-card">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Verificación de certificado</h1>
        <p className="mt-2 text-sm text-ash-600">Ingresa el código impreso en el certificado (o escanea su código QR) para validar su autenticidad.</p>
        <VerifyCodeForm />
      </div>
    </div>
  );
}
