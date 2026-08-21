"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { authApi } from "@/lib/api-client";
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
    try {
      const updated = await authApi.completeProfile({
        marketingConsentEmail: values.marketingConsentEmail,
        marketingConsentWhatsapp: values.marketingConsentWhatsapp,
      });
      setUser(updated);
      updateSessionUser(updated);
    } catch {
      if (user) {
        const merged = { ...user, locale: values.locale, timezone: values.timezone };
        setUser(merged);
        updateSessionUser(merged);
      }
    } finally {
      setSaved(true);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-8">
        {saved && <Callout variant="success">{t("saved")}</Callout>}

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
