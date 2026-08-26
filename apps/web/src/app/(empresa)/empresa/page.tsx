import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { companyApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Mi empresa" };

/**
 * Punto de entrada del rol Empresa (GlobalRole.COMPANY) tras iniciar
 * sesión — a diferencia de /campus o /docente, una empresa no tiene un
 * único ID conocido de antemano (una persona puede pertenecer a más de
 * una), así que esta página lo resuelve: una sola empresa → entra directo
 * ahí; varias → elige; ninguna → mensaje explicando cómo crear una.
 */
export default async function EmpresaIndexPage() {
  const accessToken = getServerAccessToken();
  const companies = await companyApi.mine(accessToken).catch(() => []);

  if (companies.length === 1) {
    redirect(`/empresa/${companies[0].companyId}`);
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-16 text-center">
      <Building2 className="mx-auto h-10 w-10 text-ink-700" aria-hidden="true" />
      {companies.length === 0 ? (
        <>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Todavía no perteneces a ninguna empresa</h1>
          <p className="text-sm text-ash-600">Crea el perfil de tu empresa para gestionar cupos, colaboradores y reportes.</p>
          <Link href="/empresas" className="text-ink-600 underline-offset-2 hover:underline">
            Registrar mi empresa
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Elige una empresa</h1>
          <div className="flex flex-col gap-3">
            {companies.map((c) => (
              <Link key={c.companyId} href={`/empresa/${c.companyId}`}>
                <Card className="p-4 text-left transition-shadow hover:shadow-raised">
                  <CardContent className="p-0">
                    <p className="font-medium text-ink-900">{c.legalName}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
