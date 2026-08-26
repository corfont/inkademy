"use client";

import type { AuthUser } from "@inkademy/shared";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authApi, tryRefresh } from "@/lib/api-client";
import { clearClientAccessToken, persistSession, readSessionCookie, updateSessionUser, SESSION_COOKIE } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: { email: string; password: string; firstName: string; lastName: string; locale?: "es" | "en"; marketingConsentEmail?: boolean }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match?.split("=")[1];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const cached = readSessionCookie(readCookie(SESSION_COOKIE));
    if (cached) setUser(cached);
    setLoading(false);
  }, []);

  // Refresco proactivo del access token mientras la sesión esté abierta —
  // antes solo se refrescaba reactivamente (después de que un fetch de
  // CLIENTE ya había fallado con 401). Las páginas server-rendered
  // (/campus, /admin, /docente) leen la cookie legible `inkademy_at`
  // directamente y nunca disparaban ese refresco reactivo, así que esa
  // cookie de 15 min (JWT_ACCESS_TTL) expiraba en cualquier sesión activa
  // de más de un cuarto de hora, mostrando la pantalla de "sesión expirada"
  // en la próxima navegación aunque el usuario siguiera activo. Se
  // refresca una vez al montar (por si la pestaña estuvo inactiva) y luego
  // cada 10 min — con margen sobre los 15 min de vida del token.
  //
  // Además, cada ciclo re-sincroniza el usuario completo (`/auth/me`) y
  // reescribe la cookie `inkademy_session`. Esa cookie es una FOTO tomada
  // en login/registro/edición de perfil (ver auth.ts); si el rol cambia por
  // otra vía (p.ej. un admin le agrega el rol ADMIN o EMPRESA a esta cuenta
  // mientras ya tenía una sesión abierta en otra pestaña/dispositivo), la
  // foto quedaba desactualizada hasta el próximo login. Como el menú lateral
  // y el middleware arman los accesos a partir de esa misma cookie, el
  // síntoma era justamente "a veces carga solo el acceso de usuario y otras
  // veces completo": dependía de qué tan vieja fuera la cookie de esa sesión
  // en particular. Con este resync, una pestaña abierta se autocorrige sola
  // en como máximo un ciclo (y de inmediato al abrir una pestaña nueva).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function resync() {
      await tryRefresh();
      try {
        const fresh = await authApi.me();
        if (!cancelled) {
          setUser(fresh);
          updateSessionUser(fresh);
        }
      } catch {
        // token inválido o sin red: el próximo ciclo reintenta
      }
    }
    void resync();
    const interval = setInterval(() => {
      void resync();
    }, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(user)]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      setUser,
      async login(email, password) {
        const { user: loggedUser, accessToken } = await authApi.login({ email, password });
        persistSession(loggedUser, accessToken);
        setUser(loggedUser);
        return loggedUser;
      },
      async register(input) {
        const { user: newUser, accessToken } = await authApi.register(input);
        persistSession(newUser, accessToken);
        setUser(newUser);
        return newUser;
      },
      async logout() {
        try {
          await authApi.logout();
        } catch {
          // continuamos igual con el logout local
        }
        clearClientAccessToken();
        setUser(null);
        router.push("/login");
      },
    }),
    [user, loading, router],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
