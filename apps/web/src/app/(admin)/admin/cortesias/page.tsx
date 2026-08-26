import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { GrantFreeAccessForm } from "@/components/admin/GrantFreeAccessForm";
import { CourtesyGrantsHistory } from "@/components/admin/CourtesyGrantsHistory";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Cortesías (admin)" };

export default async function AdminGrantsPage() {
  const accessToken = getServerAccessToken();
  const { data: grants, live } = await withFallback(() => adminApi.courtesyGrants({}, accessToken), [] as any[]);
  const { data: areas } = await withFallback(() => adminApi.areas(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Otorgar acceso gratuito</h1>
        <p className="mt-1 text-sm text-ash-500">
          Para cursos/programas con precio que se regalan por estrategia (marketing, cortesía a un cliente, etc.).
          No se genera ninguna orden ni comprobante SUNAT.
        </p>
      </div>
      <GrantFreeAccessForm />
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestra el historial real de cortesías por ahora.</Callout>}
      <CourtesyGrantsHistory grants={grants} areas={areas} />
    </div>
  );
}
