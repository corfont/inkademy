import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { AdminRolesManager } from "@/components/admin/AdminRolesManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Roles de administrador" };

export default async function AdminRolesPage() {
  const accessToken = getServerAccessToken();
  const { data: roles, live } = await withFallback(() => adminApi.adminRoles(accessToken), [] as any[]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Roles de administrador</h1>
        <p className="mt-1 text-sm text-ash-500">
          Crea roles que solo ven o editan ciertos módulos del panel (por ejemplo, Finanzas o Soporte) y asígnalos a quien corresponda. Quien no tiene un
          rol asignado sigue siendo administrador completo.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran los roles por ahora.</Callout>}
      <AdminRolesManager roles={roles} />
    </div>
  );
}
