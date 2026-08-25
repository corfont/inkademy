import { ShieldCheck, GraduationCap, LifeBuoy, User, Building2, type LucideIcon } from "lucide-react";

/**
 * Color + ícono por rol — mismo criterio que offering-style.ts (un enum
 * acotado y con significado real merece un color curado a mano, no uno por
 * hash). Usado en UsersManager para que "Usuarios y roles" deje de ser una
 * tabla gris y se pueda distinguir un rol de otro de un vistazo.
 */
export interface RoleStyle {
  icon: LucideIcon;
  label: string;
  chip: string; // clases para la chip "inactiva" (no seleccionada)
  chipActive: string; // clases para la chip cuando SÍ es el rol actual
}

export const ROLE_STYLE: Record<string, RoleStyle> = {
  ADMIN: {
    icon: ShieldCheck,
    label: "Administrador",
    chip: "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
    chipActive: "bg-violet-600 text-white shadow-sm",
  },
  TEACHER: {
    icon: GraduationCap,
    label: "Docente",
    chip: "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
    chipActive: "bg-sky-600 text-white shadow-sm",
  },
  SUPPORT: {
    icon: LifeBuoy,
    label: "Soporte",
    chip: "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    chipActive: "bg-amber-600 text-white shadow-sm",
  },
  STUDENT: {
    icon: User,
    label: "Alumno",
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    chipActive: "bg-emerald-600 text-white shadow-sm",
  },
};

export const COMPANY_CHIP_STYLE = {
  icon: Building2,
  chip: "border border-ash-300 bg-paper-muted text-ash-600 hover:bg-ash-100",
  chipActive: "bg-ink-800 text-white shadow-sm",
};
