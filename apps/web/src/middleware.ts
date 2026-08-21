import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const PROTECTED_PREFIXES = ["/campus", "/empresa", "/admin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Gate simple por rol para /admin (STUDENT/TEACHER no deberían entrar).
  if (pathname.startsWith("/admin")) {
    try {
      const user = JSON.parse(decodeURIComponent(session));
      if (user.globalRole !== "ADMIN" && user.globalRole !== "SUPPORT") {
        return NextResponse.redirect(new URL("/campus", request.url));
      }
    } catch {
      // cookie corrupta: dejamos pasar y la propia página resolverá el estado real vía /auth/me
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/campus/:path*", "/campus", "/empresa/:path*", "/empresa", "/admin/:path*", "/admin"],
};
