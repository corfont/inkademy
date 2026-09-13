const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    typedRoutes: false,
    // Necesario para que el output standalone incluya @inkademy/shared
    // (dependencia de workspace fuera de apps/web) al construir en el
    // monorepo. Va DENTRO de `experimental`, no en el nivel superior — en
    // Next 14.2.5 el nivel superior es un objeto estricto (zod
    // `strictObject`) que solo WARN-ea y descarta cualquier clave que no
    // reconoce ahí, en vez de fallar; puesta afuera, esta opción se
    // ignoraba en silencio (visible como "Unrecognized key(s)...
    // outputFileTracingRoot" en cada arranque) y el build standalone caía
    // a su propia detección de raíz, aplanando server.js a /app/server.js
    // en vez de /app/apps/web/server.js — solo se detectó ejecutando el
    // contenedor real, no en el build ni en next dev.
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  eslint: {
    // El lint se corre aparte (pnpm lint); no bloquear el build de producción por reglas de estilo.
    ignoreDuringBuilds: true,
  },
  // Hallazgo de auditoría (REVIEW.md #2.4): apps/web no mandaba ningún
  // header de seguridad, dependiendo 100% de que el hosting/CDN de
  // producción los agregara. Sin X-Frame-Options, cualquier página del
  // sitio (login incluido) podía enmarcarse en un iframe de terceros
  // (clickjacking).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Este repo vive dentro de una carpeta sincronizada por Synology Drive.
      // Su daemon de sincronización mantiene sus propios watchers sobre todo
      // el árbol de archivos (node_modules incluido), lo que agota el límite
      // GLOBAL de file descriptors del sistema (kern.maxfiles), no el límite
      // por proceso. Eso rompe los watchers nativos de webpack con
      // "EMFILE: too many open files, watch" y deja cada ruta real en 404.
      // Forzar polling evita depender de fs.watch/FSEvents nativos.
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/packages/db/generated/**"],
      };
    }
    return config;
  },
};

module.exports = withNextIntl(nextConfig);
