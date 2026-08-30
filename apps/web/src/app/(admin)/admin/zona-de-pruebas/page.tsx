import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { Callout } from "@/components/ui/Callout";
import { ZonaDePruebasClient } from "@/components/admin/ZonaDePruebasClient";

export const metadata: Metadata = { title: "Zona de pruebas (admin)" };

/**
 * "Quisiera tener algunos accesos... para borrar los cursos dados (uno,
 * algunos, todos), borrar usuarios... Los accesos a borrar todo son de
 * sumo cuidado, por lo cual debería estar en un módulo aparte, con doble
 * verificación" — módulo separado, solo ADMIN puro (nunca SUPPORT, ver
 * admin/layout.tsx), que reusa las listas ya existentes de /admin/courses,
 * /admin/users, /admin/areas, /admin/companies. El backend (AdminService.
 * bulkDelete*) es el único que decide qué de verdad se puede borrar —
 * nunca borra algo con actividad real, aunque se seleccione.
 */
export default async function ZonaDePruebasPage() {
  const accessToken = getServerAccessToken();
  const [courses, users, areas, companies] = await Promise.all([
    adminApi.courses(accessToken),
    adminApi.users({}, accessToken),
    adminApi.areas(accessToken),
    adminApi.companies(accessToken),
  ]);

  const courseItems = courses.map((c: any) => ({ id: c.id, label: c.title?.es ?? c.slug }));
  const userItems = users.map((u: any) => ({ id: u.id, label: `${u.firstName} ${u.lastName} (${u.email})` }));
  const areaItems = areas.map((a: any) => ({ id: a.id, label: a.name?.es ?? a.slug }));
  const companyItems = companies.map((c: any) => ({ id: c.id, label: `${c.legalName} (${c.taxId})` }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Zona de pruebas</h1>
        <p className="text-sm text-ash-600">Borrado en lote y deshacer órdenes de prueba — solo para limpiar datos de prueba.</p>
      </div>

      <Callout variant="danger" title="Esta pantalla borra datos de verdad">
        Solo úsala para limpiar cuentas/cursos/empresas de prueba — nunca para actividad real. Cualquier elemento con
        matrículas, compras o certificados reales se omite automáticamente, aunque lo selecciones.
      </Callout>

      <ZonaDePruebasClient courseItems={courseItems} userItems={userItems} areaItems={areaItems} companyItems={companyItems} />
    </div>
  );
}
