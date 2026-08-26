"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError, type EmailCampaignDTO } from "@/lib/api-client";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const GOAL_LABEL: Record<string, string> = {
  RELATED_COURSES: "Cursos relacionados a lo que ya estudia",
  NEW_COURSES: "Cursos nuevos del catálogo",
  DISCOUNTED_COURSES: "Cursos con descuento",
  BY_INTEREST: "Según su área de interés",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline" | "danger"> = {
  DRAFT: "outline",
  SCHEDULED: "warning",
  SENT: "success",
  CANCELLED: "danger",
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Borrador", SCHEDULED: "Programada", SENT: "Enviada", CANCELLED: "Cancelada" };

/**
 * "Un módulo donde enviar correos a nuestros clientes... programado
 * automático con IA (redactando sobre cursos relacionados, nuevos, con
 * descuento, o por área de interés), o que uno redacte y parametrice para
 * mandar correos masivos." El envío real (y el borrador con IA) lo hace un
 * sweep de apps/worker cada 2 minutos — "enviar ahora" solo adelanta la
 * fecha programada a ahora mismo, ver AdminService.sendEmailCampaignNow.
 */
export function EmailCampaignManager({
  campaigns,
  areas,
  companies,
  courses,
}: {
  campaigns: EmailCampaignDTO[];
  areas: any[];
  companies: any[];
  courses: any[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  const drafts = campaigns.filter((c) => c.status === "DRAFT" || c.status === "SCHEDULED");
  const history = campaigns.filter((c) => c.status === "SENT" || c.status === "CANCELLED");

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <NewCampaignForm areas={areas} companies={companies} courses={courses} busy={busy} run={run} />

      {drafts.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Borradores y programadas</h2>
          {drafts.map((c) => <CampaignCard key={c.id} campaign={c} busy={busy} run={run} />)}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Historial</h2>
          {history.map((c) => <CampaignCard key={c.id} campaign={c} busy={busy} run={run} readOnly />)}
        </div>
      )}

      {campaigns.length === 0 && <p className="text-sm text-ash-500">Todavía no hay ninguna campaña creada.</p>}
    </div>
  );
}

