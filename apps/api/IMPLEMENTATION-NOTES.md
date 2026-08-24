# Implementation notes — apps/api

## 1. Endpoints del contrato no implementados o simplificados

Todos los endpoints listados en `docs/API-CONTRACT.md` quedaron implementados.
Lo que sigue son simplificaciones o comportamientos parciales que el equipo
debería conocer:

- **`POST /auth/register` / verificación de email**: el token de verificación
  se genera como un JWT stateless (propósito `verify_email`) y se encola por
  correo; agregué `GET /auth/verify-email?token=...` (no está en el contrato
  explícito) para completar el flujo, pero no hay reenvío de verificación ni
  bloqueo de funcionalidad para cuentas no verificadas — `emailVerifiedAt` se
  registra pero no se usa como gate en ninguna ruta.
- **`POST /auth/login` con body inválido**: la validación de `LoginInput` no
  pasa por `ZodValidationPipe` (Passport `LocalStrategy` lee `req.body`
  directamente *antes* de que los pipes de Nest corran — los guards se
  ejecutan antes que los pipes en el ciclo de vida de Nest). Si falta
  `email`/`password` el resultado es `401 Unauthorized` en vez de
  `400 Bad Request` con detalle de zod. Documentado, no corregido por tiempo.
- **`GET /catalog/sections`**: el schema no define un campo de curaduría
  manual (p.ej. `Course.featured`), así que `featured`/`mostDemanded` usan
  conteo de inscripciones como proxy, `new` usa `createdAt desc`,
  `upcomingLive` usa la próxima `LiveSession`, y `recommendedPaths` usa cursos
  referenciados en `nextRecommendedCourseIds` de otro curso. Ver
  `catalog.service.ts#getSections` para el detalle exacto.
- **Búsqueda por texto (`q`) en `/courses`**: `title`/`description` son
  columnas `Json` (`LocalizedText`), así que el filtro de texto libre solo
  compara contra el `slug` (no hay búsqueda full-text real dentro del JSON).
- **`GET /me/recommendations`**: lee la tabla `Recommendation` (poblada por
  el worker al procesar la cola `recommendation`). Si está vacía (usuario
  nuevo / worker no ha corrido aún), genera un fallback en caliente basado en
  `nextRecommendedCourseIds` de cursos completados y, si no hay nada, en
  coincidencia simple de `User.interests` contra el título del curso — no
  persiste ese fallback como filas `Recommendation`.
- **`/me/calendar` — CRUD adicional**: el contrato solo pide `GET /me/calendar`
  y `GET /me/calendar.ics`; agregué `POST/PATCH/DELETE /me/calendar` porque la
  descripción del módulo pide "CRUD CalendarEvent". No rompe el contrato, solo
  lo extiende.
- **Checkout — impuestos/descuentos**: `Order.tax` y `Order.discount` siempre
  quedan en `0`; no hay motor de impuestos ni cupones. `subtotal === total`.
- **Checkout con `companyId` sin `seatPoolQty`**: interpreté que la empresa
  paga directamente por una matrícula individual del comprador (no crea/usa
  un seat pool); la `Enrollment` resultante queda con `source: B2B_SEAT` y
  `companyId` seteado. Solo un `COMPANY_ADMIN` de esa empresa puede hacer
  checkout con `companyId`.
- **Webhook de Culqi**: Culqi no publica un esquema de verificación de firma
  tan estandarizado como Stripe (`stripe-signature` + secreto). El handler
  `POST /webhooks/culqi` parsea el payload asumiendo
  `{ id | data.id, type }` y considera éxito si `type` contiene
  `"succeeded"`/`"creation"` — **no verifica ninguna firma criptográfica**.
  Esto es un placeholder documentado; en producción habría que confirmar el
  mecanismo real de verificación con la cuenta de Culqi contratada.
