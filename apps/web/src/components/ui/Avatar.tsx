import { getCategoryColor } from "@/lib/category-colors";

/**
 * Avatar de iniciales con color determinístico (mismo patrón que
 * category-colors.ts) — antes cada listado de personas (usuarios,
 * colaboradores de empresa, docentes asignados) era solo texto plano, sin
 * ninguna forma rápida de distinguir una fila de otra de un vistazo. Si el
 * usuario ya tiene foto cargada (ver EditUserModal), se muestra esa en vez
 * de las iniciales.
 */
export function Avatar({ name, size = "md", src }: { name: string; size?: "sm" | "md"; src?: string | null }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?";
  const color = getCategoryColor(name || "?");
  const dimensions = size === "sm" ? "h-6 w-6 text-[0.65rem]" : "h-8 w-8 text-xs";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`inline-flex flex-none rounded-full object-cover ${dimensions}`} />;
  }
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-semibold ${dimensions} ${color.solid} ${color.solidText}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
