"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { UploadCloud } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { authApi, catalogApi, ApiError, type FullProfileDTO } from "@/lib/api-client";
import { updateSessionUser } from "@/lib/auth";
import { MOCK_AREAS } from "@/lib/mock-data";
import { Input, Label, Select } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

const TIMEZONES = ["America/Lima", "America/Bogota", "America/Mexico_City", "America/Santiago", "America/Argentina/Buenos_Aires", "UTC"];
const COUNTRIES = [
  { code: "PE", label: "Perú" },
  { code: "CO", label: "Colombia" },
  { code: "MX", label: "México" },
  { code: "CL", label: "Chile" },
  { code: "AR", label: "Argentina" },
  { code: "EC", label: "Ecuador" },
  { code: "US", label: "Estados Unidos" },
];

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  locale: string;
  timezone: string;
  documentType: string;
  documentNumber: string;
  country: string;
  city: string;
  address: string;
  birthDate: string;
  phone: string;
  jobTitle: string;
  companyFreeText: string;
  sector: string;
  experienceLevel: string;
  interests: string[];
  linkedin: string;
  instagram: string;
  facebook: string;
  twitter: string;
  tiktok: string;
  marketingConsentEmail: boolean;
  marketingConsentWhatsapp: boolean;
}

function toFormValues(p: FullProfileDTO | null, fallbackFirstName: string, fallbackLastName: string, fallbackLocale: string, fallbackTimezone: string): ProfileFormValues {
  return {
    firstName: p?.firstName ?? fallbackFirstName,
    lastName: p?.lastName ?? fallbackLastName,
    locale: p?.locale ?? fallbackLocale,
    timezone: p?.timezone ?? fallbackTimezone,
    documentType: p?.documentType ?? "DNI",
    documentNumber: p?.documentNumber ?? "",
    country: p?.country ?? "PE",
    city: p?.city ?? "",
    address: p?.address ?? "",
    birthDate: p?.birthDate ? p.birthDate.slice(0, 10) : "",
    phone: p?.phone ?? "",
    jobTitle: p?.jobTitle ?? "",
    companyFreeText: p?.companyFreeText ?? "",
    sector: p?.sector ?? "",
    experienceLevel: p?.experienceLevel ?? "",
    interests: p?.interests ?? [],
    linkedin: p?.socialLinks?.linkedin ?? "",
    instagram: p?.socialLinks?.instagram ?? "",
    facebook: p?.socialLinks?.facebook ?? "",
    twitter: p?.socialLinks?.twitter ?? "",
    tiktok: p?.socialLinks?.tiktok ?? "",
    marketingConsentEmail: p?.marketingConsentEmail ?? false,
    marketingConsentWhatsapp: p?.marketingConsentWhatsapp ?? false,
  };
}

