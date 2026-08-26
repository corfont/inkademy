"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { companyApi, ApiError } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

const TAX_ID_TYPES = ["RUC", "NIT", "EIN", "RFC", "CUIT", "OTRO"];
const COUNTRIES: Record<string, string> = { PE: "Perú", CO: "Colombia", MX: "México", CL: "Chile", AR: "Argentina", EC: "Ecuador", ES: "España" };

interface CompanyMembershipRow {
  companyId: string;
  legalName: string;
  role: string;
}

/**
 * "Le quiero adicionar el rol de empresa... pero si me voy a editar mi
 * perfil no tengo dónde crear o poner los datos de la empresa" — antes
 * companyApi.create() (POST /companies, ya existía en la API desde que se
 * agregó el rol Empresa) no tenía NINGÚN formulario que lo llamara en todo
 * el frontend — /empresas era solo el formulario de cotización B2B
 * (QuoteForm), no la creación real de una empresa propia. Esto cierra ese
 * hueco: un alumno puede crear su propia empresa (se vuelve su
 * COMPANY_ADMIN) directamente desde su perfil.
 */
export function MyCompanySection() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyMembershipRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [legalName, setLegalName] = useState("");
  const [taxIdType, setTaxIdType] = useState("RUC");
  const [taxId, setTaxId] = useState("");
  const [country, setCountry] = useState("PE");

  useEffect(() => {
    companyApi
      .mine()
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  async function handleCreate() {
    if (!legalName.trim() || !taxId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const company = await companyApi.create({ legalName: legalName.trim(), taxIdType, taxId: taxId.trim(), country });
      router.push(`/empresa/${company.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear la empresa.");
    } finally {
      setBusy(false);
    }
  }

  if (companies === null) return null;

  return (
    <section>
      <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Mi empresa</h2>

      {companies.length > 0 ? (
        <div className="flex flex-col gap-2">
          {companies.map((c) => (
            <Card key={c.companyId}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-ash-500" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-ink-900">{c.legalName}</p>
                    <p className="text-xs text-ash-500">{c.role === "COMPANY_ADMIN" ? "Administrador" : "Colaborador"}</p>
                  </div>
                </div>
                <Link href={`/empresa/${c.companyId}`} className="text-sm font-medium text-ink-700 hover:underline">
                  Gestionar →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !creating ? (
        <div className="rounded-lg border border-paper-border bg-paper p-4">
          <p className="text-sm text-ash-600">Todavía no perteneces a ninguna empresa en Inkademy.</p>
          <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setCreating(true)}>
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Crear mi empresa
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-paper-border bg-paper p-4">
          {error && <Callout variant="danger">{error}</Callout>}
          <div>
            <Label htmlFor="company-legal-name">Razón social</Label>
            <Input id="company-legal-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Mi Empresa S.A.C." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="company-tax-id-type">Tipo de documento</Label>
              <Select id="company-tax-id-type" value={taxIdType} onChange={(e) => setTaxIdType(e.target.value)}>
                {TAX_ID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="company-tax-id">Número</Label>
              <Input id="company-tax-id" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="20123456789" />
            </div>
          </div>
          <div>
            <Label htmlFor="company-country">País</Label>
            <Select id="company-country" value={country} onChange={(e) => setCountry(e.target.value)}>
              {Object.entries(COUNTRIES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-ash-500">
            Quedarás como administrador de esta empresa — desde ahí podrás comprar cupos, invitar colaboradores y ver reportes de avance.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !legalName.trim() || !taxId.trim()} onClick={handleCreate}>
              {busy ? "Creando…" : "Crear empresa"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCreating(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
