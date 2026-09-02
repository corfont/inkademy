"use client";

import { Input, Label, Select } from "@/components/ui/Input";
import type { EmailAudienceFilter } from "@/lib/api-client";

/**
 * "También debería de poderse crear listas de correo... y poderlas
 * reutilizar" — el bloque de 9 filtros de audiencia vivía SOLO dentro de
 * `EmailCampaignManager.tsx` (`CampaignForm`), sin forma de reusarlo desde
 * ningún otro lado. Se extrae acá para que tanto una campaña como una
 * lista de correo guardada (`MailingListManager.tsx`) usen exactamente el
 * mismo formulario y la misma conversión ida/vuelta hacia el filtro real
 * que consume el backend (`emailAudienceFilterSchema`).
 *
 * El estado del formulario NO es el filtro final (`EmailAudienceFilter`)
 * — algunos campos se editan como texto libre separado por comas
 * (interests/countries) mientras se tipea, y solo se convierten a array al
 * guardar. `filterToFormState`/`formStateToFilter` son esa conversión.
 */
export interface AudienceFilterFormState {
  interests: string;
  companyId: string;
  inactiveDays: string;
  areaIds: string[];
  courseIds: string[];
  enrollmentStatus: string;
  globalRole: string;
  countries: string;
  excludeRecentPurchaseDays: string;
}

export const EMPTY_AUDIENCE_FILTER_FORM_STATE: AudienceFilterFormState = {
  interests: "",
  companyId: "",
  inactiveDays: "",
  areaIds: [],
  courseIds: [],
  enrollmentStatus: "ANY",
  globalRole: "",
  countries: "",
  excludeRecentPurchaseDays: "",
};

export function filterToFormState(filter: EmailAudienceFilter | null | undefined): AudienceFilterFormState {
  const f = (filter ?? {}) as Record<string, unknown>;
  return {
    interests: ((f.interests as string[]) ?? []).join(", "),
    companyId: (f.companyId as string) ?? "",
    inactiveDays: f.inactiveDays != null ? String(f.inactiveDays) : "",
    areaIds: (f.areaIds as string[]) ?? [],
    courseIds: (f.courseIds as string[]) ?? [],
    enrollmentStatus: (f.enrollmentStatus as string) ?? "ANY",
    globalRole: (f.globalRole as string) ?? "",
    countries: ((f.countries as string[]) ?? []).join(", "),
    excludeRecentPurchaseDays: f.excludeRecentPurchaseDays != null ? String(f.excludeRecentPurchaseDays) : "",
  };
}

export function formStateToFilter(state: AudienceFilterFormState): EmailAudienceFilter | null {
  const filter: Record<string, unknown> = {};
  if (state.interests.trim()) filter.interests = state.interests.split(",").map((s) => s.trim()).filter(Boolean);
  if (state.areaIds.length) filter.areaIds = state.areaIds;
  if (state.courseIds.length) filter.courseIds = state.courseIds;
  if (state.companyId) filter.companyId = state.companyId;
  if (state.inactiveDays) filter.inactiveDays = Number(state.inactiveDays);
  if (state.enrollmentStatus !== "ANY") filter.enrollmentStatus = state.enrollmentStatus;
  if (state.countries.trim()) filter.countries = state.countries.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (state.globalRole) filter.globalRole = state.globalRole;
  if (state.excludeRecentPurchaseDays) filter.excludeRecentPurchaseDays = Number(state.excludeRecentPurchaseDays);
  return Object.keys(filter).length ? (filter as EmailAudienceFilter) : null;
}

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  ANY: "Cualquiera",
  HAS_ACTIVE: "Llevando un curso o más ahora",
  COMPLETED_NO_ACTIVE: "Ya terminó todo, nada pendiente (upsell)",
  NONE: "Nunca se ha matriculado (primera compra)",
};

export function AudienceFilterFields({
  value,
  onChange,
  areas,
  companies,
  courses,
  idPrefix = "audience",
}: {
  value: AudienceFilterFormState;
  onChange: (next: AudienceFilterFormState) => void;
  areas: any[];
  companies: any[];
  courses: any[];
  idPrefix?: string;
}) {
  function set<K extends keyof AudienceFilterFormState>(key: K, v: AudienceFilterFormState[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-interests`}>Por interés (separado por comas)</Label>
        <Input id={`${idPrefix}-interests`} value={value.interests} onChange={(e) => set("interests", e.target.value)} placeholder="marketing, finanzas" />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-company`}>Por empresa</Label>
        <Select id={`${idPrefix}-company`} value={value.companyId} onChange={(e) => set("companyId", e.target.value)}>
          <option value="">Todas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legalName}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-inactive`}>Inactivos hace más de (días)</Label>
        <Input id={`${idPrefix}-inactive`} type="number" min="1" value={value.inactiveDays} onChange={(e) => set("inactiveDays", e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-areas`}>Por área (matriculados en)</Label>
        <select
          id={`${idPrefix}-areas`}
          multiple
          className="h-24 w-full rounded-md border border-paper-border bg-paper px-2 py-1 text-sm"
          value={value.areaIds}
          onChange={(e) => set("areaIds", Array.from(e.target.selectedOptions, (o) => o.value))}
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name?.es ?? a.slug}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-courses`}>Por curso puntual (matriculados en)</Label>
        <select
          id={`${idPrefix}-courses`}
          multiple
          className="h-24 w-full rounded-md border border-paper-border bg-paper px-2 py-1 text-sm"
          value={value.courseIds}
          onChange={(e) => set("courseIds", Array.from(e.target.selectedOptions, (o) => o.value))}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title?.es ?? c.slug}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-enrollment-status`}>Estado de matrícula</Label>
        <Select id={`${idPrefix}-enrollment-status`} value={value.enrollmentStatus} onChange={(e) => set("enrollmentStatus", e.target.value)}>
          {Object.entries(ENROLLMENT_STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-role`}>Rol</Label>
        <Select id={`${idPrefix}-role`} value={value.globalRole} onChange={(e) => set("globalRole", e.target.value)}>
          <option value="">Cualquiera</option>
          <option value="STUDENT">Alumno</option>
          <option value="TEACHER">Docente</option>
          <option value="SUPPORT">Soporte</option>
          <option value="ADMIN">Administrador</option>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-countries`}>Por país (código ISO, separado por comas)</Label>
        <Input id={`${idPrefix}-countries`} value={value.countries} onChange={(e) => set("countries", e.target.value)} placeholder="PE, CO, MX" />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-exclude-recent`}>Excluir si compró en los últimos (días)</Label>
        <Input
          id={`${idPrefix}-exclude-recent`}
          type="number"
          min="1"
          value={value.excludeRecentPurchaseDays}
          onChange={(e) => set("excludeRecentPurchaseDays", e.target.value)}
          placeholder="Ej. 15 — no molestar a quien acaba de comprar"
        />
      </div>
    </div>
  );
}
