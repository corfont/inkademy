import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { RoyaltyRecipientManager } from "@/components/admin/RoyaltyRecipientManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Regalías (admin)" };

export default async function RoyaltyRecipientsPage() {
  const accessToken = getServerAccessToken();
  const { data: recipients, live } = await withFallback(() => adminApi.royaltyRecipients(accessToken), [] as any[]);
  const { data: courses } = await withFallback(() => adminApi.courses(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Regalías</h1>
        <p className="mt-1 text-sm text-ash-500">
          Cursos que pagan un % o monto por alumno matriculado, por alumno que termina, o por referido — a alguien que no es usuario de la
          plataforma.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran destinatarios reales por ahora.</Callout>}
      <RoyaltyRecipientManager recipients={recipients} courses={courses} />
    </div>
  );
}
