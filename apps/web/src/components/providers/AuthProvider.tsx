"use client";

import type { AuthUser } from "@inkademy/shared";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api-client";
import { clearClientAccessToken, persistSession, readSessionCookie, SESSION_COOKIE } from "@/lib/auth";

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
