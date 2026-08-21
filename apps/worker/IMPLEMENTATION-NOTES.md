# Notas de implementación — apps/worker

## 1. Discrepancias / supuestos frente a `docs/API-CONTRACT.md`

`docs/API-CONTRACT.md` describe el contrato HTTP de `apps/api`, pero **no**
especifica los nombres de job (`job.name`) ni la forma de `job.data` que
`apps/api` encola en cada cola de BullMQ — eso se construyó en paralelo, así
que lo siguiente es una propuesta del lado worker, no un contrato ya
acordado. `src/queues.ts` documenta cada forma con comentarios; lo que
`apps/api` debe confirmar o ajustar:

- **Cola `email`**: se asume `job.data = { template, userId, toEmailFallback?, data }`
  donde `template` es uno de los 12 valores de `EmailTemplate` (ver
  `src/queues.ts` y `src/templates/email-templates.ts`). Si `apps/api`
  encola con nombres de plantilla distintos, hay que alinear esa lista.
- **Cola `certificate`**: se asume `job.name = "issue"` (aunque el processor
  no distingue por nombre, solo por cola) con `job.data = { enrollmentId, force? }`,
  disparado por `apps/api` cuando `ApprovalRule` se cumple (p.ej. tras
  `PATCH /me/lessons/:lessonId/progress` o `POST /attempts/:id/submit`).
- **Cola `reminder`**: se asumen dos `job.name`: `"schedule-enrollment-reminders"`
  (`{ enrollmentId }`, disparado tras crear el `Enrollment` — checkout o
  asignación de cupo B2B) y `"schedule-live-session-reminders"`
  (`{ liveSessionId }`, disparado al crear/reprogramar una `LiveSession`).
  El processor es idempotente vía `jobId` determinístico en los delayed
  jobs de `email`, así que reencolar no duplica recordatorios.
- **Cola `attendance-sync`**: `docs/API-CONTRACT.md` dice
  `POST /live-sessions/:id/sync-attendance` es "(admin/worker)" — se asumió
  que ese endpoint **encola** un job `{ liveSessionId }` en esta cola en vez
  de llamar a Graph directamente desde `apps/api`. Si `apps/api` decide
  llamar a Graph de forma síncrona en ese endpoint, esta cola quedaría solo
  para una sincronización programada (p.ej. cron post-clase) — el
  processor funciona igual en ambos casos, solo cambia quién lo dispara.
- **Cola `recommendation`**: se asumen `job.name = "course-completed"`
  (`{ userId, courseId, enrollmentId }`, tras completar/aprobar un curso) y
  `job.name = "company-assigned"` (`{ userId, companyId, courseId?, programId? }`,
  tras `POST /companies/:id/seat-pools/:poolId/assign`).
- **`Notification`**: `email.processor.ts` crea su propia fila `Notification`
  (status `PENDING` → `SENT`/`FAILED`) por cada job procesado. Si
  `apps/api` **también** crea la fila `Notification` antes de encolar,
  habría filas duplicadas — hay que decidir de qué lado vive esa
  responsabilidad (recomendado: que la cree quien encola, y que el worker
  solo la actualice si recibe un `notificationId` en `job.data`; no se
  implementó así para no adivinar de más un campo que no está en el
  contrato).
- **Certificado — descarga**: `GET /certificates/:id/pdf` "redirige a URL
  firmada del objeto en storage". El worker sube el PDF con la key
  `certificates/{code}.pdf` y guarda esa key en `Certificate.pdfAssetId` —
  `apps/api` debe generar el presigned URL usando esa misma key/bucket
  (`S3_BUCKET`).
- **Página de verificación**: se asumió que el frontend expone
  `${APP_URL}/verificar/{code}` (usado tanto en el QR como en el email de
  certificado emitido) contra el endpoint público
  `GET /certificates/verify/:code`. Confirmar con el equipo de `apps/web`
  que la ruta es exactamente `/verificar/:code`.

## 2. Algoritmo de hash de password usado en `prisma/seed.ts`

Se usó **`argon2`** (paquete `argon2`, el mismo que ya declara
`apps/api/package.json` como dependencia — `argon2@^0.40.3`), con
`argon2.hash("Demo1234!")` y las opciones por defecto del paquete
(algoritmo `argon2id`). No se referenció ningún parámetro de costo
específico porque **no hace falta que coincida** con lo que use
`apps/api`: los hashes de `argon2` son auto-descriptivos (el string
codificado incluye el algoritmo, versión y parámetros usados), así que
`argon2.verify(hash, password)` funciona sin importar con qué costo se
generó el hash originalmente.

