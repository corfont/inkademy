import type { Metadata } from "next";
import { platformLicenseApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { PlatformLicenseManager } from "@/components/admin/PlatformLicenseManager";

export const metadata: Metadata = { title: "Licencias de arriendo" };

export default async function PlatformLicensesPage() {
  const accessToken = getServerAccessToken();
  const licenses = await platformLicenseApi.list(accessToken).catch(() => []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="mb-1 font-serif text-2xl font-semibold text-ink-900">Licencias de arriendo</h1>
        <p className="text-sm text-ash-500">
          Terceros que arriendan el sistema completo como instancia propia (aislada, marca blanca) — cada arrendatario
          corre su propio despliegue con su propia base de datos, no comparte datos con esta instancia. Esta pantalla
          solo lleva la cuenta comercial: cliente, plazo y precio.
        </p>
      </div>
      <PlatformLicenseManager licenses={licenses} />
    </div>
  );
}
