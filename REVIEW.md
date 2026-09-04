# Revisión a fondo del monorepo Inkademy

> **Estado (2026-09-04): todos los hallazgos Crítico/Alto/Medio de este documento, y todo lo Bajo salvo 3 ítems explícitamente marcados "no priorizar" (4.16, 4.17, 4.18), ya están implementados y verificados** — 4 commits en `main` (seguridad, calidad de código, rendimiento, UX/diseño), cada uno citando exactamente qué hallazgos resuelve. Este documento se conserva tal cual quedó escrito el día de la auditoría, como registro histórico de lo encontrado — no se reescribió para "ya no admitir" los problemas, cada hallazgo sigue describiendo el bug real tal como se vio esa vez.

Fecha: 2026-09-03 · Alcance: `apps/api` (NestJS), `apps/web` (Next.js 14), `apps/worker` (BullMQ), `packages/shared`, `packages/db` (Prisma) — código en `main`, no un diff puntual.

Método: 4 auditorías independientes en paralelo (calidad/bugs, seguridad, diseño/UX, rendimiento), cada una con lectura completa de los módulos relevantes y grep dirigido. Los hallazgos se citan con `archivo:línea` exacto. Cuando dos auditorías tocaron el mismo problema desde ángulos distintos, se referencia cruzado en vez de duplicar.

**Resumen**: 5 críticos, 15 altos, 15 medios, ~15 bajos. El más urgente de todos es el **#1 (nota de examen mal calculada)** — es un bug de negocio activo, no una vulnerabilidad teórica: certificados se están emitiendo hoy con notas infladas en cualquier examen enviado incompleto.

---

## Cómo priorizar (antes de leer el detalle)

| # | Hallazgo | Dimensión | Por qué primero |
|---|---|---|---|
| 1 | Nota de examen calculada solo sobre preguntas respondidas | Calidad | Corrompe certificados reales, ya en producción de datos, sin necesitar ataque |
| 2 | `Order`/`Payment` sin índices | Rendimiento | Barato de arreglar, degrada linealmente con cada venta |
| 3 | Login OAuth sin `state` (CSRF de login) | Seguridad | Compromete cuentas de usuarios reales |
| 4 | `checkout()` sin try/catch en Culqi | Calidad+Seguridad | Órdenes huérfanas, dinero sin conciliar |
| 5 | N+1 en "Mis cursos" (alumno) | Rendimiento | Pantalla más visitada de la plataforma |

---

## 1. Calidad de código y bugs

### 🔴 Crítico

**1.1 — La nota de un examen se calcula solo contra las preguntas respondidas, no contra el examen completo**
`apps/api/src/modules/assessment/assessment.service.ts:327-328,366`
```ts
const questionIds = input.answers.map((a) => a.questionId);
const questions = await this.prisma.question.findMany({ where: { id: { in: questionIds } } });
...
const maxPoints = questions.reduce((sum, q) => sum + q.points, 0) || 1;
```
`maxPoints` sale de `questions` (solo las preguntas presentes en `input.answers`), no de `attempt.assessment.questions` (el examen completo) — a diferencia de `gradeAnswer` (línea 779), que sí usa el examen completo. El schema Zod solo exige `.min(1)` en `answers`, sin verificar que sean *todas*.

**Escenario real, sin ataque**: examen de 10 preguntas de 10 pts (máx. 100). El timer del frontend auto-envía el intento al agotarse el tiempo (`apps/web/src/components/campus/AssessmentRunner.tsx:413-427`, línea 436 solo serializa lo respondido). Un alumno que solo alcanzó a contestar 2 preguntas (ambas correctas) antes de que se acabe el tiempo obtiene `(20/20)*100 = 100%` → `PASSED` → certificado emitido. También es trivialmente forzable enviando 1 sola respuesta fácil por POST directo; el frontend no bloquea "Enviar" con preguntas faltantes.

**Fix**: calcular `maxPoints` desde `attempt.assessment.questions` (el examen completo), igual que `gradeAnswer`, y considerar 0 puntos para cualquier pregunta sin respuesta en `input.answers`.

