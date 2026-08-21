# Despliegue — de docker-compose local a producción

Este documento describe cómo pasar del stack local (`docker-compose.yml`,
raíz) a un entorno de producción, servicio por servicio, sin cambiar de
motor ni de esquema en ningún componente.

## 1. Mapa local → producción

| Local (docker-compose) | Producción | Cambia código? |
|---|---|---|
| `postgres` (contenedor `postgres:16-alpine`) | Postgres administrado: **RDS** (AWS), **Cloud SQL** (GCP) o **Azure Database for PostgreSQL** | No — mismo motor (PostgreSQL), mismo `prisma/schema.prisma`. Solo cambia `DATABASE_URL`. |
| `redis` (contenedor `redis:7-alpine`) | Redis administrado: **ElastiCache**, **Azure Cache for Redis**, **Upstash** | No — solo cambia `REDIS_URL` (usar TLS: `rediss://`). |
| `minio` | **S3** (AWS), **Azure Blob Storage** (vía su API compatible S3 o adaptador), **GCS** (vía interoperabilidad S3) | No — el código usa el SDK S3 (`@aws-sdk/client-s3`) contra `S3_ENDPOINT`; solo cambian las variables `S3_*`. |
| `mailhog` | Proveedor SMTP transaccional real (SES, SendGrid, Postmark, Resend...) | No — se sigue hablando SMTP; cambian `SMTP_HOST/PORT/USER/PASS` y `EMAIL_FROM`. |
| `api`, `worker`, `web` (build local) | Mismas imágenes Docker (`apps/*/Dockerfile`) desplegadas en el orquestador elegido (ECS/Fargate, Cloud Run, AKS/EKS/GKE, App Service) | No — mismos Dockerfiles multistage; solo cambia dónde corren y sus variables de entorno. |

## 2. Variables de entorno obligatorias en producción

Adicionales o distintas a `.env.example` (que está pensado para dev):

- `NODE_ENV=production`
- `DATABASE_URL` — cadena del Postgres administrado, con `sslmode=require`.
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
  apuntando al bucket real (o el endpoint S3-compatible del proveedor).
- `SMTP_HOST/PORT/SECURE/USER/PASS` y `EMAIL_FROM` del proveedor real.
- `PUPPETEER_EXECUTABLE_PATH` — ya fijado en `apps/worker/Dockerfile` al
  Chromium instalado vía `apk` (no depende de descarga en runtime).

Todos los secretos (JWT, client secrets, API keys de pago) deben vivir en el
secret manager del proveedor (AWS Secrets Manager/Parameter Store, Azure Key
Vault, GCP Secret Manager) y montarse como variables de entorno en el
momento del deploy — nunca committeados ni embebidos en la imagen.

## 3. Checklist: Azure AD App Registration (Microsoft Graph / Teams)

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

## 4. Checklist: pasarelas de pago en modo live

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

## 5. Backups de PostgreSQL

- Usar los backups automáticos del proveedor administrado (snapshots
  diarios + point-in-time recovery cuando esté disponible — RDS/Cloud
  SQL/Azure Database for PostgreSQL lo ofrecen de forma nativa).
- Retención mínima recomendada: 7–14 días de PITR + snapshots semanales con
  retención de varias semanas para el arranque (certificados, órdenes,
  matrículas son datos que no se pueden regenerar).
- Probar la restauración periódicamente (no basta con que el backup
  "exista" — validar que se puede restaurar y que la app arranca contra la
  copia restaurada).
- Migraciones (`prisma migrate deploy`) siempre contra un backup reciente
  disponible; evitar migraciones destructivas sin ventana de rollback.

## 6. Monitoreo y logs (básico para el lanzamiento)

- **Logs**: `apps/api` y `apps/worker` escriben a stdout/stderr en formato
  estructurado (ver `apps/worker/src/lib/logger.ts` — JSON por línea);
  el orquestador los recolecta (CloudWatch Logs, Azure Monitor, GCP
  Logging, o un stack self-hosted como Loki) sin cambios adicionales.
- **Métricas mínimas a vigilar**: latencia/errores 5xx de `apps/api`,
  profundidad y edad de los jobs en cada cola BullMQ (si `attendance-sync`
  o `certificate` empiezan a acumularse, algo está fallando río abajo:
  Graph, S3 o SMTP), conexiones activas a Postgres, uso de memoria de los
  workers que corren puppeteer (picos durante generación masiva de
  certificados).
- **Alertas mínimas**: caída de `/health` de la API, cola con jobs
  fallidos por encima de un umbral, espacio libre en el volumen de Postgres,
  tasa de fallo de webhooks de pago.
- **Errores de aplicación**: integrar un colector de excepciones (Sentry u
  equivalente) en `apps/api` y `apps/worker` antes del lanzamiento — no
  incluido en el stack base de este entregable, queda como tarea de
  Fase 1 tardía / Fase 2.

## 7. Checklist general de salida a producción

1. `pnpm install` + `pnpm prisma:generate` en CI, luego `pnpm build` de
   cada app y build de las 3 imágenes Docker (`apps/api`, `apps/web`,
   `apps/worker`).
2. `prisma migrate deploy` (no `migrate dev`) contra la base de producción,
   como paso de release previo a levantar las nuevas instancias.
3. Variables de entorno de producción cargadas desde el secret manager,
   nunca desde `.env` committeado.
4. DNS y TLS (certificados) para `apps/web` y `apps/api`.
5. Webhooks de Culqi/Stripe apuntando al dominio real y probados en modo
   live con un cargo mínimo real.
6. Azure AD App Registration con consentimiento de administrador otorgado
   (paso 3 del checklist de Graph arriba).
7. Backups automáticos de Postgres confirmados y una restauración de
   prueba ejecutada al menos una vez.
8. Logs y al menos una alerta básica (caída de `/health`, colas atascadas)
   configuradas antes de anunciar el lanzamiento.
