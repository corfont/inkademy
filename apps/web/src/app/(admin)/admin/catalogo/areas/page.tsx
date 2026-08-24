import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { AreaManager } from "@/components/admin/AreaManager";

export const metadata: Metadata = { title: "Áreas del catálogo" };

export default async function AdminAreasPage() {
  const accessToken = getServerAccessToken();
  const areas = await adminApi.areas(accessToken);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Áreas del catálogo</h1>
        <p className="mt-1 text-sm text-ash-500">
          Las áreas agrupan cursos y programas en el catálogo público (ej. &quot;Gestión&quot;, &quot;Tecnología&quot;).
        </p>
      </div>
      <AreaManager areas={areas} />
    </div>
  );
}
