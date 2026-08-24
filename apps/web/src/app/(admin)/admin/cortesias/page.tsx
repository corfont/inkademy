import type { Metadata } from "next";
import { GrantFreeAccessForm } from "@/components/admin/GrantFreeAccessForm";

export const metadata: Metadata = { title: "Cortesías (admin)" };

export default function AdminGrantsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Otorgar acceso gratuito</h1>
        <p className="mt-1 text-sm text-ash-500">
          Para cursos/programas con precio que se regalan por estrategia (marketing, cortesía a un cliente, etc.).
          No se genera ninguna orden ni comprobante SUNAT.
        </p>
      </div>
      <GrantFreeAccessForm />
    </div>
  );
}
