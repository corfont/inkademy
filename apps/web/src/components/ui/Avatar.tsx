import { getCategoryColor } from "@/lib/category-colors";

/**
 * Avatar de iniciales con color determinístico (mismo patrón que
 * category-colors.ts) — antes cada listado de personas (usuarios,
 * colaboradores de empresa, docentes asignados) era solo texto plano, sin
 * ninguna forma rápida de distinguir una fila de otra de un vistazo.
 */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?";
  const color = getCategoryColor(name || "?");
  const dimensions = size === "sm" ? "h-6 w-6 text-[0.65rem]" : "h-8 w-8 text-xs";
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-semibold ${dimensions} ${color.solid} ${color.solidText}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
