"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { notificationsApi, ApiError, type NotificationSettingsDTO } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

interface Section {
  title: string;
  emailKey: keyof NotificationSettingsDTO;
  inAppKey: keyof NotificationSettingsDTO;
  description: string;
  leadDaysKey?: keyof NotificationSettingsDTO;
  leadDaysLabel?: string;
}

const SECTIONS: Section[] = [
  {
    title: "Acceso a curso por vencer",
    emailKey: "courseAccessExpiringEmail",
    inAppKey: "courseAccessExpiringInApp",
    description: "3 días y 24 horas antes de que expire el acceso de un alumno a un curso grabado.",
  },
  {
    title: "Clase en vivo próxima",
    emailKey: "liveSessionUpcomingEmail",
    inAppKey: "liveSessionUpcomingInApp",
    description: "7 días/24h antes del inicio del curso y 1h/10min antes de cada sesión en vivo.",
  },
  {
    title: "Evaluación por vencer",
    emailKey: "assessmentDueEmail",
    inAppKey: "assessmentDueInApp",
    description: "3 días y 24 horas antes de que cierre el plazo de un examen.",
  },
  {
    title: "Convenio institucional por vencer",
    emailKey: "partnershipExpiringEmail",
    inAppKey: "partnershipExpiringInApp",
    description: "Avisa a los administradores cuando el curso más próximo a vencer de un convenio se acerca a su fecha límite.",
    leadDaysKey: "partnershipExpiringLeadDays",
    leadDaysLabel: "Días de anticipación",
  },
  {
    title: "Licencia de arriendo por vencer",
    emailKey: "platformLicenseExpiringEmail",
    inAppKey: "platformLicenseExpiringInApp",
    description: "Avisa a los administradores cuando una licencia de arriendo del sistema se acerca a su vencimiento.",
    leadDaysKey: "platformLicenseExpiringLeadDays",
    leadDaysLabel: "Días de anticipación",
  },
  {
    title: "Respuesta nueva en un ticket de soporte",
    emailKey: "supportTicketUpdateEmail",
    inAppKey: "supportTicketUpdateInApp",
    description: "Cuando el equipo de soporte responde un ticket, se avisa a quien lo abrió.",
  },
  {
    title: "Sugerencia de curso sin responder",
    emailKey: "suggestionUnansweredEmail",
    inAppKey: "suggestionUnansweredInApp",
    description: "Avisa al equipo (admin/soporte) cuando una sugerencia de alumno lleva mucho tiempo sin respuesta.",
    leadDaysKey: "suggestionUnansweredAfterHours",
    leadDaysLabel: "Horas sin responder",
  },
];

export function NotificationSettingsForm({ settings }: { settings: NotificationSettingsDTO }) {
  const router = useRouter();
  const [form, setForm] = useState<NotificationSettingsDTO>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: keyof NotificationSettingsDTO) {
    setForm((f) => ({ ...f, [key]: !f[key] }));
  }

  function setNumber(key: keyof NotificationSettingsDTO, value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) setForm((f) => ({ ...f, [key]: n }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { updatedAt: _updatedAt, ...input } = form;
      const updated = await notificationsApi.updateSettings(input);
      setForm(updated);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {saved && <Callout variant="success">Configuración guardada.</Callout>}
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="flex flex-col divide-y divide-paper-border p-0">
          {SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-3 p-6">
              <div>
                <h3 className="font-medium text-ink-900">{section.title}</h3>
                <p className="mt-0.5 text-sm text-ash-500">{section.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  <input type="checkbox" checked={Boolean(form[section.emailKey])} onChange={() => toggle(section.emailKey)} />
                  Por correo
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  <input type="checkbox" checked={Boolean(form[section.inAppKey])} onChange={() => toggle(section.inAppKey)} />
                  En la plataforma
                </label>
                {section.leadDaysKey && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={section.leadDaysKey} className="mb-0 whitespace-nowrap text-sm">
                      {section.leadDaysLabel}
                    </Label>
                    <Input
                      id={section.leadDaysKey}
                      type="number"
                      min={1}
                      className="w-20"
                      value={String(form[section.leadDaysKey] ?? "")}
                      onChange={(e) => setNumber(section.leadDaysKey!, e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
