import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://inkademy.lat";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/docente", "/campus", "/empresa", "/checkout", "/notificaciones", "/completar-perfil"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
