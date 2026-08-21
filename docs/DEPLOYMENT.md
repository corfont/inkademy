# Despliegue — de docker-compose local a producción

Este documento describe cómo pasar del stack local (`docker-compose.yml`,
raíz) a un entorno de producción, servicio por servicio, sin cambiar de
motor ni de esquema en ningún componente. **El desarrollo local sigue
siendo docker-compose** (Postgres/MinIO/Mailhog locales, sección "Cómo
levantar todo en local" del `README.md` raíz) — lo que cambia abajo es
solo el destino de producción/demo pública.

## 1. Mapa local → producción

| Local (docker-compose) | Producción | Cambia código? |
|---|---|---|
| `postgres` (contenedor `postgres:16-alpine`) | **Supabase** (Postgres administrado) — ver sección 2 | No — mismo motor (PostgreSQL), mismo `prisma/schema.prisma`. Solo cambia `DATABASE_URL`. |
| `redis` (contenedor `redis:7-alpine`) | Redis administrado: **Upstash**, **ElastiCache**, **Azure Cache for Redis** (cualquiera con soporte BullMQ/ioredis) | No — solo cambia `REDIS_URL` (usar TLS: `rediss://`). |
| `minio` | **Supabase Storage** (vía su endpoint S3-compatible) — ver sección 2 | No — el código usa el SDK S3 (`@aws-sdk/client-s3`) contra `S3_ENDPOINT`; solo cambian las variables `S3_*`. |
| `mailhog` | Proveedor SMTP transaccional real (SES, SendGrid, Postmark, Resend...) | No — se sigue hablando SMTP; cambian `SMTP_HOST/PORT/USER/PASS` y `EMAIL_FROM`. |
| `api`, `worker`, `web` (build local) | Mismas imágenes Docker (`apps/*/Dockerfile`); `web` además se puede desplegar nativo en Vercel — ver sección 4 | No — mismos Dockerfiles multistage; solo cambia dónde corren y sus variables de entorno. |

> Nota: si en el futuro el proyecto migra a un Postgres administrado
> genérico (RDS, Cloud SQL, Azure Database for PostgreSQL) en vez de
> Supabase, el cambio sigue siendo solo de `DATABASE_URL` — el motor y el
> esquema no cambian en ningún caso, por eso esta tabla es intercambiable.

## 2. Postgres y Storage en producción: Supabase

La decisión de producto es usar **Supabase únicamamente como Postgres
administrado + Storage** (NO se usa Supabase Auth ni su SDK de cliente —
la autenticación sigue siendo JWT propio + OAuth de Google/Microsoft,
implementada en `apps/api`, sin ningún cambio por esta decisión).

### 2.1. Base de datos (`DATABASE_URL`)

Un proyecto de Supabase es Postgres puro — Prisma se conecta exactamente
igual que a cualquier otro Postgres, sin cambios de código ni de
`prisma/schema.prisma`. Supabase expone dos formas de conexión, y conviene
usar cada una donde corresponde:

- **Pooler de conexiones (puerto `6543`, modo `pgbouncer`)** — usar como
  `DATABASE_URL` en `apps/api` y `apps/worker` en runtime. Como ambos
  corren como contenedores stateless con varias réplicas, cada una abre su
  propio pool de conexiones Prisma; el pooler de Supabase evita agotar el
  límite de conexiones directas de Postgres. Ejemplo de forma (valores de
  ejemplo, no reales):
  ```
  DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
  ```
  El parámetro `pgbouncer=true` le dice a Prisma que no intente usar
  prepared statements incompatibles con el modo transacción del pooler.
- **Conexión directa (puerto `5432`)** — usar solo para
  `prisma migrate deploy` (las migraciones necesitan la conexión directa,
  no el pooler en modo transacción). Se puede exponer como una variable
  separada (p.ej. `DIRECT_DATABASE_URL`) usada únicamente en el paso de
  release/CI que corre las migraciones, dejando `DATABASE_URL` (con
  pooler) para lo que corre en los contenedores de `api`/`worker`.

### 2.2. Object storage (`S3_*`)

Supabase Storage expone un endpoint **S3-compatible** — el mismo adapter
que ya habla con MinIO en dev (`@aws-sdk/client-s3`, ver
`apps/api/src/storage/storage.service.ts` y
`apps/worker/src/lib/storage.ts`) funciona contra Supabase Storage sin
tocar una línea de código, solo cambiando las variables `S3_*` que ya
existían en `.env.example`:

```
S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
S3_REGION=<región del proyecto, p.ej. us-east-1>
S3_ACCESS_KEY=<access key generado en Storage > S3 Access Keys>
S3_SECRET_KEY=<secret key generado junto al access key>
S3_BUCKET=inkademy-assets
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=https://<project-ref>.supabase.co/storage/v1/object/public/inkademy-assets
```

Crear el bucket (`inkademy-assets`, o el nombre que se prefiera) desde el
panel de Supabase Storage antes del primer deploy — equivalente al
`minio-init` que en dev crea el bucket automáticamente vía `docker-compose.yml`.

## 3. Variables de entorno obligatorias en producción

Adicionales o distintas a `.env.example` (que está pensado para dev):

- `NODE_ENV=production`
- `DATABASE_URL` — connection string del **pooler** de Supabase (puerto
  `6543`, `pgbouncer=true`) para `apps/api`/`apps/worker`; usar la conexión
  directa (puerto `5432`) solo para `prisma migrate deploy` (ver sección 2.1).
- `REDIS_URL` — con TLS (`rediss://...`) si el proveedor lo soporta/exige.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — secretos generados
  aleatoriamente (32+ bytes), **nunca** los valores de ejemplo del repo,
  gestionados vía secret manager (no como variable de entorno en texto
  plano si el orquestador lo permite).
- `APP_URL` / `API_URL` — dominios reales (https).
- `GOOGLE_CLIENT_ID/SECRET` y `GOOGLE_CALLBACK_URL` apuntando al dominio real.
- `MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET` y `MS_CALLBACK_URL` — ver
  checklist de Azure AD abajo.
- `CULQI_SECRET_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — claves
  **live**, no `pk_test_`/`sk_test_`.
- `S3_ENDPOINT/REGION/ACCESS_KEY/SECRET_KEY/BUCKET/FORCE_PATH_STYLE/PUBLIC_BASE_URL`
  apuntando al endpoint de Supabase Storage (ver sección 2.2).
- `SMTP_HOST/PORT/SECURE/USER/PASS` y `EMAIL_FROM` del proveedor real.
- `PUPPETEER_EXECUTABLE_PATH` — ya fijado en `apps/worker/Dockerfile` al
  Chromium instalado vía `apk` (no depende de descarga en runtime).

Todos los secretos (JWT, client secrets, API keys de pago, credenciales de
Supabase) deben vivir en el secret manager/vault de la plataforma elegida y
montarse como variables de entorno en el momento del deploy — nunca
committeados ni embebidos en la imagen.

## 4. Despliegue para demo pública (la ruta más simple)

Para tener un link público funcionando sin operar infraestructura propia,
la combinación más simple es: **Supabase** (DB + Storage) + **Render,
Railway o Fly.io** (API y worker, ya tienen Dockerfile → deploy directo de
imagen) + **Vercel** (frontend Next.js, deploy nativo sin Docker). Redis
administrado (Upstash tiene capa gratuita y es la opción más simple de
conectar desde Render/Railway/Fly) completa el stack.

Orden recomendado:

1. **Crear el proyecto en Supabase** → copiar la connection string del
   pooler (`DATABASE_URL`) y la directa (para migraciones), crear el bucket
   de Storage y copiar sus credenciales `S3_*` (sección 2). Contra esa
   `DATABASE_URL` directa, correr una sola vez desde una máquina con el
   repo y `.env` apuntando a Supabase:
   ```bash
   pnpm prisma:generate
   pnpm prisma:migrate deploy   # o el comando de migración elegido en CI
   pnpm prisma:seed             # opcional: solo si se quiere la demo con datos
   ```
2. **Desplegar `apps/api` y `apps/worker`** en Render/Railway/Fly.io como
   dos servicios separados, cada uno construido desde su `Dockerfile`
   (`apps/api/Dockerfile`, `apps/worker/Dockerfile`) con contexto de build
   la raíz del repo (igual que hace `docker-compose.yml` localmente). Cada
   servicio necesita las variables de la sección 3
   (`DATABASE_URL`/`REDIS_URL`/`S3_*`/`SMTP_*`/secretos de JWT y OAuth/
   pagos) — `apps/worker` además necesita `PUPPETEER_EXECUTABLE_PATH` (ya
   viene fijado en su Dockerfile) y no necesita puerto público (no expone
   HTTP). Anotar la URL pública que la plataforma asigna a `apps/api`
   (o el dominio propio si se configura uno).
3. **Desplegar `apps/web` en Vercel**, con `NEXT_PUBLIC_API_URL` apuntando
   a la URL de `apps/api` del paso 2 (y el resto de variables
   `NEXT_PUBLIC_*` de `.env.example`: claves públicas de Culqi/Stripe).
   Vercel construye el proyecto Next.js directamente desde `apps/web`
   (no usa `apps/web/Dockerfile`, que es solo para el despliegue en
   contenedores tipo ECS/Cloud Run si se prefiere esa ruta más adelante).

Con eso: `apps/web` en Vercel habla con `apps/api` en Render/Railway/Fly,
`apps/api`/`apps/worker` hablan con Supabase (DB+Storage) y con Redis
(Upstash) — sin infraestructura propia que mantener. Pagos en modo test y
Microsoft Graph sin configurar funcionan igual que en local (adapter de
Teams en modo simulado, ver `.env.example`); para una demo "seria" conviene
al menos completar el checklist de Azure AD (sección 5) si se quiere
mostrar clases en vivo reales.

## 5. Checklist: Azure AD App Registration (Microsoft Graph / Teams)

Necesario para que el "Login con Microsoft" y la creación/sincronización de
reuniones de Teams funcionen en producción (en dev, sin esto, el adapter de
Teams funciona en modo simulado):

1. Crear (o reutilizar) una **App Registration** en Azure AD del tenant del
   cliente/organización.
2. Agregar **permiso de aplicación** (no delegado)
   `OnlineMeetings.ReadWrite.All` sobre Microsoft Graph.
3. Otorgar **consentimiento de administrador** (admin consent) para ese
   permiso — sin esto, `apps/worker` no podrá leer `attendanceReports`.
4. Generar un **client secret** (o certificado) para la app y guardarlo en
   el secret manager → `MS_CLIENT_SECRET`.
5. Registrar el **redirect URI** de login OAuth (`MS_CALLBACK_URL`,
   `https://<dominio-api>/auth/microsoft/callback`) en la sección
   "Authentication" de la App Registration.
6. Definir `MS_TEAMS_ORGANIZER_UPN` — la cuenta (licenciada para Teams) que
   organiza las reuniones creadas por la plataforma.
7. Confirmar `MS_TENANT_ID`/`MS_CLIENT_ID` correctos en `.env` de `apps/api`
   y `apps/worker` (ambos deben coincidir con el mismo tenant).
8. Probar en un ambiente de staging: crear una `LiveSession`, verificar que
   se genera `providerMeetingId`/`joinUrl`, y que
   `POST /live-sessions/:id/sync-attendance` puebla `Attendance` después de
   finalizada la sesión.

## 6. Checklist: pasarelas de pago en modo live

**Culqi** (Perú):
- Completar el proceso de verificación de negocio (KYC) con Culqi.
- Reemplazar `CULQI_PUBLIC_KEY`/`CULQI_SECRET_KEY` de test por las de
  producción (`pk_live_`/`sk_live_`).
- Configurar el webhook de Culqi apuntando a
  `https://<dominio-api>/webhooks/culqi` y verificar la firma en el handler.
- Probar Yape/PagoEfectivo/tarjeta en el ambiente live con montos pequeños
  antes del lanzamiento.

**Stripe** (compradores internacionales):
- Activar la cuenta de Stripe (datos legales, cuenta bancaria de destino).
- Reemplazar `STRIPE_PUBLIC_KEY`/`STRIPE_SECRET_KEY` por las claves live.
- Configurar el endpoint de webhook `https://<dominio-api>/webhooks/stripe`
  en el dashboard de Stripe y copiar el `STRIPE_WEBHOOK_SECRET` real.
- Revisar impuestos/monedas soportadas (`SUPPORTED_CURRENCIES`) contra lo
  habilitado en la cuenta Stripe.

## 7. Backups de PostgreSQL

- En Supabase: activar los backups diarios automáticos del proyecto (y
  point-in-time recovery, disponible en los planes que lo soportan) desde
  el panel de Database > Backups — no requiere infraestructura propia. Si
  en el futuro se usa un Postgres administrado genérico (RDS/Cloud
  SQL/Azure Database for PostgreSQL) en vez de Supabase, el equivalente son
  sus snapshots automáticos + PITR nativo.
- Retención mínima recomendada: 7–14 días de PITR + snapshots semanales con
  retención de varias semanas para el arranque (certificados, órdenes,
  matrículas son datos que no se pueden regenerar).
- Probar la restauración periódicamente (no basta con que el backup
  "exista" — validar que se puede restaurar y que la app arranca contra la
  copia restaurada).
- Migraciones (`prisma migrate deploy`) siempre contra un backup reciente
  disponible; evitar migraciones destructivas sin ventana de rollback.

## 8. Monitoreo y logs (básico para el lanzamiento)

- **Logs**: `apps/api` y `apps/worker` escriben a stdout/stderr en formato
  estructurado (ver `apps/worker/src/lib/logger.ts` — JSON por línea);
  la plataforma elegida los recolecta (los logs de Render/Railway/Fly.io
  ya alcanzan para el lanzamiento; en la nube de un hyperscaler serían
  CloudWatch Logs/Azure Monitor/GCP Logging) sin cambios adicionales.
- **Métricas mínimas a vigilar**: latencia/errores 5xx de `apps/api`,
  profundidad y edad de los jobs en cada cola BullMQ (si `attendance-sync`
  o `certificate` empiezan a acumularse, algo está fallando río abajo:
  Graph, Storage o SMTP), conexiones activas a Postgres (vigilar el límite
  del pooler de Supabase), uso de memoria de los workers que corren
  puppeteer (picos durante generación masiva de certificados).
- **Alertas mínimas**: caída de `/health` de la API, cola con jobs
  fallidos por encima de un umbral, uso de conexiones/almacenamiento cerca
  del límite del plan de Supabase, tasa de fallo de webhooks de pago.
- **Errores de aplicación**: integrar un colector de excepciones (Sentry u
  equivalente) en `apps/api` y `apps/worker` antes del lanzamiento — no
  incluido en el stack base de este entregable, queda como tarea de
  Fase 1 tardía / Fase 2.

## 9. Checklist general de salida a producción

1. `pnpm install` + `pnpm prisma:generate` en CI, luego `pnpm build` de
   cada app y build de las imágenes Docker de `apps/api` y `apps/worker`
   (y de `apps/web` si se despliega en contenedor en vez de Vercel).
2. `prisma migrate deploy` (no `migrate dev`) contra la conexión **directa**
   de Supabase (puerto `5432`, sección 2.1), como paso de release previo a
   levantar las nuevas instancias.
3. Variables de entorno de producción cargadas desde el secret
   manager/vault de la plataforma, nunca desde `.env` committeado.
4. DNS y TLS (certificados) para `apps/web` y `apps/api` (automático en
   Vercel/Render/Railway/Fly; manual si se usa infraestructura propia).
5. Webhooks de Culqi/Stripe apuntando al dominio real y probados en modo
   live con un cargo mínimo real.
6. Azure AD App Registration con consentimiento de administrador otorgado
   (paso 3 del checklist de Graph, sección 5).
7. Backups automáticos de Supabase confirmados y una restauración de
   prueba ejecutada al menos una vez.
8. Logs y al menos una alerta básica (caída de `/health`, colas atascadas)
   configuradas antes de anunciar el lanzamiento.
