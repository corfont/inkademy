import type { Metadata } from "next";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COURSES } from "@/lib/mock-data";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CatalogListClient } from "@/components/admin/CatalogListClient";

export const metadata: Metadata = { title: "Catálogo (admin)" };

export default async function AdminCatalogPage() {
  const accessToken = getServerAccessToken();
  const { data: courses, live } = await withFallback(() => adminApi.courses(accessToken), MOCK_COURSES);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Catálogo</h1>
        <div className="flex gap-2">
          <Link href="/admin/catalogo/areas">
            <Button variant="outline">Áreas</Button>
          </Link>
          <Link href="/admin/catalogo/programas">
            <Button variant="outline">Programas</Button>
          </Link>
          <Link href="/admin/catalogo/nuevo">
            <Button>Nuevo curso</Button>
          </Link>
        </div>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <CatalogListClient courses={courses} />
    </div>
  );
}