**1.2 — Diapositivas SCORM sin `sectionId` desaparecen silenciosamente del cálculo de nota**
`packages/shared/src/scorm-authoring.ts:1007-1026`
Cuando un paquete usa secciones ponderadas, `computeScore()` solo suma preguntas cuyo `sectionId` coincide con alguna sección definida. Una pregunta agregada después sin sección asignada (p. ej. un docente edita un SCORM ya publicado y olvida asignar sección) no cuenta ni como acierto ni como total — el alumno puede responderla mal sin que afecte su nota, sin ningún aviso al autor de que "esa pregunta no cuenta". *(Clasificado como Medio por el agente de calidad dado que requiere una edición de contenido específica para disparase; se eleva aquí por el impacto en integridad de notas, coherente con 1.1.)*

### 🟠 Alto

**1.3 — `CulqiProvider.charge()`/`refund()` sin try/catch, a diferencia de Stripe y PayPal**
`apps/api/src/modules/commerce/providers/culqi.provider.ts:22-53,88-113`
Stripe y PayPal envuelven su `fetch` y devuelven `{success:false, failureMessage}` ante cualquier fallo; Culqi llama `fetch(...)` directo — si Culqi tiene un problema transitorio de red/DNS/TLS, la excepción se propaga sin control.

**Escenario**: `CommerceService.checkout()` (`commerce.service.ts:256-263`, ver también 1.4) no envuelve `provider.charge(...)` en try/catch. La `Order` ya se creó como `PENDING` antes del cargo — si Culqi falla por red, la excepción sube sin manejar, el `Payment` nunca se crea, y la orden queda `PENDING` huérfana para siempre (sin job de limpieza/reintento), mientras el cliente recibe un 500 sin saber si se le cobró.

**Fix**: envolver `CulqiProvider.charge/refund` igual que Stripe/PayPal; envolver `checkout()` para marcar la orden `FAILED` (o reintentar) ante cualquier excepción del provider.

**1.4 — `PATCH /admin/areas/:id` sin ninguna validación de body (`dto: any`)**
`apps/api/src/modules/admin/admin.controller.ts:123`, service en `admin.service.ts:334-336`
Único endpoint de `admin.controller.ts` sin `ZodValidationPipe` pese a tener un hermano (`createArea`) que sí valida. El body llega intacto a `prisma.area.update({data: input})` — un campo de tipo incorrecto dispara una excepción de Prisma no controlada (ver 2.5, filtra detalles internos).

**1.5 — Promesa sin control en `CertificateService.exportZip()` puede tumbar el proceso de `apps/api`**
`apps/api/src/modules/certificate/certificate.service.ts:328-341`
```ts
void (async () => {
  for (const c of certificates) { /* try/catch solo acá dentro */ }
  await archive.finalize(); // FUERA del try/catch, y la IIFE no tiene .catch()
})();
```
Si `archive.finalize()` rechaza (error interno de `archiver`, o el admin cancela una descarga de ZIP grande a mitad de camino — escenario realista), es una promesa rechazada sin manejar. No existe ningún handler global de `unhandledRejection` en `apps/api` — con el comportamiento por defecto de Node ≥15, esto puede terminar el proceso completo, no solo esa descarga.

**Fix**: mover `.catch()` a la IIFE completa; loguear y no dejar que se propague como `unhandledRejection`.

### 🟡 Medio

**1.6 — Varios endpoints admin con tipos TS estrechos en `@Body()` pero sin validación runtime**
`apps/api/src/modules/admin/admin.controller.ts:431` (`reorderMaterial`), `:491` (`suggestQuestions`), `:856` (`updateTeacherLiquidationStatus`), `:1139` (envío de reporte, `recipientEmail` sin validar formato), `:1278` (`setCourseStaffCanEdit`); también `apps/api/src/modules/chatbot/chatbot-documents.controller.ts:40`.
Impacto acotado porque todos requieren rol ADMIN/TEACHER ya autenticado, pero es el mismo patrón replicado 6+ veces — agregar `ZodValidationPipe` con schemas mínimos, empezando por `recipientEmail` (formato email).

