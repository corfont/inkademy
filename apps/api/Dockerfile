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

# ---- build: genera el cliente Prisma y compila la API ----
FROM deps AS build
COPY prisma ./prisma
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @inkademy/db run generate
RUN pnpm --filter @inkademy/api run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
