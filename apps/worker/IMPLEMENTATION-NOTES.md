# Notas de implementación — apps/worker

## 1. Contrato con `apps/api`: qué se confirmó y qué quedó como decisión del worker

`apps/api` terminó de implementarse en paralelo a este entregable y deja
`apps/api/src/common/queues/queue.constants.ts` como fuente de verdad de
nombres de cola/job, con el comentario explícito de que el worker debe
usarlos igual. Se leyó ese archivo y los servicios que efectivamente
encolan (`notification.service.ts`, `certificate.service.ts`,
`enrollment.service.ts`, `live-session.service.ts`, `calendar.service.ts`,
`commerce.service.ts`, `companies.service.ts`) y se ajustó `src/queues.ts`
para que coincida EXACTO con eso, en vez de con la primera versión de este
entregable (que era una propuesta razonable pero escrita antes de que
`apps/api` existiera). Resumen de lo confirmado y lo que se decidió del
lado worker:

- **Cola `email`**: `apps/api` (`NotificationService.enqueueEmail`) encola
  con el HTML **ya renderizado** — `{ to, subject, html, text?, meta? }` —
  y con 8 nombres de job (`email.welcome`, `email.verify-email`,
  `email.forgot-password`, `email.receipt`, `email.company-invite`,
  `email.certificate-ready`, `email.support-ticket-update`,
  `email.generic`). El worker **no** los renderiza, solo los envía por SMTP
  (`email.processor.ts` es agnóstico al `job.name`, solo necesita
  `to/subject/html`). Los 5 correos que el enunciado original pedía y que
  `apps/api` no cubre — recordatorio de inicio de curso, recordatorio de
  clase en vivo, recordatorio de examen/vencimiento, aviso de inasistencia
  y recomendación de curso — los produce **el propio worker** (mismo
  namespace `email.*`, mismo shape) desde `reminder`/`attendance-sync`/
  `recommendation` processors vía `src/lib/notify.ts`.
  - **Gap conocido**: el job que encola `apps/api` no incluye un
    `notificationId`, aunque `NotificationService` sí crea la fila
    `Notification` antes de encolar. `email.processor.ts` intenta
    actualizarla a `SENT`/`FAILED` con un best-effort (busca la más
    reciente en `PENDING` para ese `userId`+`template`) — funciona en el
    caso normal pero no es 100% robusto ante concurrencia. Si esto importa
    en producción, la mejora correcta es que `apps/api` agregue
    `notificationId` al payload (fuera del alcance de este entregable:
    no se tocó `apps/api`).
- **Cola `certificate`**: confirmado `job.name = "certificate.generate"`,
  `job.data = { certificateId }`. `apps/api`
  (`CertificateService.checkAndIssueIfEligible`) ya crea la fila
  `Certificate` completa (`finalScore`, `criteriaSnapshot`) **y ya envía**
  el correo "certificate-ready" (con la URL de verificación, sin esperar el
  PDF) antes de encolar — el worker solo genera el PDF+QR y llena
  `pdfAssetId`/`qrUrl`. Se ajustó la URL de verificación para usar
  `API_URL` (no `APP_URL`) y el path `/certificates/verify/{code}`,
  exactamente como `CertificateService.verificationUrl()` — antes este
  entregable asumía una página de frontend en `APP_URL/verificar/{code}`,
  que era incorrecto frente al código real.
- **Cola `attendance-sync`**: confirmado `job.name =
  "attendance-sync.sync-live-session"`, `job.data = { liveSessionId }` —
  coincide con lo que ya se había asumido. Se confirmó además que
  `apps/api` (`LiveSessionService.syncAttendance`) hace la sincronización
  de forma síncrona en el endpoint admin **y además** encola este mismo
  job "para que el worker pueda re-sincronizar periódicamente" (comentario
  textual en su código) — el worker repite la misma lógica de forma
  independiente, lo cual es intencional (red de seguridad, no
  duplicación de esfuerzo problemática) y además envía el aviso de
  inasistencia, que `apps/api` no envía.
- **Cola `recommendation`**: confirmado `job.name =
  "recommendation.regenerate-for-user"`, `job.data = { userId }` — más
  simple que lo asumido originalmente (`{ userId, courseId, enrollmentId }`).
  Se encola desde `EnrollmentService.updateLessonProgress` en **cada**
  actualización de progreso, así que el processor recalcula todas las
  reglas del usuario de punta a punta (no un curso puntual) y es
  idempotente. La regla (c) "asignado por empresa" **no** tiene un job
  dedicado del lado `apps/api` (`CompaniesService.assignSeat` no encola
  nada a `recommendation`) — el worker la deriva revisando
  `Enrollment.source = "B2B_SEAT"` del usuario contra las
  `Recommendation` ya existentes. Es una inferencia razonable pero es una
  decisión del worker, no algo confirmado en el código de `apps/api`.