**1.7 — Lógica de paginación duplicada sin comentario de "duplicación intencional"**
`apps/api/src/common/utils/pagination.ts` (`normalizePage`, `MAX_PAGE_SIZE=100`) vs. `apps/api/src/modules/admin/admin.service.ts:340-341` (reimplementa el mismo clamp a mano). A diferencia de `computeAccessExpiresAt`/`QUEUE_NAMES` (duplicaciones documentadas explícitamente en este repo), acá no hay comentario — si `MAX_PAGE_SIZE` cambia, este endpoint queda desincronizado en silencio.

**1.8 — `LEVEL_ORDER.indexOf` sin manejar `-1` explícitamente**
`apps/worker/src/processors/recommendation.processor.ts:80-82`. Hoy inalcanzable (el enum de Prisma lo impide), pero si `course.level` no está en `LEVEL_ORDER`, `indexOf` devuelve `-1` y `LEVEL_ORDER[0]` ("INITIAL") se toma como "siguiente nivel" sin ninguna guarda.

### Verificado como correcto
Todos los processors de `apps/worker` (certificate, invoice, credit-note, email-campaign, reminder, attendance-sync, subtitles, recommendation, suggestion, backup, assessment-expiry) ya envuelven su lógica de riesgo en try/catch con logging, y `apps/worker/src/index.ts` maneja `SIGTERM`/`SIGINT` y los eventos `failed`/`error` de las 9 colas correctamente — la única promesa sin control real de todo el repo está en `apps/api` (1.5), no en el worker. No se encontraron exports muertos en `packages/shared`.

---

## 2. Seguridad

### 🟠 Alto

**2.1 — Login OAuth (Google/Microsoft) sin parámetro `state` — CSRF de login**
`apps/api/src/modules/auth/strategies/google.strategy.ts:9-14`, `microsoft.strategy.ts:21-28`, guards en `apps/api/src/modules/auth/guards/`
Ninguna estrategia pasa `state: true`, y no hay session store (`express-session` no existe en el repo) para respaldarlo. `handleOAuthCallback` acepta cualquier `code` válido sin verificar que venga del mismo flujo/navegador que lo inició.

**Escenario**: un atacante inicia el flujo OAuth con su propia cuenta, obtiene una URL de callback válida, y se la entrega a la víctima (link, iframe) antes de que expire. El navegador de la víctima queda autenticado como el atacante — si la víctima completa una compra sin darse cuenta, esos datos/pagos quedan en la cuenta del atacante.

**Fix**: agregar `state: true` con un store sin sesión (HMAC firmado en cookie de corta vida).

### 🟡 Medio

**2.2 — Access token expuesto en la URL del callback OAuth (query string)**
`apps/api/src/modules/auth/auth.controller.ts:211-212` — `res.redirect(`${appUrl}/auth/callback?token=${accessToken}`)`. Queda en historial del navegador, logs de acceso del servidor/CDN, y se filtra vía header `Referer` si esa página carga cualquier recurso de terceros antes de limpiar la URL. Ventana de explotación: 15 min (vida del access token).
**Fix**: código de intercambio de un solo uso en vez del JWT final en la URL.

**2.3 — Access token en cookie no-httpOnly + localStorage — amplifica cualquier XSS futuro**
`apps/web/src/lib/auth.ts:21,30-34`. Decisión consciente y documentada (para que Server Components/middleware lean sin llamar a la API), pero significa que un XSS futuro en `apps/web` (hoy no se encontró ninguno activo — no hay `dangerouslySetInnerHTML`) tendría acceso directo a la sesión completa vía `document.cookie`/`localStorage`.
**Fix a futuro**: si `apps/web` y `apps/api` alguna vez comparten dominio, migrar el access token a cookie httpOnly.

