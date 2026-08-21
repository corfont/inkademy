# ============================================================
# Inkademy Worker — build multistage (BullMQ + node 20-alpine)
# ============================================================
FROM node:20-alpine AS base
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# ---- deps: instala dependencias de todo el monorepo (necesario para workspace deps) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile=false

# ---- build: genera el cliente Prisma y compila el worker ----
FROM deps AS build
COPY prisma ./prisma
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm --filter @inkademy/db run generate
RUN pnpm --filter @inkademy/worker run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Chromium para puppeteer (generación de PDF de certificados). Se usa el
# Chromium del paquete de Alpine en vez del que descarga puppeteer, que no
# corre bien en musl/alpine sin dependencias adicionales.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
    && rm -rf /var/cache/apk/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build /repo/apps/worker/package.json ./apps/worker/package.json

WORKDIR /repo/apps/worker
CMD ["node", "dist/index.js"]
