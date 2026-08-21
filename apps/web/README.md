# @inkademy/web

Frontend de Inkademy (Next.js 14, App Router, TypeScript, Tailwind CSS).

## Requisitos

- Node 20+
- pnpm 9 (el repo usa `pnpm-workspace.yaml`; no instales dependencias solo dentro de `apps/web`, hazlo desde la raíz del monorepo)

## Instalación

Desde la **raíz del monorepo** (no dentro de `apps/web`):

```bash
pnpm install
```

## Variables de entorno

Copia `.env.example` (raíz del monorepo) a `.env` y ajusta al menos:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_CULQI_PUBLIC_KEY=pk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_test_xxx
```

Si `apps/api` no está corriendo, la app sigue siendo navegable: cada pantalla
que consulta la API cae a datos simulados (`src/lib/mock-data.ts`) y muestra
un aviso discreto ("Mostrando datos de referencia…").

## Desarrollo

```bash
pnpm --filter @inkademy/web dev
```

Abre http://localhost:3000.

## Build de producción

```bash
pnpm --filter @inkademy/web build
pnpm --filter @inkademy/web start
```

## Estructura

Ver `IMPLEMENTATION-NOTES.md` para el detalle de qué pantallas están
conectadas a la API real vs. simuladas, decisiones de diseño y pendientes.

- `src/app` — rutas (App Router), agrupadas en `(marketing)`, `(auth)`,
  `(campus)`, `(empresa)`, `(admin)` y `checkout` fuera de cualquier grupo.
- `src/components/ui` — primitivos propios (Button, Card, Tabs, Dialog, …)
  escritos a mano con Tailwind + `class-variance-authority`.
- `src/components/catalog`, `layout`, `campus`, `empresa`, `admin`,
  `marketing`, `providers` — componentes específicos de cada área.
- `src/lib/api-client.ts` — wrapper de fetch tipado contra `@inkademy/shared`.
- `src/lib/mock-data.ts` — datos simulados usados como fallback.
- `src/i18n`, `src/messages/{es,en}.json` — i18n con `next-intl` (sin prefijo
  de ruta; el idioma se guarda en una cookie).
- `middleware.ts` (en `src/`) — protege `/campus`, `/empresa` y `/admin`.

## Docker

```bash
docker build -f apps/web/Dockerfile -t inkademy-web .   # contexto = raíz del repo
docker run -p 3000:3000 --env-file .env inkademy-web
```
