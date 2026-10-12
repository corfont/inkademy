"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { complaintSchema, COMPLAINT_DOC_TYPES, COMPLAINT_SERVICES, type ComplaintInput } from "@inkademy/shared";
import { complaintsApi, ApiError } from "@/lib/api-client";
import { Input, Label, FieldError, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

const KINDS = [
  { value: "RECLAMO", title: "Reclamo", hint: "Disconformidad con el servicio contratado." },
  { value: "QUEJA", title: "Queja", hint: "Disconformidad con la atención recibida." },
] as const;

/** Formulario del Libro de Reclamaciones: tres secciones (consumidor, tipo, detalle) como el de inkapitales.com. */
export function ComplaintForm() {
  const [done, setDone] = useState<{ folio: string; dueAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ComplaintInput>({
    resolver: zodResolver(complaintSchema),
    defaultValues: { kind: "RECLAMO", docType: "DNI" },
  });
  const kind = watch("kind");

  async function onSubmit(values: ComplaintInput) {
    setError(null);
    try {
      setDone(await complaintsApi.create(values));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos registrar tu reclamo. Intenta de nuevo en unos minutos.");
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-paper-border bg-paper p-8 shadow-card">
        <Callout variant="success">Registramos tu {kind === "QUEJA" ? "queja" : "reclamo"}.</Callout>
        <p className="mt-4 text-sm text-ash-700">
          Tu folio es <strong className="font-mono text-ink-900">{done.folio}</strong>. Te enviamos la constancia al correo que indicaste. Tenemos 15 días hábiles para responder (hasta el{" "}
          {new Date(done.dueAt).toLocaleDateString("es-PE", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}).
        </p>
        <p className="mt-2 text-xs text-ash-600">Guarda tu folio: es tu comprobante. Si no estás conforme con la respuesta puedes acudir a INDECOPI (0800-4-4040).</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-8 rounded-lg border border-paper-border bg-paper p-6 shadow-card sm:p-8">
      {error && <Callout variant="danger">{error}</Callout>}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-700">Sección 1 — Datos del consumidor</legend>
        <div>
          <Label htmlFor="fullName">Nombres y apellidos *</Label>
          <Input id="fullName" autoComplete="name" error={errors.fullName?.message} {...register("fullName")} />
          <FieldError>{errors.fullName?.message}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <div>
            <Label htmlFor="docType">Tipo de documento *</Label>
            <Select id="docType" {...register("docType")}>
              {COMPLAINT_DOC_TYPES.map((t) => (
                <option key={t} value={t}>{t === "PASAPORTE" ? "Pasaporte" : t}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="docNumber">N° de documento *</Label>
            <Input id="docNumber" error={errors.docNumber?.message} {...register("docNumber")} />
            <FieldError>{errors.docNumber?.message}</FieldError>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="phone">Teléfono *</Label>
            <Input id="phone" type="tel" autoComplete="tel" error={errors.phone?.message} {...register("phone")} />
            <FieldError>{errors.phone?.message}</FieldError>
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-700">Sección 2 — Tipo</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((k) => (
            <label key={k.value} className={`flex cursor-pointer flex-col gap-1 rounded-md border p-4 ${kind === k.value ? "border-indigo-600 bg-indigo-50" : "border-paper-border"}`}>
              <span className="flex items-center gap-2 font-semibold text-ink-900">
                <input type="radio" value={k.value} {...register("kind")} /> {k.title}
              </span>
              <span className="text-xs text-ash-600">{k.hint}</span>
            </label>
          ))}
        </div>
        <div>
          <Label htmlFor="service">Servicio objeto del reclamo *</Label>
          <Select id="service" defaultValue="" {...register("service")}>
            <option value="" disabled>Seleccione…</option>
            {COMPLAINT_SERVICES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <FieldError>{errors.service ? "Selecciona el servicio" : undefined}</FieldError>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-700">Sección 3 — Detalle</legend>
        <div>
          <Label htmlFor="description">Descripción *</Label>
          <Textarea id="description" rows={5} error={errors.description?.message} {...register("description")} />
          <FieldError>{errors.description?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="request">Pedido del consumidor *</Label>
          <Textarea id="request" rows={3} error={errors.request?.message} {...register("request")} />
          <FieldError>{errors.request?.message}</FieldError>
        </div>
      </fieldset>

      {/* Campo trampa para bots: fuera de pantalla y sin tabulación. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No llenar
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>

      <p className="text-xs text-ash-600">
        Inkademy tiene 15 días hábiles para responder (Ley 29571). Recibirás la constancia con tu folio en el correo indicado. Tus datos están protegidos según la Ley N° 29733.
      </p>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Registrando…" : "Registrar reclamo o queja"}
      </Button>
    </form>
  );
}
