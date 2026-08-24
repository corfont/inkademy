"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { UploadCloud } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { authApi, ApiError } from "@/lib/api-client";
import { updateSessionUser } from "@/lib/auth";
import { Input, Label, Select } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

const TIMEZONES = ["America/Lima", "America/Bogota", "America/Mexico_City", "America/Santiago", "America/Argentina/Buenos_Aires", "UTC"];

export default function ProfilePage() {
  const t = useTranslations("campus.profile");
  const { user, setUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const updated = await authApi.uploadAvatar(file);
      setUser(updated);
      updateSessionUser(updated);
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "No pudimos subir tu foto.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      locale: user?.locale ?? "es",
      timezone: user?.timezone ?? "America/Lima",
      marketingConsentEmail: false,
      marketingConsentWhatsapp: false,
    },
  });

  async function onSubmit(values: any) {
    setSaved(false);
    setSaveError(false);
    try {
      const updated = await authApi.completeProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        locale: values.locale,
        timezone: values.timezone,
        marketingConsentEmail: values.marketingConsentEmail,
        marketingConsentWhatsapp: values.marketingConsentWhatsapp,
      });
      setUser(updated);
      updateSessionUser(updated);
      setSaved(true);
    } catch {
      // Si la API no responde, no fingimos que se guardó — antes esto
      // actualizaba el estado local igual y mostraba "Guardado" aunque
      // nada se hubiera persistido de verdad.
      setSaveError(true);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-8">
        {saved && <Callout variant="success">{t("saved")}</Callout>}
        {saveError && <Callout variant="danger">No pudimos guardar tus cambios. Intenta de nuevo.</Callout>}

        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Foto de perfil</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full bg-ink-100 text-lg font-semibold text-ink-700">
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{[user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase()}</span>
              )}
            </div>
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700 hover:underline">
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                {uploadingAvatar ? "Subiendo…" : "Cambiar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
                />
              </label>
              {avatarError && <p className="mt-1 text-xs text-danger">{avatarError}</p>}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("personalData")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">Nombres</Label>
              <Input id="firstName" {...register("firstName")} />
            </div>
            <div>
              <Label htmlFor="lastName">Apellidos</Label>
              <Input id="lastName" {...register("lastName")} />
            </div>
          </div>
          <div className="mt-4">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("preferences")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="locale">{t("language")}</Label>
              <Select id="locale" {...register("locale")}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="timezone">{t("timezone")}</Label>
              <Select id="timezone" {...register("timezone")}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("communication")}</h2>
          <div className="flex flex-col gap-3">
            <Checkbox id="marketingConsentEmail" label={t("emailConsent")} {...register("marketingConsentEmail")} />
            <Checkbox id="marketingConsentWhatsapp" label={t("whatsappConsent")} {...register("marketingConsentWhatsapp")} />
          </div>
        </section>

        <Button type="submit" size="lg" className="self-start" disabled={isSubmitting}>
          {isSubmitting ? "…" : "Guardar"}
        </Button>
      </form>
    </div>
  );
}
