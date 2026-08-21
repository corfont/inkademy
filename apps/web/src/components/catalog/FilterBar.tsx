"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import type { AreaSummary } from "@inkademy/shared";
import { useTranslations, useLocale } from "next-intl";
import { Select, Label, Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { localize } from "@/lib/format";

export function FilterBar({ areas }: { areas: AreaSummary[] }) {
  const t = useTranslations("catalog.filters");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState({
    areaSlug: searchParams.get("areaSlug") ?? "",
    modality: searchParams.get("modality") ?? "",
    level: searchParams.get("level") ?? "",
    type: searchParams.get("type") ?? "",
    language: searchParams.get("language") ?? "",
    certificationOnly: searchParams.get("certificationOnly") === "true",
    minPrice: searchParams.get("minPrice") ?? "",
    maxPrice: searchParams.get("maxPrice") ?? "",
    duration: searchParams.get("duration") ?? "",
    liveOnly: searchParams.get("liveOnly") === "true",
  });

  function apply() {
    const q = searchParams.get("q");
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    Object.entries(state).forEach(([key, value]) => {
      if (value === "" || value === false) return;
      params.set(key, String(value));
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setState({
      areaSlug: "",
      modality: "",
      level: "",
      type: "",
      language: "",
      certificationOnly: false,
      minPrice: "",
      maxPrice: "",
      duration: "",
      liveOnly: false,
    });
    const q = searchParams.get("q");
    router.push(`${pathname}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  }

  return (
    <form
      aria-label={t("title")}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="flex flex-col gap-5"
    >
      <div>
        <Label htmlFor="filter-area">{t("area")}</Label>
        <Select id="filter-area" value={state.areaSlug} onChange={(e) => setState((s) => ({ ...s, areaSlug: e.target.value }))}>
          <option value="">{t("allAreas")}</option>
          {areas.map((area) => (
            <option key={area.id} value={area.slug}>
              {localize(area.name, locale)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="filter-modality">{t("modality")}</Label>
        <Select id="filter-modality" value={state.modality} onChange={(e) => setState((s) => ({ ...s, modality: e.target.value }))}>
          <option value="">{t("allModalities")}</option>
          <option value="RECORDED">{locale === "en" ? "Recorded" : "Grabado"}</option>
          <option value="LIVE">{locale === "en" ? "Live" : "En vivo"}</option>
          <option value="HYBRID">{locale === "en" ? "Hybrid" : "Híbrido"}</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="filter-level">{t("level")}</Label>
        <Select id="filter-level" value={state.level} onChange={(e) => setState((s) => ({ ...s, level: e.target.value }))}>
          <option value="">{t("allLevels")}</option>
          <option value="INITIAL">{locale === "en" ? "Beginner" : "Inicial"}</option>
          <option value="INTERMEDIATE">{locale === "en" ? "Intermediate" : "Intermedio"}</option>
          <option value="ADVANCED">{locale === "en" ? "Advanced" : "Avanzado"}</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="filter-type">{t("type")}</Label>
        <Select id="filter-type" value={state.type} onChange={(e) => setState((s) => ({ ...s, type: e.target.value }))}>
          <option value="">{t("allTypes")}</option>
          <option value="COURSE">{locale === "en" ? "Course" : "Curso"}</option>
          <option value="WORKSHOP">{locale === "en" ? "Workshop" : "Taller"}</option>
          <option value="SEMINAR">{locale === "en" ? "Seminar" : "Seminario"}</option>
          <option value="MASTERCLASS">Masterclass</option>
          <option value="PROGRAM">{locale === "en" ? "Program" : "Programa"}</option>
          <option value="DIPLOMA">{locale === "en" ? "Diploma" : "Diplomado"}</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="filter-language">{t("language")}</Label>
        <Select id="filter-language" value={state.language} onChange={(e) => setState((s) => ({ ...s, language: e.target.value }))}>
          <option value="">{t("allModalities")}</option>
          <option value="es">Español</option>
          <option value="en">English</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="filter-duration">{locale === "en" ? "Duration" : "Duración"}</Label>
        <Select id="filter-duration" value={state.duration} onChange={(e) => setState((s) => ({ ...s, duration: e.target.value }))}>
          <option value="">{t("allModalities")}</option>
          <option value="short">{locale === "en" ? "Under 10 hours" : "Menos de 10 horas"}</option>
          <option value="medium">{locale === "en" ? "10 to 20 hours" : "Entre 10 y 20 horas"}</option>
          <option value="long">{locale === "en" ? "Over 20 hours" : "Más de 20 horas"}</option>
        </Select>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ash-700">{t("price")}</legend>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            aria-label={t("minPrice")}
            placeholder={t("minPrice")}
            value={state.minPrice}
            onChange={(e) => setState((s) => ({ ...s, minPrice: e.target.value }))}
          />
          <Input
            type="number"
            min={0}
            aria-label={t("maxPrice")}
            placeholder={t("maxPrice")}
            value={state.maxPrice}
            onChange={(e) => setState((s) => ({ ...s, maxPrice: e.target.value }))}
          />
        </div>
      </fieldset>

      <Checkbox
        id="filter-certification"
        label={t("certificationOnly")}
        checked={state.certificationOnly}
        onChange={(e) => setState((s) => ({ ...s, certificationOnly: e.target.checked }))}
      />

      <Checkbox
        id="filter-live"
        label={locale === "en" ? "Has an upcoming live date" : "Con próxima fecha en vivo"}
        checked={state.liveOnly}
        onChange={(e) => setState((s) => ({ ...s, liveOnly: e.target.checked }))}
      />

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary">
          {t("title") === "Filtros" ? "Aplicar filtros" : "Apply filters"}
        </Button>
        <Button type="button" variant="ghost" onClick={clear}>
          {locale === "en" ? "Clear filters" : "Limpiar filtros"}
        </Button>
      </div>
    </form>
  );
}
