import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COMPANY_DASHBOARD } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Empresas (admin)" };

const MOCK_COMPANIES = [
  { id: "comp1", legalName: MOCK_COMPANY_DASHBOARD.legalName, country: "PE", size: "LARGE", status: "active", seatsUsed: 84, seatsPurchased: 120 },
  { id: "comp2", legalName: "Minera del Sur S.A.", country: "PE", size: "ENTERPRISE", status: "active", seatsUsed: 210, seatsPurchased: 250 },
  { id: "comp3", legalName: "Retail Norte SAC", country: "PE", size: "MEDIUM", status: "suspended", seatsUsed: 12, seatsPurchased: 30 },
];

const SIZE_LABEL: Record<string, string> = { MICRO: "Micro", SMALL: "Pequeña", MEDIUM: "Mediana", LARGE: "Grande", ENTERPRISE: "Corporativo" };

export default async function AdminCompaniesPage() {
  const accessToken = getServerAccessToken();
  const { data: companies, live } = await withFallback(() => adminApi.companies(accessToken), MOCK_COMPANIES);

  const activeCount = companies.filter((c: any) => c.status === "active").length;
  const suspendedCount = companies.length - activeCount;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Empresas</h1>
        <p className="mt-1 text-sm text-ash-500">
          Entra a "Gestionar" para ver a los trabajadores de cada empresa, qué cursos llevan, asignarles cupos (si la empresa
          todavía no lo hizo ella misma) y ver sus reportes de avance — el mismo panel que usa la empresa, con acceso completo.
        </p>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="transition-shadow hover:shadow-raised">
          <CardContent className="p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{companies.length}</p>
            <p className="text-sm text-ash-500">Total de empresas</p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-raised">
          <CardContent className="p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-bg text-success">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{activeCount}</p>
            <p className="text-sm text-ash-500">Activas</p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-raised">
          <CardContent className="p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-bg text-danger">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{suspendedCount}</p>
            <p className="text-sm text-ash-500">Suspendidas</p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Razón social</th>
              <th className="p-4 font-medium">País</th>
              <th className="p-4 font-medium">Tamaño</th>
              <th className="p-4 font-medium">Cupos</th>
              <th className="p-4 font-medium">Estado</th>
              <th className="p-4 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {companies.map((company: any) => {
              const seatPct = company.seatsPurchased > 0 ? Math.min(100, Math.round((company.seatsUsed / company.seatsPurchased) * 100)) : 0;
              return (
                <tr key={company.id} className="transition-colors hover:bg-paper-muted">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="font-medium text-ink-900">{company.legalName}</span>
                    </div>
                  </td>
                  <td className="p-4 text-ash-600">{company.country}</td>
                  <td className="p-4">{company.size ? <Badge variant="outline">{SIZE_LABEL[company.size] ?? company.size}</Badge> : "—"}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper-muted">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${seatPct}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-xs text-ash-500">
                        {company.seatsUsed}/{company.seatsPurchased}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant={company.status === "active" ? "success" : "danger"}>{company.status}</Badge>
                  </td>
                  <td className="p-4">
                    <Link href={`/empresa/${company.id}`}>
                      <Button size="sm" variant="outline">
                        Gestionar
                      </Button>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
