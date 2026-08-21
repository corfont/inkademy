"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeProfileSchema, type CompleteProfileInput } from "@inkademy/shared";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { authApi } from "@/lib/api-client";
import { updateSessionUser } from "@/lib/auth";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { MOCK_AREAS } from "@/lib/mock-data";

const COUNTRIES = [
  { code: "PE", label: "Perú" },
  { code: "CO", label: "Colombia" },
  { code: "MX", label: "México" },
  { code: "CL", label: "Chile" },
  { code: "AR", label: "Argentina" },
  { code: "EC", label: "Ecuador" },
  { code: "US", label: "Estados Unidos" },
];

export default function CompleteProfilePage() {
  const t = useTranslations("auth.completeProfile");
  const { user, setUser } = useAuth();
  const router = useRouter();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
  });

  async function onSubmit(values: CompleteProfileInput) {
    try {
      const updated = await authApi.completeProfile(values);
      setUser(updated);
      updateSessionUser(updated);
    } catch {
      // Si la API no responde, avanzamos igual con los datos locales para no bloquear al usuario.
      if (user) setUser({ ...user, profileCompletedAt: new Date().toISOString() });
    } finally {
      router.push("/campus");
    }
  }

  return (
    <Card>
      <CardContent className="p-8">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ash-600">{t("subtitle")}</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="documentType">{t("documentType")}</Label>
              <Select id="documentType" {...register("documentType")}>
                <option value="DNI">DNI</option>
                <option value="CE">Carné de extranjería</option>
                <option value="PASSPORT">Pasaporte</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="documentNumber">{t("documentNumber")}</Label>
              <Input id="documentNumber" {...register("documentNumber")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="country">{t("country")}</Label>
              <Select id="country" {...register("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="city">{t("city")}</Label>
              <Input id="city" {...register("city")} />
            </div>
          </div>

          <div>
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input id="phone" type="tel" {...register("phone")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="jobTitle">{t("jobTitle")}</Label>
              <Input id="jobTitle" {...register("jobTitle")} />
            </div>
            <div>
              <Label htmlFor="sector">{t("sector")}</Label>
              <Input id="sector" {...register("sector")} />
            </div>
          </div>

          <div>
            <Label htmlFor="experienceLevel">{t("experienceLevel")}</Label>
            <Select id="experienceLevel" {...register("experienceLevel")}>
              <option value="ENTRY">{t("experienceLevels.ENTRY")}</option>
              <option value="MID">{t("experienceLevels.MID")}</option>
              <option value="SENIOR">{t("experienceLevels.SENIOR")}</option>
              <option value="EXECUTIVE">{t("experienceLevels.EXECUTIVE")}</option>
            </Select>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ash-700">{t("interests")}</legend>
            <div className="flex flex-wrap gap-3">
              {MOCK_AREAS.map((area) => (
                <label key={area.id} className="flex items-center gap-1.5 text-sm text-ash-600">
                  <input type="checkbox" value={area.slug} {...register("interests")} />
                  {area.name.es}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-2 flex gap-3">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "…" : t("submit")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/campus")}>
              {t("skip")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