**2.4 — Ningún header de seguridad HTTP en rutas normales (helmet ausente)**
`apps/api/src/main.ts` (sin `helmet()`), `apps/web/next.config.js` (sin `headers()`). `GET /docs` (Swagger, público) podría enmarcarse en un iframe malicioso (clickjacking) sin `X-Frame-Options`. Todo el resto del sitio depende 100% de que el hosting/CDN agregue estos headers.
**Fix**: `helmet()` en `main.ts`, bloque `headers()` en `next.config.js` con al menos `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`.

**2.5 — Errores no controlados devuelven `exception.message` crudo al cliente**
`apps/api/src/common/filters/http-exception.filter.ts:38-42`. Cualquier `Error` no-`HttpException` (incluye `PrismaClientKnownRequestError`/`PrismaClientValidationError`) reenvía su mensaje interno (nombres de columnas, forma de la query) en el JSON de respuesta 500. Se combina con 1.4/2.6 para exponer detalles de infraestructura vía errores forzados.
**Fix**: para excepciones no controladas, devolver siempre `"Internal server error"` genérico al cliente; el detalle ya se loguea server-side.

**2.6 — `POST /auth/forgot-password` sin `ZodValidationPipe` (endpoint público)**
`apps/api/src/modules/auth/auth.controller.ts:133`. `forgotPasswordSchema` está importado (línea 18) pero nunca usado — a diferencia de `resetPassword`/`changePassword`, que sí validan. Un `email` no-string dispara una excepción de Prisma no controlada (ver 2.5) que reintroduce parcialmente el riesgo de enumeración de usuarios que el resto del método evita deliberadamente.
**Fix**: aplicar el schema ya importado — es un cambio de una línea.

### 🟢 Bajo

**2.7 — `$queryRawUnsafe` con interpolación de string (no explotable hoy, patrón frágil)**
`apps/api/src/modules/admin/admin.service.ts:2372-2390` (`getFinancialDetail`). `bucketExpr` se interpola directo en SQL crudo; hoy protegido por un allowlist en el controller (`admin.controller.ts:1099`), pero la validación vive en el caller, no en el service — si mañana otro caller reusa `getFinancialDetail` sin repetir esa validación, se abre inyección SQL real.
**Fix**: mover el allowlist dentro del propio service, usar `Prisma.sql` en vez de `$queryRawUnsafe`.

**2.8 — `/docs` (Swagger) público sin autenticación**
`apps/api/src/main.ts:37-38`. Montado fuera del router de Nest, el `JwtAuthGuard` global no lo protege — cualquiera ve el mapa completo de la API sin autenticarse. Bajo impacto por sí solo, pero facilita reconocimiento.
**Fix**: restringir a IPs internas en producción, o exigir un guard básico.

**2.9 — Varios `@Body()` sin `ZodValidationPipe` en endpoints admin (ver 1.6, mismo hallazgo desde el ángulo de seguridad)** — impacto bajo porque ya están gateados por rol.

### Verificado como correcto (auditoría exhaustiva, sin hallazgo)
- **Pagos**: Culqi re-verifica el cargo server-to-server; Stripe valida firma HMAC del webhook; PayPal solo captura una orden ya aprobada. El monto se recalcula siempre server-side desde el precio real del curso, nunca desde el cliente. Idempotencia de matrícula/pago resuelta con `updateMany` atómico con guard.
- **IDOR**: `EnrollmentService`, `CertificateService`, `SupportService` comparan explícitamente `record.userId !== requestingUserId` (o membresía de empresa) antes de devolver/modificar datos.
- **Secretos**: `SunatSettingsService`, `ChatbotSettingsService`, `EmailServerSettingsService` nunca devuelven el secreto real, solo un flag `hasX`.
- **Uploads**: todos los `FileInterceptor` usan un allowlist de MIME que excluye `text/html`/`image/svg+xml`; el caso SCORM (permite `application/octet-stream`) está compensado con validación estructural real del ZIP.
- **Inyección SQL**: único `$executeRaw` fuera de 2.7 usa parámetros tipados vía tagged template de Prisma (seguro).
- **`RolesGuard`**: no está registrado global, pero se confirmó que CADA controlador con `@Roles(...)` aplica `@UseGuards(RolesGuard)` correctamente — ninguno queda "decorativo".
- **Rate limiting**: `/auth/login`, `/auth/register`, `/auth/forgot-password` ya tienen `@Throttle` específico; límite global de 120 req/min por IP.
- **CORS**: origin específico desde `APP_URL`, no wildcard.

