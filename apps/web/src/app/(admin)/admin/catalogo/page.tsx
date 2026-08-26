import type { Metadata } from "next";
import Link from "next/link";
import { adminApi, catalogApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COURSES, MOCK_AREAS, MOCK_SECTIONS } from "@/lib/mock-data";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CatalogListClient } from "@/components/admin/CatalogListClient";

export const metadata: Metadata = { title: "Catálogo (admin)" };

export default async function AdminCatalogPage() {
  const accessToken = getServerAccessToken();
  // "El administrador, al ver el catálogo en galería, debería verlo
  // idénticamente a como lo ve un usuario — eso le ayuda a tomar
  // decisiones de precio/descuento/visualización." Se reutilizan EXACTAMENTE
  // los mismos endpoints públicos que alimentan el Home/Catálogo reales
  // (catalogApi.sections/areas/courses), no una reconstrucción aparte —
  // así nunca se puede desincronizar de lo que un alumno ve de verdad.
  const [{ data: courses, live }, { data: sections }, { data: areas }, { data: publicCourses }] = await Promise.all([
    withFallback(() => adminApi.courses(accessToken), MOCK_COURSES),
    withFallback(() => catalogApi.sections(), MOCK_SECTIONS),
    withFallback(() => catalogApi.areas(), MOCK_AREAS),
    withFallback(() => catalogApi.courses({ pageSize: 200 }), { items: MOCK_COURSES as never, total: 0, page: 1, pageSize: 200 }),
  ]);

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

      <CatalogListClient courses={courses} sections={sections} areas={areas} publicCourses={publicCourses.items} />
    </div>
  );
}
