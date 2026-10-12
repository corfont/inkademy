"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/ui/Input";
import { useAuth } from "@/components/providers/AuthProvider";
import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";

const OPTIONS = [
  { value: "newest", label: "Más recientes" },
  { value: "bestSelling", label: "Más vendidos" },
  { value: "priceAsc", label: "Precio: menor a mayor" },
  { value: "priceDesc", label: "Precio: mayor a menor" },
];

/**
 * Antes el catálogo público no tenía ninguna forma de ordenar los
 * resultados — siempre salía por fecha de creación. "Más vistos"/"con más
 * reseñas" no están acá: no existe tracking de vistas ni un modelo de
 * Review todavía (ver IMPLEMENTATION-NOTES.md).
 */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { courseCardFields } = useBrandSettings();
  // Quien no ve los precios tampoco necesita ordenar por precio.
  const canSeePrices = Boolean(user) || Boolean(courseCardFields.showPricesToVisitors);
  const options = canSeePrices ? OPTIONS : OPTIONS.filter((o) => !o.value.startsWith("price"));
  const current = searchParams.get("sort") ?? "newest";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "newest") params.delete("sort");
    else params.set("sort", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onChange={(e) => handleChange(e.target.value)} className="w-auto text-sm" aria-label="Ordenar por">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
