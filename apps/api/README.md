# @inkademy/api

API backend de Inkademy (NestJS + Prisma). Implementa el contrato descrito en
`docs/API-CONTRACT.md` usando `@inkademy/db` (Prisma) y `@inkademy/shared`
(tipos y esquemas zod) como fuentes de verdad.

## Requisitos

- Node 20+
- pnpm 9 (workspace en la raíz del monorepo)
- Postgres 16 y Redis 7 corriendo (ver `docker-compose.yml` en la raíz —
  `pnpm docker:up` levanta Postgres, Redis, MinIO y Mailhog)

## Cómo correr en desarrollo

Desde la raíz del monorepo:

```bash
pnpm install                              # instala dependencias del workspace completo
pnpm --filter @inkademy/db run generate   # genera el cliente Prisma en packages/db/generated
pnpm --filter @inkademy/api exec prisma migrate dev --schema ../../prisma/schema.prisma
cp .env.example .env                      # completar variables (ver abajo)
pnpm docker:up                            # Postgres, Redis, MinIO, Mailhog
pnpm --filter @inkademy/api dev           # nest start --watch, puerto 4000
```

Swagger disponible en `http://localhost:4000/docs` una vez levantada la API.

## Variables de entorno obligatorias

Mínimo para que la API arranque y funcione en modo dev (ver `.env.example` en
la raíz del monorepo para el resto):

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión Postgres (Prisma) |
| `REDIS_URL` | Conexión BullMQ |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Firma de tokens (usar valores fuertes en prod) |
| `APP_URL` | Usado para CORS y redirects de OAuth/callback |
| `API_URL` | Usado para construir URLs de verificación de certificados |

Todas las demás variables (`GOOGLE_*`, `MS_*`, `CULQI_*`, `STRIPE_*`, `S3_*`,
`SMTP_*`) son opcionales para desarrollo local: cuando faltan, los adapters
correspondientes degradan a un modo simulado/no-op documentado en
`IMPLEMENTATION-NOTES.md` en vez de fallar el arranque de la app:

- **Sin credenciales de Culqi/Stripe**: el checkout "cobra" en modo simulado
  (siempre exitoso) — útil para probar el flujo de matrícula sin una cuenta
  real de pagos.
- **Sin `MS_TENANT_ID`/`MS_CLIENT_ID`/`MS_CLIENT_SECRET`**: `TeamsProvider`
  genera un `joinUrl` de placeholder y lo indica por log ("modo SIMULADO").
- **Sin `GOOGLE_CLIENT_ID`/`MS_CLIENT_ID`**: las rutas `/auth/google` y
  `/auth/microsoft` seguirán registradas pero el login fallará al llegar al
  proveedor (no hay fallback — hay que configurar credenciales reales para
  probar OAuth).
- **Sin `S3_*` configurado a un MinIO/S3 real**: subir/leer objetos fallará;
  para dev usar `pnpm docker:up` (incluye MinIO con el bucket ya creado).

## Scripts

- `pnpm --filter @inkademy/api dev` — modo watch
- `pnpm --filter @inkademy/api build` — compila a `dist/`
- `pnpm --filter @inkademy/api start` — corre `dist/main.js`
- `pnpm --filter @inkademy/api test` — tests unitarios (jest)
- `pnpm --filter @inkademy/api test:e2e` — tests e2e (supertest), con Prisma
  mockeado por defecto (ver `test/utils/mock-prisma.ts`) — no requieren
  Postgres corriendo. Para e2e contra una BD real, levantar
  `docker compose up postgres redis` y adaptar los specs para usar el cliente
  real de `@inkademy/db` en vez del mock.

## Estructura

Ver `src/modules/*` para cada dominio (auth, users, companies, catalog,
enrollment, commerce, assessment, certificate, live-session, calendar,
notification, support, admin). `src/common/*` contiene guards, decoradores,
filtros, el pipe zod genérico y la definición de colas BullMQ. `src/storage`
contiene el cliente S3/MinIO.

Ver `IMPLEMENTATION-NOTES.md` para endpoints simplificados, los nombres
exactos de colas/jobs BullMQ que esta API encola (para `apps/worker`) y
decisiones de diseño relevantes.