- **`/live-sessions` — creación**: el contrato solo lista `GET .../join` y
  `POST .../sync-attendance`; agregué `POST /live-sessions` (ADMIN/TEACHER)
  porque sin un endpoint de creación no había forma de generar el `joinUrl`
  de Teams al "programar la LiveSession" (requisito del enunciado). No valida
  que el TEACHER llamante esté asignado como `CourseStaff` de ese curso
  específico — solo valida el `GlobalRole`.
- **`sync-attendance`**: el endpoint llama a Microsoft Graph de forma
  síncrona y además encola un job en la cola `attendance-sync` (para que el
  worker pueda re-sincronizar periódicamente sin depender de un trigger
  manual). Si `apps/worker` no tiene un processor para esa cola, el job queda
  simplemente pendiente en Redis sin efecto — no rompe el flujo síncrono.
- **`AssessmentAttempt` — selección aleatoria de preguntas**: el schema no
  tiene una tabla que registre qué subconjunto/orden de preguntas se le
  mostró a un alumno en un intento específico. `GET /assessments/:id` calcula
  el subconjunto/orden en cada llamada (no es determinístico ni se persiste),
  así que un alumno que recarga la página durante un intento puede ver un
  orden/subset distinto. Documentado como limitación conocida.
- **Preguntas `SHORT_ANSWER`**: siempre quedan en `PENDING_REVIEW` (no hay
  autocorrección por comparación de texto), igual que `OPEN`.
- **`AttemptStatus.GRADED`**: el enum lo define pero el flujo implementado
  solo usa `IN_PROGRESS → PENDING_REVIEW | PASSED | FAILED` (nunca `GRADED`
  como estado intermedio persistido).
- **Reportes B2B (`/companies/:id/reports`)**: la asistencia (`attendancePct`)
  no se incluye en el reporte por alumno/curso (sí se usa internamente para
  `approvalMissing` y para elegibilidad de certificado); el reporte expone
  `progressPct` y `bestScore`. Ampliarlo es straightforward si se necesita.
- **Invitación a empresa (`POST /companies/:id/members/invite`)**: si el
  usuario no existe, se crea con `passwordHash: null` (sin contraseña). No
  implementé un flujo de "define tu contraseña" con link dedicado — el nuevo
  usuario debe pasar por `POST /auth/forgot-password` o loguearse por
  OAuth (Google/Microsoft) con el mismo correo para poder acceder.
- **DTOs de Swagger**: se documentaron con `@nestjs/swagger` (`@ApiTags`,
  `@ApiOperation`, `@ApiBearerAuth`) en todas las rutas, y con clases
  `@ApiProperty` completas para `auth`. Para reducir alcance, varios
  endpoints (companies, admin, commerce, live-session) no tienen una clase de
  respuesta tipada exhaustiva en Swagger — Swagger seguirá listando la ruta,
  método, tags y descripción, pero el schema de respuesta no siempre está
  100% detallado.
- **CRUD de catálogo admin (`/admin/courses`, `/admin/programs`, `/admin/areas`)**:
  los payloads se validan con esquemas zod locales (`upsertCourseSchema`,
  etc.) pero se castean con `as never` al llamar a Prisma para evitar tener
  que mapear manualmente cada campo `Decimal`/`Json`. Funcionalmente
  correcto, pero sin el mismo nivel de type-safety end-to-end que el resto
  del código.

## 2. Colas y jobs de BullMQ — contrato con `apps/worker`

Definidos en `src/common/queues/queue.constants.ts`. **El worker debe
registrar processors con estos nombres exactos** (cola → job):

