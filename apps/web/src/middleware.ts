import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// "/checkout" también requiere sesión: el endpoint POST /checkout de la API
// exige un usuario autenticado (@CurrentUser), y sin este guard un visitante
// sin cuenta podía llenar los datos de tarjeta y recién enterarse del 401 al
// final, en vez de que se le pida iniciar sesión antes de escribir nada.
const PROTECTED_PREFIXES = ["/campus", "/empresa", "/admin", "/docente", "/checkout"];

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
  if (pathname.startsWith("/admin")) {
    try {
      const user = JSON.parse(decodeURIComponent(session));
      if (user.globalRole !== "ADMIN" && user.globalRole !== "SUPPORT") {
        return NextResponse.redirect(new URL(user.globalRole === "TEACHER" ? "/docente" : "/campus", request.url));
      }
    } catch {
      // cookie corrupta: dejamos pasar y la propia página resolverá el estado real vía /auth/me
    }
  }
  if (pathname.startsWith("/docente")) {
    try {
      const user = JSON.parse(decodeURIComponent(session));
      if (user.globalRole !== "TEACHER" && user.globalRole !== "ADMIN") {
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
