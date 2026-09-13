# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Inkademy — apps/web (Next.js standalone)
# Build de contexto: la raíz del monorepo (docker build -f apps/web/Dockerfile .)
# porque este workspace depende de packages/shared vía pnpm workspaces.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /repo

# --- deps: instala solo lo necesario para resolver el workspace -----------
FROM base AS deps
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @inkademy/web... 2>/dev/null || pnpm install --filter @inkademy/web...

# --- builder: copia el código y compila -----------------------------------
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# Las variables NEXT_PUBLIC_* de Next.js se "hornean" como strings literales
# en el bundle del NAVEGADOR durante `next build` — a diferencia del resto
# de las env vars, no basta con pasarlas en `environment:` del contenedor
# en tiempo de ejecución, porque para entonces el JS ya está compilado.
# Verificado en vivo: sin esto, el bundle del cliente seguía llamando a
# `http://localhost:4000` (el default de api-client.ts) aunque el
# contenedor tuviera NEXT_PUBLIC_API_URL correcto en su entorno — deben
# pasarse como --build-arg (ver build.args en docker-compose.yml).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CULQI_PUBLIC_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLIC_KEY
ARG NEXT_PUBLIC_PAYPAL_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_CULQI_PUBLIC_KEY=${NEXT_PUBLIC_CULQI_PUBLIC_KEY}
ENV NEXT_PUBLIC_STRIPE_PUBLIC_KEY=${NEXT_PUBLIC_STRIPE_PUBLIC_KEY}
ENV NEXT_PUBLIC_PAYPAL_CLIENT_ID=${NEXT_PUBLIC_PAYPAL_CLIENT_ID}
RUN pnpm --filter @inkademy/shared run build
RUN pnpm --filter @inkademy/web build

# --- runner: imagen final mínima con el output standalone ------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
