# @inkademy/worker

Procesos en background de Inkademy. Consume colas de [BullMQ](https://docs.bullmq.io/)
sobre Redis; no expone ningún puerto HTTP.

## Cómo correr en local

```bash
# desde la raíz del monorepo, con .env ya configurado y postgres/redis/minio/mailhog arriba
pnpm --filter @inkademy/worker dev
```

Requiere que `packages/db/generated` exista (`pnpm prisma:generate` desde la raíz)
y que `REDIS_URL` / `DATABASE_URL` apunten a servicios corriendo (ver
`docker compose up -d postgres redis minio mailhog` desde la raíz, o el stack
completo con `pnpm docker:up`).

`pnpm --filter @inkademy/worker build` compila a `dist/`; `pnpm --filter @inkademy/worker start`
corre la versión compilada (lo que hace el `Dockerfile` en producción).

## Colas que consume

Los 5 nombres de cola coinciden EXACTO con
`apps/api/src/common/queues/queue.constants.ts` (se mirror-ean en
`src/queues.ts`, que es la fuente de verdad del lado worker):

| Cola | Processor | Qué hace |
|---|---|---|
| `email` | `src/processors/email.processor.ts` | Envía el correo (SMTP/Mailhog en dev). El HTML ya viene renderizado por quien encoló el job — `apps/api` para los correos "de negocio" (bienvenida, matrícula, recibo, invitación, certificado listo, soporte), o el propio worker para los que solo él puede saber cuándo mandar (recordatorios, inasistencia, recomendación). |
| `certificate` | `src/processors/certificate.processor.ts` | Dado un `certificateId` (la fila `Certificate` ya la creó `apps/api` cuando se cumple la `ApprovalRule`), genera el QR + renderiza el HTML de la `CertificateTemplate` + PDF con puppeteer, lo sube a S3/MinIO y actualiza `pdfAssetId`/`qrUrl`. |
| `reminder` | `src/processors/reminder.processor.ts` | Un job interno (`reminder.sweep`, programado cada 15 min desde `src/index.ts`) escanea `LiveSession`/`Enrollment`/`Assessment` y programa (delayed jobs, con `jobId` determinístico para no duplicar) los recordatorios reales: inicio de curso (7d/24h), clase en vivo (1h/10min) y vencimientos de acceso/examen (3d/24h). Cuando cada delayed job vence, envía el correo correspondiente. |
| `attendance-sync` | `src/processors/attendance-sync.processor.ts` | Dado un `liveSessionId`, llama a Microsoft Graph por el reporte de asistencia y puebla `Attendance` (repite lo que `apps/api` ya hace de forma síncrona en `POST /live-sessions/:id/sync-attendance`, para poder re-sincronizar sin depender de que alguien dispare ese endpoint) y envía el aviso de inasistencia con link a la grabación. |
| `recommendation` | `src/processors/recommendation.processor.ts` | Dado un `userId`, recalcula TODAS las reglas de recomendación para ese usuario (siguiente curso de programa, mismo área con nivel superior, asignado por empresa) y escribe `Recommendation`. |

Ver `src/queues.ts` para el detalle exacto de cada `job.name` y su
`job.data`, y `IMPLEMENTATION-NOTES.md` sección 1 para lo que se confirmó
contra el código real de `apps/api` versus lo que quedó como decisión
propia del worker (el sweep de `reminder`, la regla de `company_assigned`,
etc).

## Variables de entorno relevantes

Las mismas de `.env.example` en la raíz: `DATABASE_URL`, `REDIS_URL`,
`SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM`,
`S3_ENDPOINT`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/`S3_FORCE_PATH_STYLE`/`S3_PUBLIC_BASE_URL`,
`MS_TENANT_ID`/`MS_CLIENT_ID`/`MS_CLIENT_SECRET`/`MS_TEAMS_ORGANIZER_UPN`,
`APP_URL` (páginas del frontend, usadas en los links de los correos) y
`API_URL` (usado para la URL de verificación de certificados, igual que en
`apps/api`).

Si las credenciales de Microsoft Graph no están configuradas, el processor de
`attendance-sync` no falla: registra un log y omite la sincronización.

## Notas de implementación

Ver `IMPLEMENTATION-NOTES.md` para lo que se confirmó contra el código real
de `apps/api` (colas, jobs, contrato de email/certificado), el algoritmo de
hash de password usado en el seed, y qué falta para producción real.
