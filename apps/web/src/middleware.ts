import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// "/checkout" también requiere sesión: el endpoint POST /checkout de la API
// exige un usuario autenticado (@CurrentUser), y sin este guard un visitante
// sin cuenta podía llenar los datos de tarjeta y recién enterarse del 401 al
// final, en vez de que se le pida iniciar sesión antes de escribir nada.
const PROTECTED_PREFIXES = ["/campus", "/empresa", "/admin", "/docente", "/checkout"];

// Pantallas cuyas rutas de API detrás son @Roles("ADMIN") puro (nunca
// SUPPORT) — Configuración avanzada/Zona de pruebas ya se ocultaban del
// menú para SUPPORT, pero un link directo (o entrar por URL a mano)
// igual llegaba a la página y esta reventaba con un 403 sin manejar al
// pedir sus datos (ninguna de estas usa withFallback). Mismo criterio que
// esas dos: SUPPORT nunca debería ni poder abrirlas, no solo no verlas en
// el menú.
const ADMIN_ONLY_PREFIXES = [
  "/admin/configuracion",
  "/admin/zona-de-pruebas",
  "/admin/facturacion",
  "/admin/asistente-ia",
  "/admin/marketing",
  "/admin/convenios",
  "/admin/regalias",
  "/admin/horas-docentes",
  "/admin/liquidaciones",
  "/admin/backups",
  "/admin/auditoria",
];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    // Incluye el querystring (p.ej. ?courseId=...) para que al volver de login
    // el checkout siga apuntando al mismo curso/programa que el visitante eligió.
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Gate simple por rol: /admin es solo ADMIN/SUPPORT, /docente es solo
  // TEACHER (y ADMIN, por si necesita entrar a revisar algo puntual). Antes
  // /admin redirigía a TEACHER directo a /campus — un docente no tenía
  // ningún panel propio a donde ir, quedaba varado en la vista de alumno.
  // Un usuario con roles secundarios (p.ej. docente que TAMBIÉN es admin)
  // puede entrar a cualquier área que le corresponda a alguno de sus roles.
  if (pathname.startsWith("/admin")) {
    try {
      const user = JSON.parse(decodeURIComponent(session));
      const roles: string[] = [user.globalRole, ...(user.secondaryRoles ?? [])];
      if (!roles.includes("ADMIN") && !roles.includes("SUPPORT")) {
        return NextResponse.redirect(new URL(roles.includes("TEACHER") ? "/docente" : "/campus", request.url));
      }
      // SUPPORT entra a /admin, pero no a estas pantallas puntuales
      // (finanzas/configuración/HR de docentes) — sin este chequeo, la
      // página igual se renderiza y revienta al pedir datos que el backend
      // rechaza con 403.
      if (!roles.includes("ADMIN") && ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
    } catch {
      // cookie corrupta: dejamos pasar y la propia página resolverá el estado real vía /auth/me
    }
  }
  if (pathname.startsWith("/docente")) {
    try {
      const user = JSON.parse(decodeURIComponent(session));
      const roles: string[] = [user.globalRole, ...(user.secondaryRoles ?? [])];
      if (!roles.includes("TEACHER") && !roles.includes("ADMIN")) {
        return NextResponse.redirect(new URL("/campus", request.url));
      }
    } catch {
      // cookie corrupta: dejamos pasar
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/campus/:path*", "/campus", "/empresa/:path*", "/empresa", "/admin/:path*", "/admin", "/docente/:path*", "/docente", "/checkout"],
};