**Pendiente de confirmar por el equipo de `apps/api`**: que su
`AuthService` efectivamente usa `argon2.verify()` (no `bcrypt`/`bcryptjs`)
para comparar contraseñas — si usa otra librería, los 5 usuarios demo no
van a poder loguearse hasta re-hashear. Se puede verificar rápido con:

```ts
import argon2 from "argon2";
await argon2.verify(user.passwordHash, "Demo1234!"); // debe ser true
```

## 3. Resolución de `@inkademy/db` en `prisma/seed.ts`

`prisma/seed.ts` importa con ruta relativa
(`import { prisma } from "../packages/db/src"`) en vez de
`import { prisma } from "@inkademy/db"`. Motivo: el script se ejecuta con
`tsx prisma/seed.ts` desde la **raíz** del repo, que no es un paquete del
workspace pnpm — un import "bare" como `@inkademy/db` solo resuelve si
algún `package.json` alcanzable desde ahí lo declara como dependencia, y el
`package.json` raíz no lo hace (a propósito, para no tocar
`packages/db`/`packages/shared` ni forzar un `pnpm install` adicional desde
este entregable). El import relativo siempre funciona porque `tsx` solo
necesita ubicar el archivo en disco; `packages/db/src/index.ts` sigue
resolviendo su propio `../generated` de forma relativa a sí mismo, así que
el cliente Prisma generado (una vez exista `packages/db/generated`, tras
`pnpm prisma:generate`) se encuentra igual. Si en algún momento se agrega
`@inkademy/db` como dependencia del `package.json` raíz, el import bare
también funcionaría — no hizo falta para este entregable.

`apps/worker` en cambio sí importa `@inkademy/db` y `@inkademy/shared` como
specifiers normales (`import { prisma } from "@inkademy/db"`), porque
`apps/worker/package.json` los declara como `workspace:*` — eso resuelve
sin problema una vez que `pnpm install` corra desde la raíz.

## 4. Qué falta para producción real en el worker

- **Sin tests automatizados**: no hay unit/integration tests para los
  processors (`apps/worker/package.json` deja el script `test` como
  placeholder). Antes de producción conviene al menos cubrir
  `certificate.processor.ts` (placeholders del template, cálculo de
  `finalScore`) y `reminder.processor.ts` (cálculo de fechas de envío).
- **Sin colector de errores** (Sentry o similar) — los fallos de job hoy
  solo quedan en logs de consola + el estado "failed" de BullMQ. Ver
  `docs/DEPLOYMENT.md`, sección de monitoreo.
- **Sin trabajo periódico de auto-reconciliación**: todo es
  event-driven (depende de que `apps/api` encole el job correspondiente).
  No hay un job repetible (cron de BullMQ) que, por ejemplo, re-escanee
  matrículas cuyo recordatorio nunca se programó, o vuelva a intentar
  certificados que quedaron sin PDF. Vale la pena agregarlo como red de
  seguridad.
- **Chromium/puppeteer en Alpine**: funciona, pero es sensible a memoria
  bajo alta concurrencia de generación de certificados y no incluye
  fuentes para todos los alfabetos (solo `ttf-freefont`); si se necesitan
  certificados con caracteres fuera de latín, agregar el paquete de fuentes
  correspondiente a `apps/worker/Dockerfile`.
- **Token de Microsoft Graph sin cache**: `getGraphAppToken()` pide un
  token nuevo en cada job de `attendance-sync`; a bajo volumen no importa,
  pero conviene cachear el token con su expiración si el volumen de
  sesiones en vivo crece.
- **Motor de recomendación simple**: reglas fijas, sin decaimiento de
  antigüedad ni tope de recomendaciones activas por usuario — suficiente
  para el lanzamiento (Fase 1), a mejorar en Fase 3 (ver
  `docs/PHASES.md`).
- **Sin manejo de revocación de certificado**: `Certificate.revoked` existe
  en el esquema pero ningún processor reacciona a que se marque `true`
  (p.ej. notificar al alumno) — no estaba en el alcance de este entregable.
- **Concurrencia de cada `Worker` fijada a mano** (`email:10`,
  `certificate:2`, `reminder:5`, `attendance-sync:3`, `recommendation:5` en
  `src/index.ts`) — son valores de partida razonables, no medidos contra
  carga real; ajustar una vez que haya tráfico.
