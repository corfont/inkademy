import type { Metadata } from "next";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COURSES } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Catálogo (admin)" };

// `GET /admin/courses` incluye `area: { ... }` completo (Prisma), no un
// `areaSlug` plano — ver `AdminService.listCourses`.
function areaLabel(course: any): string {
  return course.areaSlug ?? course.area?.slug ?? "—";
}

export default async function AdminCatalogPage() {
  const accessToken = getServerAccessToken();
  const { data: courses, live } = await withFallback(() => adminApi.courses(accessToken), MOCK_COURSES);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Catálogo</h1>
        <Link href="/admin/catalogo/nuevo">
          <Button>Nuevo curso</Button>
        </Link>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Título</th>
              <th className="p-4 font-medium">Área</th>
              <th className="p-4 font-medium">Modalidad</th>
              <th className="p-4 font-medium">Estado</th>
              <th className="p-4 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {courses.map((course: any) => (
              <tr key={course.id}>
                <td className="p-4 font-medium text-ink-900">{course.title.es ?? course.title}</td>
                <td className="p-4 text-ash-600">{areaLabel(course)}</td>
                <td className="p-4 text-ash-600">{course.modality}</td>
                <td className="p-4">
                  <Badge variant={course.status === "PUBLISHED" ? "success" : "outline"}>
                    {course.status === "PUBLISHED" ? "Publicado" : course.status === "ARCHIVED" ? "Archivado" : "Borrador"}
                  </Badge>
                </td>
                <td className="p-4">
                  <Link href={`/admin/catalogo/${course.id}`}>
                    <Button size="sm" variant="ghost">
                      Editar
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