export default function ProfilePage() {
  const t = useTranslations("campus.profile");
  const tp = useTranslations("auth.completeProfile");
  const { user, setUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [areas, setAreas] = useState(MOCK_AREAS);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ProfileFormValues>({
    defaultValues: toFormValues(null, user?.firstName ?? "", user?.lastName ?? "", user?.locale ?? "es", user?.timezone ?? "America/Lima"),
  });

  useEffect(() => {
    catalogApi.areas().then(setAreas).catch(() => {});
    authApi
      .getFullProfile()
      .then((profile) => reset(toFormValues(profile, profile.firstName, profile.lastName, profile.locale, profile.timezone)))
      .catch(() => {
        // Sin conexión: se queda con los defaultValues (datos livianos de la sesión) — mejor que una pantalla vacía.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function onSubmit(values: ProfileFormValues) {
    setSaved(false);
    setSaveError(false);
    try {
      const updated = await authApi.completeProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        locale: values.locale,
        timezone: values.timezone,
        documentType: values.documentType,
        documentNumber: values.documentNumber || undefined,
        country: values.country || undefined,
        city: values.city || undefined,
        address: values.address || undefined,
        birthDate: values.birthDate || undefined,
        phone: values.phone || undefined,
        jobTitle: values.jobTitle || undefined,
        companyFreeText: values.companyFreeText || undefined,
        sector: values.sector || undefined,
        experienceLevel: values.experienceLevel || undefined,
        interests: values.interests,
        socialLinks: {
          linkedin: values.linkedin || undefined,
          instagram: values.instagram || undefined,
          facebook: values.facebook || undefined,
          twitter: values.twitter || undefined,
          tiktok: values.tiktok || undefined,
        },
        marketingConsentEmail: values.marketingConsentEmail,
        marketingConsentWhatsapp: values.marketingConsentWhatsapp,
      });
      setUser(updated);
      updateSessionUser(updated);
      setSaved(true);
    } catch {
      // Si la API no responde, no fingimos que se guardó.
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="documentType">{tp("documentType")}</Label>
              <Select id="documentType" {...register("documentType")}>
                <option value="DNI">DNI</option>
                <option value="CE">Carné de extranjería</option>
                <option value="PASSPORT">Pasaporte</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="documentNumber">{tp("documentNumber")}</Label>
              <Input id="documentNumber" {...register("documentNumber")} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">{tp("phone")}</Label>
              <Input id="phone" type="tel" {...register("phone")} />
            </div>
            <div>
              <Label htmlFor="birthDate">{t("birthDate")}</Label>
              <Input id="birthDate" type="date" {...register("birthDate")} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="country">{tp("country")}</Label>
              <Select id="country" {...register("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="city">{tp("city")}</Label>
              <Input id="city" {...register("city")} />
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="address">{t("address")}</Label>
            <Input id="address" {...register("address")} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("workData")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="jobTitle">{tp("jobTitle")}</Label>
              <Input id="jobTitle" {...register("jobTitle")} />
            </div>
            <div>
              <Label htmlFor="companyFreeText">{t("companyFreeText")}</Label>
              <Input id="companyFreeText" {...register("companyFreeText")} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sector">{tp("sector")}</Label>
              <Input id="sector" {...register("sector")} />
            </div>
            <div>
              <Label htmlFor="experienceLevel">{tp("experienceLevel")}</Label>
              <Select id="experienceLevel" {...register("experienceLevel")}>
                <option value="">—</option>
                <option value="ENTRY">{tp("experienceLevels.ENTRY")}</option>
                <option value="MID">{tp("experienceLevels.MID")}</option>
                <option value="SENIOR">{tp("experienceLevels.SENIOR")}</option>
                <option value="EXECUTIVE">{tp("experienceLevels.EXECUTIVE")}</option>
              </Select>
            </div>
          </div>
          <fieldset className="mt-4">
            <legend className="mb-1.5 text-sm font-medium text-ash-700">{tp("interests")}</legend>
            <div className="flex flex-wrap gap-3">
              {areas.map((area) => (
                <label key={area.id} className="flex items-center gap-1.5 text-sm text-ash-600">
                  <input type="checkbox" value={area.slug} {...register("interests")} />
                  {area.name.es}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("socialLinks")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input id="linkedin" placeholder="https://linkedin.com/in/…" {...register("linkedin")} />
            </div>
            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <Input id="instagram" placeholder="https://instagram.com/…" {...register("instagram")} />
            </div>
            <div>
              <Label htmlFor="facebook">Facebook</Label>
              <Input id="facebook" placeholder="https://facebook.com/…" {...register("facebook")} />
            </div>
            <div>
              <Label htmlFor="twitter">Twitter/X</Label>
              <Input id="twitter" placeholder="https://x.com/…" {...register("twitter")} />
            </div>
            <div>
              <Label htmlFor="tiktok">TikTok</Label>
              <Input id="tiktok" placeholder="https://tiktok.com/@…" {...register("tiktok")} />
            </div>
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
