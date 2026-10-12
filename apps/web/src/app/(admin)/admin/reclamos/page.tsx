import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { ComplaintsManager } from "@/components/admin/ComplaintsManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Reclamos (admin)" };

export default async function AdminComplaintsPage() {
  const accessToken = getServerAccessToken();
  const { data: complaints, live } = await withFallback(() => adminApi.complaints(accessToken), [] as any[]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Libro de Reclamaciones</h1>
        <p className="mt-1 text-sm text-ash-500">
          Reclamos y quejas que llegan del formulario público (/libro-de-reclamaciones). La ley da 15 días hábiles para responder; la respuesta se envía al consumidor por correo.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran los reclamos por ahora.</Callout>}
      <ComplaintsManager complaints={complaints} />
    </div>
  );
}