function CampaignCard({ campaign: c, busy, run, readOnly }: { campaign: EmailCampaignDTO; busy: boolean; run: (a: () => Promise<unknown>) => Promise<void>; readOnly?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-ink-900">{c.name}</h3>
            <p className="text-xs text-ash-500">
              {c.mode === "MANUAL" ? "Manual" : `Automática con IA — ${GOAL_LABEL[c.goal ?? ""] ?? c.goal}`}
              {c.recurrence !== "ONCE" && ` · repite ${c.recurrence === "WEEKLY" ? "cada semana" : "cada mes"}`}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
        </div>
        <p className="text-xs text-ash-500">
          {c.status === "SENT" && c.sentAt && `Enviada el ${new Date(c.sentAt).toLocaleString("es-PE")} a ${c.recipientCount} destinatario(s).`}
          {c.status === "SCHEDULED" && c.scheduledAt && `Programada para ${new Date(c.scheduledAt).toLocaleString("es-PE")}.`}
          {c.status === "DRAFT" && "Sin fecha de envío — sigue en borrador."}
        </p>
        {!readOnly && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={() => run(() => adminApi.sendEmailCampaignNow(c.id))}>
              Enviar ahora
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-bg"
              disabled={busy}
              onClick={() => confirm(`¿Eliminar la campaña "${c.name}"?`) && run(() => adminApi.deleteEmailCampaign(c.id))}
            >
              Eliminar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  ANY: "Cualquiera",
  HAS_ACTIVE: "Llevando un curso o más ahora",
  COMPLETED_NO_ACTIVE: "Ya terminó todo, nada pendiente (upsell)",
  NONE: "Nunca se ha matriculado (primera compra)",
};

function NewCampaignForm({
  areas,
  companies,
  courses,
  busy,
  run,
}: {
  areas: any[];
  companies: any[];
  courses: any[];
  busy: boolean;
  run: (a: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"MANUAL" | "AUTOMATIC_AI">("MANUAL");
  const [goal, setGoal] = useState("NEW_COURSES");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [interests, setInterests] = useState("");
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [enrollmentStatus, setEnrollmentStatus] = useState("ANY");
  const [countries, setCountries] = useState("");
  const [globalRole, setGlobalRole] = useState("");
  const [excludeRecentPurchaseDays, setExcludeRecentPurchaseDays] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrence, setRecurrence] = useState<"ONCE" | "WEEKLY" | "MONTHLY">("ONCE");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  function buildAudienceFilter() {
    const filter: Record<string, unknown> = {};
    if (interests.trim()) filter.interests = interests.split(",").map((s) => s.trim()).filter(Boolean);
    if (areaIds.length) filter.areaIds = areaIds;
    if (courseIds.length) filter.courseIds = courseIds;
    if (companyId) filter.companyId = companyId;
    if (inactiveDays) filter.inactiveDays = Number(inactiveDays);
    if (enrollmentStatus !== "ANY") filter.enrollmentStatus = enrollmentStatus;
    if (countries.trim()) filter.countries = countries.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (globalRole) filter.globalRole = globalRole;
    if (excludeRecentPurchaseDays) filter.excludeRecentPurchaseDays = Number(excludeRecentPurchaseDays);
    return Object.keys(filter).length ? filter : null;
  }

  async function handlePreview() {
    setPreviewBusy(true);
    try {
      const { count } = await adminApi.previewEmailAudience(buildAudienceFilter() ?? {});
      setPreviewCount(count);
    } catch {
      setPreviewCount(null);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleCreate(sendNow: boolean) {
    await run(async () => {
      const created = await adminApi.createEmailCampaign({
        name,
        mode,
        goal: mode === "AUTOMATIC_AI" ? goal : undefined,
        subject: mode === "MANUAL" ? subject : undefined,
        bodyHtml: mode === "MANUAL" ? bodyHtml : undefined,
        audienceFilter: buildAudienceFilter(),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : sendNow ? new Date().toISOString() : null,
        recurrence,
      });
      if (sendNow && !scheduledAt) await adminApi.sendEmailCampaignNow(created.id);
    });
    setName("");
    setSubject("");
    setBodyHtml("");
    setInterests("");
    setAreaIds([]);
    setCourseIds([]);
    setCompanyId("");
    setInactiveDays("");
    setEnrollmentStatus("ANY");
    setCountries("");
    setGlobalRole("");
    setExcludeRecentPurchaseDays("");
    setScheduledAt("");
    setPreviewCount(null);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Nueva campaña</h2>

        <div>
          <Label htmlFor="camp-name">Nombre interno</Label>
          <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Descuentos de julio" />
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} /> Manual (yo redacto)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "AUTOMATIC_AI"} onChange={() => setMode("AUTOMATIC_AI")} /> Automática con IA
          </label>
        </div>

        {mode === "MANUAL" ? (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="camp-subject">Asunto</Label>
              <Input id="camp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="camp-body">Contenido (HTML)</Label>
              <Textarea id="camp-body" rows={6} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="<p>Hola…</p>" />
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="camp-goal">La IA debe redactar sobre…</Label>
            <Select id="camp-goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
              {Object.entries(GOAL_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ash-500">
              Requiere el asistente de IA activado en /admin/asistente-ia. Si el destinatario tiene varios intereses distintos entre sí, se agrupan
              por interés principal para redactar un correo por grupo (no 100% personalizado por persona).
            </p>
          </div>
        )}

        <div className="rounded-md bg-paper-muted p-3">
          <p className="mb-2 text-xs font-medium text-ash-600">Audiencia (deja todo vacío para "todos los que aceptaron correos de marketing")</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="camp-interests">Por interés (separado por comas)</Label>
              <Input id="camp-interests" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="marketing, finanzas" />
            </div>
            <div>
              <Label htmlFor="camp-company">Por empresa</Label>
              <Select id="camp-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">Todas</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.legalName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="camp-inactive">Inactivos hace más de (días)</Label>
              <Input id="camp-inactive" type="number" min="1" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="camp-areas">Por área (matriculados en)</Label>
              <select
                id="camp-areas"
                multiple
                className="h-24 w-full rounded-md border border-paper-border bg-paper px-2 py-1 text-sm"
                value={areaIds}
                onChange={(e) => setAreaIds(Array.from(e.target.selectedOptions, (o) => o.value))}
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name?.es ?? a.slug}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="camp-courses">Por curso puntual (matriculados en)</Label>
              <select
                id="camp-courses"
                multiple
                className="h-24 w-full rounded-md border border-paper-border bg-paper px-2 py-1 text-sm"
                value={courseIds}
                onChange={(e) => setCourseIds(Array.from(e.target.selectedOptions, (o) => o.value))}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title?.es ?? c.slug}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="camp-enrollment-status">Estado de matrícula</Label>
              <Select id="camp-enrollment-status" value={enrollmentStatus} onChange={(e) => setEnrollmentStatus(e.target.value)}>
                {Object.entries(ENROLLMENT_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="camp-role">Rol</Label>
              <Select id="camp-role" value={globalRole} onChange={(e) => setGlobalRole(e.target.value)}>
                <option value="">Cualquiera</option>
                <option value="STUDENT">Alumno</option>
                <option value="TEACHER">Docente</option>
                <option value="SUPPORT">Soporte</option>
                <option value="ADMIN">Administrador</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="camp-countries">Por país (código ISO, separado por comas)</Label>
              <Input id="camp-countries" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="PE, CO, MX" />
            </div>
            <div>
              <Label htmlFor="camp-exclude-recent">Excluir si compró en los últimos (días)</Label>
              <Input
                id="camp-exclude-recent"
                type="number"
                min="1"
                value={excludeRecentPurchaseDays}
                onChange={(e) => setExcludeRecentPurchaseDays(e.target.value)}
                placeholder="Ej. 15 — no molestar a quien acaba de comprar"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={previewBusy} onClick={handlePreview}>
              {previewBusy ? "Calculando…" : "Ver a cuántos llega"}
            </Button>
            {previewCount !== null && <span className="text-xs text-ash-600">{previewCount} destinatario(s)</span>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="camp-schedule">Programar para (opcional — vacío = borrador)</Label>
            <Input id="camp-schedule" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="camp-recurrence">Repetir</Label>
            <Select id="camp-recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value as never)}>
              <option value="ONCE">Una sola vez</option>
              <option value="WEEKLY">Cada semana</option>
              <option value="MONTHLY">Cada mes</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !name.trim()} onClick={() => handleCreate(false)}>
            {scheduledAt ? "Programar" : "Guardar como borrador"}
          </Button>
          <Button variant="outline" disabled={busy || !name.trim()} onClick={() => handleCreate(true)}>
            Enviar ahora
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
