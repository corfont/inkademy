const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Necesario para que el output standalone incluya @inkademy/shared
  // (dependencia de workspace fuera de apps/web) al construir en el monorepo.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    typedRoutes: false,
  },
  eslint: {
    // El lint se corre aparte (pnpm lint); no bloquear el build de producción por reglas de estilo.
    ignoreDuringBuilds: true,
  },
};

module.exports = withNextIntl(nextConfig);
