"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Award, Download, FileDown, RefreshCw } from "lucide-react";
import { API_URL, certificateApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Callout } from "@/components/ui/Callout";
import { formatDate, localize } from "@/lib/format";

interface CertRow {
  id: string;
  code: string;
  title: string | Record<string, string>;
  holderName: string;
  issuedAt: string;
  revoked: boolean;
  pdfUrl: string | null;
  courseId: string | null;
  companyId: string | null;
  companyName: string | null;
}

type GroupBy = "none" | "course" | "company";
type SortBy = "dateDesc" | "alpha";

/**
 * Antes /admin/certificados era una tabla plana sin filtros ni forma de
 * descargar el PDF ni de agrupar por curso/empresa — el admin solo podía
 * ir a /verificar/:code (página pública de verificación, no de descarga).
 */
export function CertificatesTable({ certificates, locale }: { certificates: CertRow[]; locale: string }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortBy, setSortBy] = useState<SortBy>("dateDesc");
  const [courseFilter, setCourseFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regeneratedIds, setRegeneratedIds] = useState<Set<string>>(new Set());
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);

  // Antes era un `<a href={cert.pdfUrl}>` directo a la URL pública del
  // storage — un hipo del storage (ej. "MetadataTooLarge") le llegaba al
  // admin como XML crudo. Ahora se pide la URL firmada acá primero.
  async function handleViewPdf(certId: string) {
    setOpeningPdfId(certId);
    try {
      const { url } = await certificateApi.getDownloadUrl(certId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "No pudimos abrir el PDF.");
    } finally {
      setOpeningPdfId(null);
    }
  }

  // "Cuando pongo emitir certificado no me aparece ni una firma y debería
  // aparecer si ya se tiene configurada" — el PDF se renderiza UNA sola vez;
  // si la firma se configuró después de esa emisión, queda congelado sin
  // ella. Esto fuerza a regenerarlo con la firma/plantilla ya actualizada.
  async function handleRegenerate(certId: string) {
    setRegeneratingId(certId);
    try {
      await certificateApi.regenerate(certId);
      setRegeneratedIds((s) => new Set(s).add(certId));
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "No pudimos regenerar el PDF.");
    } finally {
      setRegeneratingId(null);
    }
  }

  const courseTitle = (c: CertRow) => (typeof c.title === "string" ? c.title : localize(c.title, locale));

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    certificates.forEach((c) => c.courseId && map.set(c.courseId, courseTitle(c)));
    return [...map.entries()];
  }, [certificates]);

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    certificates.forEach((c) => c.companyId && c.companyName && map.set(c.companyId, c.companyName));
    return [...map.entries()];
  }, [certificates]);

  const filtered = certificates.filter(
    (c) => (!courseFilter || c.courseId === courseFilter) && (!companyFilter || c.companyId === companyFilter),
  );

  const sorted = [...filtered].sort((a, b) =>
    sortBy === "alpha" ? a.holderName.localeCompare(b.holderName, "es") : new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );

  const groups: Array<{ label: string; rows: CertRow[] }> =
    groupBy === "none"
      ? [{ label: "", rows: sorted }]
      : (() => {
          const key = groupBy === "course" ? (c: CertRow) => courseTitle(c) : (c: CertRow) => c.companyName ?? "Sin empresa (compra individual)";
          const map = new Map<string, CertRow[]>();
          for (const c of sorted) {
            const k = key(c);
            map.set(k, [...(map.get(k) ?? []), c]);
          }
          return [...map.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], "es"))
            .map(([label, rows]) => ({ label, rows }));
        })();

  async function downloadAll() {
    setExporting(true);
    setExportError(null);
    try {
      const token = getClientAccessToken();
      const params = new URLSearchParams();
      if (courseFilter) params.set("courseId", courseFilter);
      if (companyFilter) params.set("companyId", companyFilter);
      const res = await fetch(`${API_URL}/admin/certificates/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("No pudimos generar el archivo .zip");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificados-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "No pudimos descargar los certificados.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {exportError && <Callout variant="danger">{exportError}</Callout>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-500">Agrupar por</label>
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="h-9 text-sm">
            <option value="none">Sin agrupar</option>
            <option value="course">Curso</option>
            <option value="company">Empresa</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-500">Ordenar por</label>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="h-9 text-sm">
            <option value="dateDesc">Fecha (más reciente)</option>
            <option value="alpha">Alfabético (titular)</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-500">Filtrar por curso</label>
          <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="h-9 text-sm">
            <option value="">Todos los cursos</option>
            {courses.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-500">Filtrar por empresa</label>
          <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="h-9 text-sm">
            <option value="">Todas las empresas</option>
            {companies.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="outline" size="sm" disabled={exporting} onClick={downloadAll} className="ml-auto gap-1.5">
          <FileDown className="h-4 w-4" aria-hidden="true" />
          {exporting ? "Generando…" : `Descargar todos (.zip)${filtered.length !== certificates.length ? ` — ${filtered.length} filtrados` : ""}`}
        </Button>
      </div>

      {groups.map((group) => (
        <div key={group.label || "all"} className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
          {group.label && (
            <p className="border-b border-paper-border bg-indigo-50/60 px-4 py-2 text-sm font-semibold text-indigo-900">{group.label}</p>
          )}
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-border text-ash-500">
              <tr>
                <th className="p-4 font-medium">Código</th>
                <th className="p-4 font-medium">Titular</th>
                <th className="p-4 font-medium">Curso</th>
                <th className="p-4 font-medium">Emitido</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {group.rows.map((cert) => (
                <tr key={cert.id} className="transition-colors hover:bg-paper-muted">
                  <td className="p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gold-100 text-gold-700">
                        <Award className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="font-mono text-xs text-ink-900">{cert.code}</span>
                    </div>
                  </td>
                  <td className="p-4 text-ash-600">{cert.holderName}</td>
                  <td className="p-4 text-ash-600">{courseTitle(cert)}</td>
                  <td className="p-4 text-ash-600">{formatDate(cert.issuedAt, locale)}</td>
                  <td className="p-4">
                    <Badge variant={cert.revoked ? "danger" : "success"}>{cert.revoked ? "Revocado" : "Vigente"}</Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Link href={`/verificar/${cert.code}`} className="text-ink-700 hover:underline">
                        Ver
                      </Link>
                      {cert.pdfUrl ? (
                        <button
                          type="button"
                          disabled={openingPdfId === cert.id}
                          onClick={() => handleViewPdf(cert.id)}
                          className="flex items-center gap-1 text-ink-700 hover:underline disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          {openingPdfId === cert.id ? "Abriendo…" : "PDF"}
                        </button>
                      ) : (
                        <span className="text-xs text-ash-400">generando…</span>
                      )}
                      <button
                        type="button"
                        disabled={regeneratingId === cert.id}
                        onClick={() => handleRegenerate(cert.id)}
                        title="Vuelve a generar el PDF — usa la firma/plantilla configurada ahora mismo"
                        className="flex items-center gap-1 text-ash-500 hover:text-ink-900 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${regeneratingId === cert.id ? "animate-spin" : ""}`} aria-hidden="true" />
                        {regeneratedIds.has(cert.id) ? "Regenerado ✓" : "Regenerar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
