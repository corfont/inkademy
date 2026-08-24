import type { Metadata } from "next";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COMPANY_DASHBOARD } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Empresas (admin)" };

const MOCK_COMPANIES = [
  { id: "comp1", legalName: MOCK_COMPANY_DASHBOARD.legalName, country: "PE", size: "LARGE", status: "active", seatsUsed: 84, seatsPurchased: 120 },
  { id: "comp2", legalName: "Minera del Sur S.A.", country: "PE", size: "ENTERPRISE", status: "active", seatsUsed: 210, seatsPurchased: 250 },
  { id: "comp3", legalName: "Retail Norte SAC", country: "PE", size: "MEDIUM", status: "suspended", seatsUsed: 12, seatsPurchased: 30 },
];

export default async function AdminCompaniesPage() {
  const accessToken = getServerAccessToken();
  const { data: companies, live } = await withFallback(() => adminApi.companies(accessToken), MOCK_COMPANIES);

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
            {companies.map((company: any) => (
              <tr key={company.id}>
                <td className="p-4 font-medium text-ink-900">{company.legalName}</td>
                <td className="p-4 text-ash-600">{company.country}</td>
                <td className="p-4 text-ash-600">{company.size ?? "—"}</td>
                <td className="p-4 text-ash-600">
                  {company.seatsUsed} / {company.seatsPurchased}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
