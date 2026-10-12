import type { MetadataRoute } from "next";
import { API_URL } from "@/lib/api-client";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://inkademy.lat";
export const dynamic = "force-dynamic";

/** Páginas públicas fijas más los cursos publicados (si la API no responde, queda solo lo fijo: nunca se cae el sitemap). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = ["", "/catalogo", "/empresas", "/ayuda", "/verificar", "/legales/privacidad", "/legales/terminos", "/legales/cookies"].map((path) => ({
    url: `${SITE}${path}`,
    lastModified: now,
  }));
  try {
    const res = await fetch(`${API_URL}/courses?pageSize=100`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return fixed;
    const data = (await res.json()) as { items?: { slug: string }[] };
    return [...fixed, ...(data.items ?? []).map((c) => ({ url: `${SITE}/cursos/${c.slug}`, lastModified: now }))];
  } catch {
    return fixed;
  }
}
