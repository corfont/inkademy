import type { Metadata } from "next";
import { privacyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { PrivacyRequestsManager } from "@/components/admin/PrivacyRequestsManager";

export const metadata: Metadata = { title: "Privacidad (ARCO) — admin" };

export default async function AdminPrivacyPage() {
  const accessToken = getServerAccessToken();
  const { data: requests } = await withFallback(() => privacyApi.adminList(accessToken), []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Privacidad (derechos ARCO)</h1>
        <p className="mt-1 text-sm text-ash-500">
          Solicitudes de acceso, rectificación, cancelación y oposición sobre datos personales (Ley 29733). Hay un plazo legal de respuesta: las vencidas se marcan en rojo.
        </p>
      </div>
      <PrivacyRequestsManager requests={requests} />
    </div>
  );
}
