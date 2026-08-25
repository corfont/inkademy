"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeProfileSchema, type CompleteProfileInput } from "@inkademy/shared";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { authApi, catalogApi } from "@/lib/api-client";
import { updateSessionUser, belongsToOtherRoleArea } from "@/lib/auth";
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
  return (
    <Suspense fallback={null}>
      <CompleteProfileForm />
    </Suspense>
  );
}

function CompleteProfileForm() {
  const t = useTranslations("auth.completeProfile");
  const { user, setUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Preserva a dónde iba el visitante antes de que se le pidiera completar el
  // perfil (p.ej. volver a /checkout?courseId=... tras iniciar sesión desde ahí).
  // Antes el valor por defecto (sin "next") era siempre "/campus" sin
  // importar el rol — un administrador o docente recién creado que
  // completaba su perfil terminaba viendo el campus de alumno, aunque su
  // globalRole en la base de datos fuera el correcto (ADMIN/TEACHER). Mismo
  // criterio que usa /login para decidir el "home" de cada rol.
  const roleHome = user?.globalRole === "ADMIN" || user?.globalRole === "SUPPORT" ? "/admin" : user?.globalRole === "TEACHER" ? "/docente" : "/campus";
  // "next" se respeta salvo que apunte al área protegida de OTRO rol (p.ej.
  // ?next=/campus para un admin recién creado) — antes un admin/soporte/
  // docente que llegaba con ese "next" terminaba viendo el campus de
  // alumno pese a tener el rol correcto en la base de datos. Un `next`
  // fuera de las tres áreas (p.ej. volver a /checkout) se respeta siempre.
  const requestedNext = searchParams.get("next");
  const next = requestedNext && !belongsToOtherRoleArea(requestedNext, roleHome) ? requestedNext : roleHome;
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
  });
  // Antes esta lista era siempre MOCK_AREAS, sin importar qué áreas hubiera
  // realmente en el catálogo — si se agregaba/renombraba un área real, este
  // formulario seguía mostrando las de ejemplo. MOCK_AREAS queda solo como
  // valor inicial mientras carga, para no mostrar la lista vacía.
  const [areas, setAreas] = useState(MOCK_AREAS);
  useEffect(() => {
    catalogApi.areas().then(setAreas).catch(() => {});
  }, []);

  async function onSubmit(values: CompleteProfileInput) {
    try {
      const updated = await authApi.completeProfile(values);
      setUser(updated);
      updateSessionUser(updated);
    } catch {
      // Si la API no responde, avanzamos igual con los datos locales para no bloquear al usuario.
      if (user) setUser({ ...user, profileCompletedAt: new Date().toISOString() });
    } finally {
      router.push(next);
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
              <Label htmlFor="companyFreeText">{t("companyFreeText")}</Label>
              <Input id="companyFreeText" {...register("companyFreeText")} />
            </div>
          </div>

          <div>
            <Label htmlFor="sector">{t("sector")}</Label>
            <Input id="sector" {...register("sector")} />
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
              {areas.map((area) => (
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
            <Button type="button" variant="ghost" onClick={() => router.push(next)}>
              {t("skip")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
