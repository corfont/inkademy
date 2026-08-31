import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

/**
 * "La encuesta NPS... más gráfica, visual, con colores, más moderna" — el
 * link que recibe el administrador de la empresa por correo abría toda la
 * navegación del sitio (Catálogo/Empresas/Ayuda/Iniciar sesión + el footer
 * de 3 columnas) alrededor de una sola pregunta. Layout propio y enfocado,
 * calcado de (auth)/layout.tsx (mismo criterio: un flujo de una sola acción
 * no necesita el sitio completo alrededor), con un degradado sutil de marca
 * en vez de gris plano.
 */
export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-paper-muted">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(circle at 15% 10%, hsl(var(--gold-200) / 0.35), transparent 45%), radial-gradient(circle at 85% 90%, hsl(var(--indigo-200) / 0.3), transparent 50%)",
        }}
        aria-hidden="true"
      />
      <header className="container relative flex h-16 items-center justify-between">
        <Link href="/" aria-label="Inkademy">
          <BrandLogo />
        </Link>
        <LocaleSwitcher />
      </header>
      <main id="main-content" className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}