- **Cola `reminder`**: `apps/api` define los 3 nombres
  (`reminder.live-session-upcoming`, `reminder.course-access-expiring`,
  `reminder.assessment-due`) en `queue.constants.ts` pero **no hay ningún
  código que los encole todavía** (se confirmó con
  `grep -rn "REMINDER_JOBS" apps/api/src` — solo aparece en el archivo de
  constantes). `apps/api` sí crea los `CalendarEvent` directamente
  (`CalendarService.scheduleForEnrollment`, llamado desde
  `CommerceService`/`CompaniesService`) pero nunca encola algo que dispare
  un correo en el momento correcto. Para que estos recordatorios existan
  de verdad, el worker se autoprograma un 4° job interno,
  **`reminder.sweep`** (no forma parte del contrato de `apps/api`, es un
  detalle interno), repetible cada 15 minutos (`src/index.ts`), que escanea
  `LiveSession`/`Enrollment`/`Assessment` y termina generando los 3 jobs
  reales como *delayed jobs* con `jobId` determinístico (evita duplicados
  entre corridas del sweep). Si en el futuro `apps/api` empieza a encolar
  estos 3 jobs directamente (p.ej. desde `CalendarService`), el worker los
  seguiría procesando igual — el sweep y el encolado directo no son
  mutuamente excluyentes, solo redundantes (y BullMQ los dedupea por
  `jobId` si se usa la misma convención).

## 2. Algoritmo de hash de password usado en `prisma/seed.ts`

Se usó **`argon2`** (paquete `argon2`, el mismo que `apps/api/package.json`
declara como dependencia — `argon2@^0.40.3`, y que efectivamente se usa: ver
`apps/api/src/modules/auth/auth.service.ts`), con
`argon2.hash("Demo1234!")` y las opciones por defecto (`argon2id`). No
importa que los parámetros de costo no coincidan exactamente con los que
use `apps/api` al hashear registros nuevos: los hashes de `argon2` son
auto-descriptivos (el string codificado incluye algoritmo, versión y
parámetros), así que `argon2.verify(hash, password)` funciona sin
importar con qué costo se generó el hash originalmente. Confirmado por
lectura directa de `auth.service.ts` que usa `argon2.hash`/`argon2.verify`
— no hace falta pedirle al equipo de `apps/api` que lo revise, ya se
verificó que usan la misma librería.

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
`pnpm prisma:generate`) se encuentra igual.

`apps/worker` en cambio sí importa `@inkademy/db` como specifier normal
(`import { prisma } from "@inkademy/db"`), porque
`apps/worker/package.json` lo declara como `workspace:*` — eso resuelve
sin problema una vez que `pnpm install` corra desde la raíz.

## 4. Qué falta para producción real en el worker

- **Sin tests automatizados**: no hay unit/integration tests para los
  processors (`apps/worker/package.json` deja el script `test` como
  placeholder). Antes de producción conviene al menos cubrir
  `certificate.processor.ts` (placeholders del template) y
  `reminder.processor.ts` (cálculo de fechas de envío y dedup del sweep).
- **Correlación `Notification` best-effort** (ver sección 1) — no es
  crítico (el envío de correo no depende de ella), pero conviene resolverlo
  del lado `apps/api` agregando `notificationId` al payload.
- **Sin colector de errores** (Sentry o similar) — los fallos de job hoy
  solo quedan en logs de consola + el estado "failed" de BullMQ. Ver
  `docs/DEPLOYMENT.md`, sección de monitoreo.
- **Sweep de recordatorios sin límite de escala probado**: `sweepAssessmentDue()`
  itera cursos × matrículas activas cada 15 minutos — a la escala de
  lanzamiento (cientos/miles de matrículas) es trivial, pero si crece mucho
  conviene paginar o mover la lógica a una consulta más agregada.
- **Chromium/puppeteer en Alpine**: funciona, pero es sensible a memoria
  bajo alta concurrencia de generación de certificados y no incluye
  fuentes para todos los alfabetos (solo `ttf-freefont`); si se necesitan
  certificados con caracteres fuera de latín, agregar el paquete de fuentes
  correspondiente a `apps/worker/Dockerfile`.
- **Token de Microsoft Graph sin cache**: `getGraphAppToken()` pide un
  token nuevo en cada job de `attendance-sync`; a bajo volumen no importa,
  pero conviene cachear el token con su expiración si el volumen de
  sesiones en vivo crece.
- **Regla `company_assigned` inferida, no confirmada**: como se explica en
  la sección 1, se deriva de `Enrollment.source = "B2B_SEAT"` porque
  `apps/api` no encola nada dedicado a esto. Si el equipo de `apps/api`
  decide en el futuro encolar un job explícito para esta regla, hay que
  quitar la inferencia para no duplicar `Recommendation` con distinta
  proveniencia.
- **Sin manejo de revocación de certificado**: `Certificate.revoked` existe
  en el esquema pero ningún processor reacciona a que se marque `true`
  (p.ej. notificar al alumno) — no estaba en el alcance de este entregable.
- **Concurrencia de cada `Worker` fijada a mano** (`email:10`,
  `certificate:2`, `reminder:5`, `attendance-sync:3`, `recommendation:5` en
  `src/index.ts`) — son valores de partida razonables, no medidos contra
  carga real; ajustar una vez que haya tráfico.
