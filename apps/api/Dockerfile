# ============================================================
# Inkademy API — build multistage (NestJS)
# ============================================================
FROM node:20-alpine AS base
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# ---- deps: instala dependencias de todo el monorepo (necesario para workspace deps) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile=false

# ---- build: genera el cliente Prisma, compila los paquetes compartidos y la API ----
FROM deps AS build
COPY prisma ./prisma
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @inkademy/db run generate
RUN pnpm --filter @inkademy/shared run build
RUN pnpm --filter @inkademy/db run build
RUN pnpm --filter @inkademy/api run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# Sin esto, el binario de Prisma generado para "linux-musl-openssl-3.0.x"
# queda sin usarse: la propia detección de OpenSSL de Prisma en runtime
# necesita poder invocar `openssl` — sin el paquete instalado, falla en
# silencio ("Prisma failed to detect the libssl/openssl version...
# Defaulting to openssl-1.1.x") y carga el motor equivocado
# (libquery_engine-linux-musl.so.node, que pide libssl.so.1.1, inexistente
# en esta imagen) aunque el correcto ya esté generado al lado. Solo se vio
# ejecutando el contenedor real.
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
# Se incluye para poder correr `prisma migrate deploy`/`db execute` contra
# el propio contenedor de producción (schema + SQL de migraciones ya
# generadas) sin tener que reconstruir la imagen para eso.
COPY --from=build /repo/prisma ./prisma

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
