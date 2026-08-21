import type { Metadata } from "next";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COMPANY_DASHBOARD } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Empresas (admin)" };

const MOCK_COMPANIES = [
  { id: "comp1", legalName: MOCK_COMPANY_DASHBOARD.legalName, country: "PE", size: "LARGE", status: "active", seatsUsed: 84 },
  { id: "comp2", legalName: "Minera del Sur S.A.", country: "PE", size: "ENTERPRISE", status: "active", seatsUsed: 210 },
  { id: "comp3", legalName: "Retail Norte SAC", country: "PE", size: "MEDIUM", status: "suspended", seatsUsed: 12 },
];

export default async function AdminCompaniesPage() {
  const accessToken = getServerAccessToken();
  // Nota: `GET /admin/companies` devuelve la fila `Company` cruda — no
  // incluye `seatsUsed` agregado (esa columna solo tiene datos reales en el
  // fallback simulado); calcularlo requeriría agregar sobre CompanySeatPool
  // en el backend, pendiente para una próxima iteración.
  const { data: companies, live } = await withFallback(() => adminApi.companies(accessToken), MOCK_COMPANIES);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Empresas</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Razón social</th>
              <th className="p-4 font-medium">País</th>
              <th className="p-4 font-medium">Tamaño</th>
              <th className="p-4 font-medium">Cupos usados</th>
              <th className="p-4 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {companies.map((company: any) => (
              <tr key={company.id}>
                <td className="p-4 font-medium text-ink-900">
                  <Link href={`/empresa/${company.id}`} className="hover:underline">
                    {company.legalName}
                  </Link>
                </td>
                <td className="p-4 text-ash-600">{company.country}</td>
                <td className="p-4 text-ash-600">{company.size}</td>
                <td className="p-4 text-ash-600">{company.seatsUsed}</td>
                <td className="p-4">
                  <Badge variant={company.status === "active" ? "success" : "danger"}>{company.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
