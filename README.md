# Inkademy

Plataforma de educación y capacitación virtual **B2C + B2B** para Perú y
LatAm: catálogo de cursos/talleres/seminarios/masterclasses/diplomados
(grabados y en vivo vía Microsoft Teams), checkout con Culqi/Stripe,
evaluación y certificación automática con verificación pública, y un panel
B2B para empresas que compran cupos para sus colaboradores.

## Estructura del repo

Monorepo pnpm (workspaces `apps/*` y `packages/*`):

```
apps/
  api/      NestJS — API REST (auth, catálogo, checkout, evaluación,
            certificación, B2B, soporte, admin). Swagger en /docs.
  web/      Next.js — catálogo público, campus del alumno, checkout,
            panel B2B y panel de administración/soporte.
  worker/   Node + BullMQ — email, generación de certificados (PDF+QR),
            recordatorios, sincronización de asistencia (Microsoft Graph)
            y motor de recomendación. Ver apps/worker/README.md.
packages/
  db/       Cliente Prisma generado y re-exportado (@inkademy/db).
  shared/   Enums, tipos DTO y esquemas zod compartidos (@inkademy/shared).
  ui/       Componentes de UI compartidos por apps/web.
prisma/
  schema.prisma   Modelo de datos completo (fuente de verdad).
  seed.ts         Datos demo (áreas, cursos, programa, empresa, usuarios...).
docs/
  API-CONTRACT.md    Contrato REST detallado.
  ARCHITECTURE.md     Arquitectura, decisiones técnicas, multi-tenancy, escalado.
  DATA-MODEL.md       Diagrama ER completo y explicación por bloque.
  DEPLOYMENT.md       De docker-compose local a producción.
  PHASES.md           Plan de fases (Lanzamiento / Crecimiento / Diferenciación).
tests/
  e2e/      Pruebas end-to-end (Playwright).
```

## Cómo levantar todo en local

Requisitos: Node 20+, pnpm 9+, Docker.

```bash
# 1. Variables de entorno (los valores de ejemplo ya funcionan con docker-compose)
cp .env.example .env

# 2. Servicios de infraestructura + build de api/web/worker
docker compose up -d --build
# (equivalente: pnpm docker:up)

# 3. Dependencias del monorepo
pnpm install

# 4. Cliente Prisma
pnpm prisma:generate

# 5. Esquema en la base de datos
pnpm prisma:migrate

# 6. Datos demo
pnpm prisma:seed

# 7. Modo desarrollo (si prefieres correr las apps fuera de sus contenedores,
#    con hot-reload, en vez de usar los contenedores de docker-compose)
pnpm dev
```

`pnpm dev` corre `api`, `web` y `worker` en paralelo (`pnpm -r --parallel run dev`)
contra los servicios de infraestructura (`postgres`, `redis`, `minio`,
`mailhog`) levantados por `docker compose up -d postgres redis minio
minio-init mailhog`.

**Si el puerto 3000 ya lo usa otra cosa en tu máquina** (otro proyecto,
otro contenedor), no hace falta tocar código: define `WEB_PORT` y
`APP_URL` acordes antes de levantar todo, por ejemplo:

```bash
sed -i '' 's#^APP_URL=.*#APP_URL=http://localhost:3002#' .env   # certificados/CORS/recordatorios usan esta misma URL
export WEB_PORT=3002
pnpm dev
```

## URLs locales

| Servicio | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 (o `$WEB_PORT` si lo definiste) |
| API (NestJS) | http://localhost:4000 |
| Swagger (docs de la API) | http://localhost:4000/docs |
| Mailhog (bandeja de correo de prueba) | http://localhost:8025 |
| MinIO Console (object storage) | http://localhost:9001 |

## Credenciales demo (creadas por `pnpm prisma:seed`)

Password para todos: **`Demo1234!`**

| Email | Rol |
|---|---|
| `alumno@demo.inkademy.com` | Alumno (`STUDENT`) |
| `docente@demo.inkademy.com` | Docente (`TEACHER`) |
| `empresa@demo.inkademy.com` | Admin de empresa (`COMPANY_ADMIN` de "Corporación Andina S.A.C.") |
| `soporte@demo.inkademy.com` | Soporte (`SUPPORT`) |
| `admin@demo.inkademy.com` | Administrador (`ADMIN`) |

## Documentación

- Contrato de API: [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md)
- Arquitectura y decisiones técnicas: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Modelo de datos: [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- Despliegue a producción: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Plan de fases: [`docs/PHASES.md`](docs/PHASES.md)
- Worker (colas BullMQ): [`apps/worker/README.md`](apps/worker/README.md)
