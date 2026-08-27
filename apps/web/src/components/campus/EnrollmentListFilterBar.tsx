"use client";

import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/Input";
import { EnrollmentCard } from "./EnrollmentCard";
import { localize } from "@/lib/format";
import type { EnrollmentSummaryDTO } from "@inkademy/shared";

type Item = { enrollment: EnrollmentSummaryDTO; attemptLabel: string | null };
type SortKey = "recent" | "name" | "progress";

/**
 * "Vista general de curso" con buscar/ordenar arriba — inspirado en la
 * barra de filtros de la referencia (formaciondocente.upn.edu.pe). Filtra
 * y ordena en el cliente sobre la lista YA cargada por el server component
 * (cursos/page.tsx) — sin un endpoint nuevo, la lista de "Mis cursos" de
 * un alumno nunca es tan grande como para justificar buscar en el server.
 */
export function EnrollmentListFilterBar({ items, locale, emptyLabel }: { items: Item[]; locale: string; emptyLabel: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? items.filter(({ enrollment }) => localize(enrollment.title, locale).toLowerCase().includes(q)) : items;
    return [...base].sort((a, b) => {
      if (sort === "name") return localize(a.enrollment.title, locale).localeCompare(localize(b.enrollment.title, locale));
      if (sort === "progress") return b.enrollment.progressPct - a.enrollment.progressPct;
      return new Date(b.enrollment.enrolledAt).getTime() - new Date(a.enrollment.enrolledAt).getTime();
    });
  }, [items, query, sort, locale]);

  if (items.length === 0) return <p className="text-ash-500">{emptyLabel}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre del curso…"
          className="max-w-xs"
          aria-label="Buscar en mis cursos"
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="max-w-[12rem]" aria-label="Ordenar por">
          <option value="recent">Más reciente</option>
          <option value="name">Nombre del curso</option>
          <option value="progress">Avance</option>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-ash-500">No se encontraron cursos para &ldquo;{query}&rdquo;.</p>
      ) : (
        filtered.map(({ enrollment, attemptLabel }) => (
          <EnrollmentCard key={enrollment.id} enrollment={enrollment} locale={locale} attemptLabel={attemptLabel} />
        ))
      )}
    </div>
  );
}