---

## 3. Diseño y UX de `apps/web`

> Nota de alcance: la API no respondía durante la revisión visual en vivo, así que las pantallas `/admin/*` se auditaron por código (grep exhaustivo), no por captura de pantalla. Las pantallas públicas (home, catálogo, detalle de curso, login) sí se verificaron en vivo, en desktop y móvil.

### 🔴 Crítico

**3.1 — Sin selector de tema/idioma en móvil en TODAS las áreas autenticadas**
`apps/web/src/components/layout/SidebarShell.tsx:241` (la barra con `ThemeToggle`/`LocaleSwitcher`/`NotificationBell` es `hidden ... lg:flex`) + el panel `mobileOpen` solo renderiza nav + nombre de usuario/logout. Un usuario en celular (admin, campus, docente, empresa) **no tiene ninguna forma de cambiar a modo oscuro ni de idioma** — no está mal ubicado, simplemente no existe por debajo de 1024px.

**3.2 — Login expone el error técnico crudo al usuario final**
`apps/web/src/app/(auth)/login/page.tsx:70` + `apps/web/src/lib/api-client.ts:74`. Confirmado en vivo: ante un fallo de conexión, el usuario ve literalmente *"No se pudo conectar con la API (http://localhost:4000). TypeError: Failed to fetch"* — filtra la URL interna y el stack técnico. Inaceptable en producción ante cualquier hiccup de red del lado del usuario.
**Fix**: mensaje genérico ("No pudimos conectar. Intenta de nuevo en un momento") para errores de red; loguear el detalle técnico solo del lado del cliente (Sentry/consola), nunca mostrarlo.

### 🟠 Alto

**3.3 — Contraste insuficiente en el titular de la home (`brand-gradient-text`)**
`apps/web/src/app/globals.css:227`, usado en `apps/web/src/app/(marketing)/page.tsx:26` y `empresas/page.tsx`. Gradiente indigo-400→gold-400 sobre `--paper`: gold-400 da **1.9:1** de contraste (el mínimo aceptable es 3:1 para texto grande) — confirmado visualmente, las palabras en tono dorado quedan apenas legibles.

**3.4 — `text-ash-400`/`text-ash-300` por debajo de AA en modo claro, usado en contenido real**
Contraste real: ash-400 = 2.9:1, ash-300 = 1.75:1 (ambos fallan 4.5:1; ash-400 falla incluso 3:1). El propio comentario de `globals.css:14-15` admite que solo ink/gold fueron verificados — ash quedó fuera. Usos en contenido crítico, no decorativo:
- `components/campus/AssessmentRunner.tsx:93,232,497` — numeración de preguntas, "Sin límite de tiempo", "Usaste todos tus intentos".
- `components/admin/EmailServerSettingsForm.tsx:76` — instrucción sobre la contraseña SMTP.
- `app/(teacher)/docente/liquidaciones/page.tsx:69` — encabezado de tabla financiera (además en `text-[0.65rem]`, doble problema con 3.15).
- Patrón repetido ~25 veces en íconos de eliminar/mover de ExamBuilder/CourseEditor/ScormBuilder (casi invisibles en estado normal).

**3.5 — `alert()`/`prompt()` nativo bloqueante usado 33 veces pese a estar identificado como anti-patrón por el propio equipo**
Comentario en `components/admin/UsersManager.tsx:15-21` documenta el reemplazo de `alert()` en un diálogo puntual por ser "frágil... no se ve ni un poco moderno" — pero el patrón sigue vivo en `CourseEditor.tsx` (19×), `ExamBuilder.tsx` (6×), `ScormBuilder.tsx` (6×), `admin/catalogo/nuevo/page.tsx:64`. Es la mayor inconsistencia de UI del código: dos formas de comunicar error/confirmación conviviendo.