| Cola | Job | Payload | Encolado desde |
|---|---|---|---|
| `email` | `email.welcome` | `{to, subject, html, meta?}` | `AuthService.register` |
| `email` | `email.verify-email` | `{to, subject, html, meta:{token}}` | `AuthService.register` |
| `email` | `email.forgot-password` | `{to, subject, html, meta:{token}}` | `AuthService.forgotPassword` |
| `email` | `email.receipt` | `{to, subject, html, meta:{orderId}}` | `CommerceService` (checkout/webhooks exitosos) |
| `email` | `email.company-invite` | `{to, subject, html}` | `CompaniesService.inviteMember` |
| `email` | `email.certificate-ready` | `{to, subject, html}` | `CertificateService.checkAndIssueIfEligible` |
| `email` | `email.support-ticket-update` | `{to, subject, html}` | `SupportService.addMessage` (respuesta de staff) |
| `certificate` | `certificate.generate` | `{certificateId}` | `CertificateService` al cumplirse la `ApprovalRule` — el worker debe generar el PDF, subirlo a S3/MinIO y actualizar `Certificate.pdfAssetId`/`qrUrl` |
| `reminder` | `reminder.live-session-upcoming`, `reminder.course-access-expiring`, `reminder.assessment-due` | — | **Definidos pero NO encolados todavía** desde la API (ver sección 3) — quedan reservados para que el worker los dispare vía cron/scheduler propio, o para que un futuro job periódico en la API los encole |
| `attendance-sync` | `attendance-sync.sync-live-session` | `{liveSessionId}` | `LiveSessionService.syncAttendance` (además de sincronizar síncronamente en el mismo request) |
| `recommendation` | `recommendation.regenerate-for-user` | `{userId}` | `EnrollmentService.updateLessonProgress` (cada vez que progresa una lección) — el worker debería recalcular y escribir filas en `Recommendation` |
| `invoice` | `invoice.generate` | `{invoiceId}` | `CommerceService.finalizeOrderPaid` (siempre que una orden pasa a PAID y `order.total > 0` — se omite por completo en cursos gratuitos). El worker arma el XML UBL 2.1, lo firma y lo envía a SUNAT (o lo simula si no hay credenciales), y actualiza `ElectronicInvoice.status/xml/cdrXml/sunatResponseCode` |
| `invoice` | `invoice.generate-note` | `{noteId}` | `CommerceService.cancelOrder` (ADMIN/SUPPORT cancela una orden PAID → reembolsa vía el proveedor original y crea una `ElectronicNote` tipo CREDIT). Comparte cola con `invoice.generate` (mismo dominio SUNAT); el worker despacha por nombre de job — ver `apps/worker/src/index.ts` |

Todas las colas se registran globalmente en `QueuesModule`
(`src/common/queues/queues.module.ts`, `@Global()`), leyendo `REDIS_URL`.

## 3. Decisiones de diseño relevantes

- **Multi-tenancy**: todo endpoint bajo `/companies/:companyId/*` pasa por
  `CompanyGuard` (`src/common/guards/company.guard.ts`), que verifica una
  `CompanyMembership` con `status=ACTIVE` para el usuario autenticado (o
  bypass si `globalRole` es `ADMIN`/`SUPPORT`, para soporte operativo) y
  adjunta `req.companyMembership`. Las acciones que requieren específicamente
  `COMPANY_ADMIN` usan el decorador adicional `@CompanyRoles('COMPANY_ADMIN')`.
  Todas las queries de servicio de `companies.service.ts` filtran
  explícitamente por `companyId`.
- **Tokens de propósito único (verify-email / reset-password)** son JWT
  stateless firmados con `JWT_ACCESS_SECRET` y un claim `purpose`, en vez de
  persistir una tabla de tokens (el schema no define una) — más simple, sin
  estado adicional, con el trade-off de no poder invalidar un token individual
  antes de su expiración (si se necesitara revocación, habría que agregar una
  tabla `PasswordResetToken`).
- **`PrismaModule` envuelve el singleton exportado por `@inkademy/db`** (no
  crea una segunda conexión) y se expone como provider `@Global()` bajo el
  token `PRISMA`, inyectado como `@Inject(PRISMA) prisma: PrismaClient` en
  todos los servicios.