**3.6 — `ScormBuilder.tsx`: labels prácticamente ausentes (~11-15% de 27 campos)**
Vs. `ExamBuilder.tsx` (~100%) y `CourseEditor.tsx` (~47%). `ColorField` (líneas 76-93, ×6) tiene `<Label>` visual sin `htmlFor`/`id`; el marcador de "respuesta correcta" en `OptionsList` (195-201) usa solo `title=`, sin `<label>` ni `aria-label`. En `CourseEditor.tsx`, el peor caso son los campos de "Materiales" (1013,1019,1313,1319): un `<Select>` sin `id`, `aria-label` ni `<Label>` cercano.

**3.7 — Modal de vista previa de examen sin accesibilidad de teclado**
`components/admin/ExamBuilder.tsx:887-896` reimplementa un modal a mano en vez de usar `components/ui/Dialog.tsx` (que sí tiene `role="dialog"`, `aria-modal`, cierre con Escape, foco atrapado). El de ExamBuilder no cierra con Escape ni atrapa el foco.

**3.8 — Div clicleable "desnudo" en el editor de plantillas de certificado**
`components/admin/CertificateTemplateManager.tsx:551` — `<div onClick={...}>` para posicionar tags sobre el fondo del certificado, sin `role`, `tabIndex` ni `onKeyDown`, sin alternativa por teclado (ni campos numéricos x/y).

### 🟡 Medio

**3.9 — Placeholder del buscador de home se corta sin elipsis en móvil** — `components/catalog/SearchBox.tsx:29-36`, confirmado visual (375px): "¿Qué quieres aprende" cortado sin "r?". El `<label>` sí existe (`sr-only`) — es solo visual, no de accesibilidad de formulario.

**3.10 — Colores hardcodeados que duplican tokens existentes, rompen dark mode** — `#586bd8`/`#d8b16c` (= indigo-400/gold-400 exactos) como literales en ≥10 sitios (`DashboardCharts.tsx`, `ProfitAndLossCharts.tsx`, `CertificateTemplateManager.tsx`, `AppearanceForm.tsx`). Al ser hex fijo, no reaccionan a modo oscuro — los gráficos del dashboard quedan "planos" en dark mode.

**3.11 — Badge de estado reimplementado a mano en vez de `<Badge>`** — `components/admin/UsersManager.tsx:577,773` recrea un pill activo/inactivo con los mismos tokens que `<Badge variant="success"/"danger">` ya ofrece.

**3.12 — Tabla sin `overflow-x-auto`** — `app/(teacher)/docente/liquidaciones/page.tsx:67`, la única de 27 tablas del código sin el wrapper que las otras 26 sí tienen.

**3.13 — Menú móvil del `SidebarShell` no es un drawer/overlay** — `SidebarShell.tsx:234-239`: empuja el `<main>` en vez de superponerse, sin backdrop, sin clic-fuera ni Escape para cerrar.

**3.14 — Header móvil no es sticky** — `SidebarShell.tsx:201`: en páginas largas (CourseEditor), los controles de navegación desaparecen al hacer scroll.

**3.15 — Falta un escalón "micro" en la escala tipográfica** — 26 usos de `text-[10px]/[11px]/[0.65rem]/[0.7rem]` en vez de una clase del sistema; varios coinciden con los hallazgos de contraste (3.4).

**3.16 — `min-h-[60vh]` copiado literal en 7 páginas de error/vacío distintas** — candidato claro a un componente `<ErrorState>` compartido.

### 🟢 Bajo

**3.17 — Pluralización incorrecta: "1 lecciones"** — `apps/web/src/messages/es.json:106`, confirmado en vivo en el detalle de un curso real.
**3.18 — Touch targets del header móvil bajo 44×44px** — `SidebarShell.tsx:204,213,223-231` (~36-40px).
**3.19 — Sin manejo de foco al abrir/cerrar el menú móvil** — el foco no se mueve al nav ni vuelve al botón hamburguesa.

### Lo que funciona bien
El manejo de "API caída" en home/catálogo/curso es un fallback prolijo (Callout claro + datos de referencia, en vez de pantalla rota) — mejor de lo esperado. `ExamBuilder.tsx` es el mejor ejemplo de formulario accesible (~100% de campos con `<Label htmlFor>`) — debería ser la plantilla para `ScormBuilder`. El sistema de badges de catálogo es consistente entre pantallas. El redirect post-login con `?next=` funciona correctamente. 26 de 27 tablas ya tienen su wrapper de overflow.

---

## 4. Rendimiento

### 🔴 Crítico

**4.1 — `Order` y `Payment` sin ningún índice, ni siquiera en sus FK**
`prisma/schema.prisma:1334-1365` (Order), `:1481-1500` (Payment) — Postgres no indexa automáticamente una FK. Afecta el camino más caliente del checkout:
- `commerce.service.ts:879,889,917` — `payment.findFirst({where:{providerRef}})` en **cada webhook de Stripe/Culqi**.
- `commerce.service.ts:855-860` — `order.findMany({where:{userId}})`, historial de compras de cualquier alumno.
- `admin.service.ts:162-165,2193-2203` — cada carga de `/admin` y `/admin/finanzas`.
- `Order.companyId` es columna de política RLS (`prisma.module.ts:44`) y tampoco está indexada — cada request bajo `/companies/:companyId/*` que toque `Order` hace *seq scan* completo.

**Fix**: `@@index([userId])`, `@@index([companyId])`, `@@index([status, createdAt])` en `Order`; `@@index([orderId])`, `@@index([providerRef])`, `@@index([status, createdAt])` en `Payment`. El de mayor relación costo/beneficio de todo el informe.

**4.2 — N+1 en cadena: `EnrollmentService.listMine` → `computeApprovalMissing` → `computeCourseScore` — pantalla "Mis cursos"**
`apps/api/src/modules/enrollment/enrollment.service.ts:176-236` (orquestador), `:49-153` (`computeApprovalMissing`), `apps/api/src/modules/assessment/course-score.ts:67-107` (`computeCourseScore`, con `resolveBestScore` en loop secuencial línea 91-105), `enrollment.service.ts:156-174` (`nextActionLabel`). Ninguna de estas queries depende de un valor recién descubierto — todas filtran por `courseId`/`enrollmentId` ya conocidos, son batcheables con `findMany({where:{courseId:{in:[...]}}})`.
**Impacto**: un alumno con 8 matrículas en cursos de ~3 evaluaciones c/u dispara **70-90 queries adicionales en una sola carga de "Mis cursos"** — la pantalla más visitada por cada estudiante logueado.

**4.3 — N+1 en 3 puntos del dashboard financiero de admin, todos convergen en `getFinancialSummary`**
- `admin.service.ts:1154-1174` (`getTeachingHoursCost`): hasta 3 queries por sesión en vivo → **~1500 queries extra** con 500 clases en el período.
- `admin.service.ts:1184-1225` (`listTeacherSessionHours`, acotado a 500 sesiones): mismo patrón, hasta 1500 queries por request.
- `admin.service.ts:1030-1109` (`getPartnerInstitutionCosts`/`getRoyaltyCosts`): ~60-90 queries extra con 30 convenios/regalías activos.

Los 3 se ejecutan en **cada** carga de `/admin/finanzas`. Batcheables agrupando por `courseId`/`teacherId`/`liveSessionId` con `{in: [...]}`.

### 🟠 Alto