- **`ZodValidationPipe<T>`** es genérico y envuelve cualquier `ZodSchema`;
  los esquemas de `@inkademy/shared` se reusan tal cual, y los que el
  contrato no cubre (forgot/reset password, progreso de lección, filtros de
  catálogo, CRUD de admin, etc.) viven en
  `src/common/validation/local-schemas.ts` (nunca se tocó
  `packages/shared`).
- **Certificación**: `CertificateService.checkAndIssueIfEligible(enrollmentId)`
  es el punto único donde se evalúa la `ApprovalRule` de un curso (progreso,
  asistencia si el curso tiene sesiones en vivo, mejor nota de evaluación,
  tarea calificada si `requiresAssignment`). Se llama desde
  `EnrollmentService.updateLessonProgress`, `AssessmentService.submitAttempt`
  y `AssessmentService.gradeAnswer` — los tres puntos donde alguno de esos
  criterios puede cambiar. Si se cumple, crea la fila `Certificate` (con
  `criteriaSnapshot` para trazabilidad) y encola `certificate.generate` para
  que el worker genere el PDF real; `pdfAssetId` queda `null` hasta entonces
  y `GET /certificates/:id/pdf` responde 404 mientras tanto.
- **`TeamsProvider` en modo simulado**: si `MS_TENANT_ID`/`MS_CLIENT_ID`/
  `MS_CLIENT_SECRET` no están configurados, `createMeeting` genera
  `providerMeetingId` con prefijo `simulated-` y un `joinUrl` placeholder,
  registrando un `logger.warn`. `getAttendanceReport` detecta ese prefijo y
  devuelve `[]` sin llamar a Graph. Esto permite levantar toda la API en dev
  sin un tenant de Azure AD real.
- **Adapters de pago**: `PaymentProvider` es la interfaz común
  (`charge(params): Promise<ChargeResult>`); `CulqiProvider` llama directo al
  REST de Culqi (`POST /v2/charges`) y `StripeProvider` usa el SDK oficial
  con `paymentIntents.create({..., confirm:true})`. Ambos degradan a "cobro
  simulado siempre exitoso" si no hay secret key configurada — útil para
  probar el flujo de matrícula en dev sin cuentas reales de pago. **Nunca se
  persiste un número de tarjeta**: solo se recibe y reenvía el
  `paymentMethodToken` generado por el SDK del proveedor en el cliente.
  `PAYPAL` está en el enum `PaymentProviderType` del schema pero no tiene
  adapter — seleccionar `PAYPAL` en el checkout responde `400`.
- **`finalizeOrderPaid` es idempotente**: tanto el flujo síncrono del
  checkout como los webhooks (`/webhooks/stripe`, `/webhooks/culqi`) llaman al
  mismo método; si la orden ya está `PAID` no se duplican matrículas ni
  seat pools.
- **Las 5 reglas de excepción de `/admin/exceptions`** se calculan 100% desde
  la base de datos (sin datos hardcodeados) — ver `admin.service.ts#getExceptions`
  para el query exacto de cada una: pagos exitosos sin orden `PAID`, alumnos
  con acceso vencido/por vencer antes de una clase en vivo en las próximas
  48h, cursos publicados sin `TEACHER` asignado, seat pools B2B con cupos sin
  usar que vencen en 30 días, e intentos de evaluación `PENDING_REVIEW`.
- **Tests (`apps/api/test/*.e2e-spec.ts`)**: usan Prisma mockeado
  (`test/utils/mock-prisma.ts`) y colas BullMQ mockeadas
  (`test/utils/mock-queue.ts`) en vez de una base de datos real, para poder
  correr sin `docker compose up postgres redis`. Cubren `auth` (registro,
  duplicado, `/me` sin token), `checkout` (401/400/happy path con Culqi
  simulado) y `assessment` (preguntas sin `correctAnswer`, creación de
  intento, envío con autocorrección). Para e2e contra Postgres real, exportar
  `DATABASE_URL_TEST` y sustituir el mock por el cliente real de
  `@inkademy/db` apuntando a esa URL.