**4.4 — N+1 en `AdminService.getExceptions`** (`admin.service.ts:179-206`) — widget del dashboard admin, corre en cada carga de `/admin`.
**4.5 — N+1 secuencial (no `Promise.all`) en `email-campaign.processor.ts::mostAtRiskEnrollment`** (`:322-324`, `:182-206`) — una campaña de reenganche a 3000 usuarios inactivos dispara del orden de **9000 queries secuenciales**, puede bloquear la cola del worker por minutos.
**4.6 — `CatalogService.getSections` trae TODOS los cursos publicados con `staff.user` completo y TODAS las calificaciones, sin `take`** (`catalog.service.ts:320-337`) — corre en cada visita a la home del catálogo.
**4.7 — Falta índice `Enrollment(status, accessExpiresAt)`** (`schema.prisma:732-770`) — usado por 2 sweeps del worker que corren cada 15 min, 24/7, sobre una tabla que crece sin límite.
**4.8 — `Quote.companyId` sin índice** pese a estar en `TENANT_SCOPED_MODELS` (política RLS activa) — a diferencia de `NpsSurveyResponse`/`SupportTicket`, que sí lo tienen.
**4.9 — Cero uso de `next/image` en todo `apps/web`** — la infraestructura (`next.config.js` con `remotePatterns`, sin `unoptimized:true`) está lista pero 0% utilizada. Mayor impacto real: el hero de `cursos/[slug]/page.tsx:118` (probable elemento LCP de esa página), `CourseCard.tsx:32` (12-24 por página del catálogo, sin lazy loading), `EnrollmentCard.tsx:54`.

### 🟡 Medio

**4.10** — N+1 en `EnrollmentService.getMineDetail` (`:412-447`, `isModuleComplete` con 4 queries propias por evaluación) — acotado a un solo curso, menor severidad que 4.2.
**4.11** — N+1 en liquidación individual de docente (`admin.service.ts:1756-1781`) — acotado a un docente/período.
**4.12** — Índice `Notification(userId, readAt)` no cubre el `orderBy` real de `GET /notifications/mine` (ordena también por `createdAt`) — fix: `@@index([userId, channel, readAt, createdAt])`.
**4.13** — `AssessmentAttempt` sin índice `(enrollmentId, assessmentId)` — las queries reales de `resolveBestScore`/`attemptsUsed` no coinciden con el índice existente (`assessmentId, userId`).
**4.14** — `lessonProgress.findMany({where:{updatedAt:{gte}}})` sin índice en `updatedAt` (`admin.service.ts:1384-1388`, `email-campaign.processor.ts:60-64`) — tabla potencialmente enorme (una fila por matrícula×lección).
**4.15** — Reportes PDF (`alumnosRegistrados`, `cursosVsAlumnos`) sin paginación — traen el dataset completo para renderizar en un solo request síncrono, riesgo de timeout/memoria con miles de alumnos.

### 🟢 Bajo
**4.16** — N+1 intencional de bajo impacto en `bulkDelete*` (zona de pruebas, low-traffic).
**4.17** — `getSignedUrl` dentro de un `.map(async)` en `listCertificateTemplates` — no es query a Postgres, impacto despreciable.
**4.18** — `listCourseRatings` sin filtro ni `take` — pantalla admin de uso esporádico.

---

## Plan de acción sugerido (orden real de intervención)

1. **1.1** — Fix de la nota de examen (integridad de certificados ya emitidos: vale la pena auditar retroactivamente cuántos certificados reales pudieron emitirse con esta condición).
2. **4.1** — Índices de `Order`/`Payment` (mínimo esfuerzo, mayor beneficio).
3. **2.1** — `state` en OAuth.
4. **1.3/1.4** — try/catch en Culqi + validación de `updateArea`.
5. **4.2 + 4.3** — Batchear los N+1 de "Mis cursos" y del dashboard financiero (los 2 hot paths más visitados).
6. **3.1 + 3.2** — Selector de tema/idioma en móvil + mensaje de error genérico en login (ambos triviales de arreglar, impacto directo en cualquier usuario).
7. Resto de Alto (2.2-2.6, 3.3-3.8, 4.4-4.9) según capacidad del equipo.
8. Medio/Bajo — limpieza incremental, sin bloquear ningún lanzamiento.
