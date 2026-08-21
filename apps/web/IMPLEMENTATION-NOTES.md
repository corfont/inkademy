# Notas de implementación — apps/web

## 1. Qué está conectado a la API real vs. simulado

Todas las pantallas que necesitan datos usan el patrón `withFallback()`
(`src/lib/safe-fetch.ts`): intentan la llamada real contra `NEXT_PUBLIC_API_URL`
siguiendo exactamente `docs/API-CONTRACT.md` y, si la API no responde (todavía
no está desplegada, o el endpoint no existe aún), caen a datos simulados de
`src/lib/mock-data.ts` y muestran un `Callout` discreto ("Mostrando datos de
referencia…"). Esto significa que **ninguna pantalla está "rota" sin backend**,
pero tampoco hay nada hardcodeado de forma permanente: apenas `apps/api`
responda con el shape del contrato, la app deja de mostrar el aviso y usa datos
reales sin cambios de código.

### Totalmente conectadas al contrato (llaman al endpoint documentado)
- Home (`/`) → `GET /areas`, `GET /catalog/sections`
- Catálogo (`/catalogo`) → `GET /areas`, `GET /courses`
- Ficha de curso (`/cursos/:slug`) → `GET /courses/:slug`
- Ficha de programa (`/programas/:slug`) → `GET /programs/:slug`
- Verificación de certificado (`/verificar/:codigo`) → `GET /certificates/verify/:codigo` (SSR)
- Auth: login/registro/recuperar/completar-perfil/callback → `/auth/*`, `PATCH /profile`
- Empresas (landing, formulario) → `POST /companies/:id/quotes` (ver limitación abajo)
- Campus: dashboard, mis cursos, agenda, certificados, pagos, soporte,
  recomendaciones → `GET /me/*`, `POST /support/tickets`
- Checkout → `POST /checkout`
- Evaluación → `GET /assessments/:id`, `POST /assessments/:id/attempts`, `POST /attempts/:id/submit`
- Empresa (dashboard, cupos, colaboradores, reportes, cotizaciones) → `GET/POST /companies/:id/*`
- Admin (dashboard/KPIs, excepciones, catálogo, empresas, soporte, evaluaciones
  pendientes) → `GET /admin/*`, `POST /admin/attempts/:id/answers/:id/grade`

### Con datos simulados por decisión de diseño (no por falta de red)
- **Aula virtual** (`/campus/cursos/:enrollmentId`): el contrato solo dice
  "detalle + módulos/lecciones + LessonProgress" sin DTO tipado en
  `@inkademy/shared`. Definí un shape razonable en
  `src/lib/mock-data.ts` (`ClassroomDetail`/`ClassroomModule`/`ClassroomLesson`)
  con `contentType`, `videoUrl`, `materials`. **Cuando `apps/api` publique el
  DTO real de `GET /me/enrollments/:id`, hay que ajustar ese shape** (la
  llamada real ya se intenta primero, vía `meApi.enrollment`).
- **Progreso de lección**: sí llama a `PATCH /me/lessons/:lessonId/progress`
  en cada actualización (`onTimeUpdate` throttleado a 10s y al completar), pero
  no bloquea la UI si falla.
- **Evaluación**: preguntas de ejemplo con los 5 tipos de `QuestionType`. El
  intento (`POST /assessments/:id/attempts`) y el envío (`POST
  /attempts/:id/submit`) se intentan contra la API real primero.
- **Pestaña "Guardados"** en Mis cursos: el esquema de datos no define un
  modelo de wishlist/favoritos, así que queda en la UI lista pero vacía. Sugiero
  agregar un modelo `SavedOffering` si se quiere esta función de verdad.
- **`/empresa/:id/certificados`**: no existe `GET /companies/:id/certificates`
  en el contrato. Propongo agregarlo (análogo a `/companies/:id/reports`).
- **`/admin/certificados`**: el contrato solo define
  `GET/POST /admin/certificate-templates`, no un listado global de
  certificados emitidos. Propongo `GET /admin/certificates?q=`.
- **Catálogo → filtros de duración y "con próxima fecha en vivo"**: no existen
  como parámetros en `CatalogFilters` (`@inkademy/shared`), así que se aplican
  como post-filtro en el cliente sobre los resultados ya paginados que
  devuelve `GET /courses`, en vez de mandarlos como query param. Si se agregan
  a `CatalogFilters`, basta con moverlos a `catalogApi.courses(filters)`.
- **Formulario de cotización en `/empresas`** (landing B2B pública, empresa aún
  no registrada): el contrato solo define `POST /companies/:id/quotes` con un
  `:id` existente. Como el prospecto no tiene `companyId` todavía, hoy se llama
  con un id placeholder (`"new"`). **Se necesita un endpoint público de
  captación de leads** (o que `/companies/:id/quotes` acepte `:id` = `"new"` y
  cree la `Company` a partir de `legalName`/`taxId` del body, que es lo que ya
  envía `RequestQuoteInput`).
- **Checkout**: la tokenización de tarjeta es simulada (`fakeTokenize()` en
  `src/app/checkout/page.tsx`) porque no hay claves reales de Culqi/Stripe ni
  garantía de red en este entorno. El resto del flujo (`POST /checkout`) sí
  sigue el contrato. En producción, sustituir `fakeTokenize` por el script de
  Culqi Checkout o Stripe Elements cargado con
  `NEXT_PUBLIC_CULQI_PUBLIC_KEY` / `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`.
- Todas las tablas de "empresa" (colaboradores, cupos) y "admin" (soporte,
  evaluaciones pendientes) muestran datos de ejemplo con nombres ficticios
  cuando la API no responde, pero la mutación (invitar colaborador, calificar
  respuesta, crear ticket) siempre intenta el endpoint real primero.

## 2. Decisiones de diseño

- **Paleta**: color de marca "ink" (azul tinta profundo, hue ~222) por
  prestigio académico y legibilidad; neutro cálido "paper"/"ash" (blancos y
  grises con matiz cálido, no fríos) para que el catálogo se sienta editorial
  y no clínico; acento "gold" (ámbar/dorado) reservado exclusivamente para
  precios y CTAs de conversión (inscribirme, pagar), para que destaquen sin
  saturar la interfaz de color. Estados success/warning/danger son los
  únicos colores adicionales, con variantes `-bg` suaves para banners.
  Todo vive como variables CSS HSL en `globals.css` (fácil de retocar sin
  tocar componentes) y se expone a Tailwind vía `tailwind.config.ts`.
- **Tipografía**: "Fraunces" (serif editorial, con contraste alto) para
  títulos —transmite "diplomado/academia" sin caer en un serif clásico
  corporativo—, e "Inter" para cuerpo de texto por su legibilidad probada en
  pantalla y soporte amplio de pesos. Ambas vía `next/font/google` (se
  auto-hostean, sin layout shift, sin llamada a Google en runtime).
- **Modo oscuro**: se definieron tokens para `prefers-color-scheme: dark`
  como base "gratis" (sin toggle manual, porque el pedido priorizaba claro),
  pero no se construyó un selector de tema explícito para no gastar
  presupuesto de esta iteración en algo secundario.
- **Catálogo curado, no dashboard**: la home no es una grilla infinita —usa
  `SectionCarousel` (scroll horizontal con snap) para "Destacados",
  "Próximos en vivo", "Nuevos", "Rutas recomendadas", "Más demandados", cada
  una con su propio título y "Ver todo". El split B2C/B2B es lo primero que
  se ve, antes que cualquier curso.
- **`CourseCard` deliberadamente limitado**: solo muestra los campos que pide
  el enunciado (imagen, modalidad, tipo/nivel, título-beneficio, docente,
  duración, próxima fecha en vivo, certificación, precio o "Solicitar
  propuesta", botón de acción) — nada de badges o meta-información extra.
- **Primitivos UI a mano** (`src/components/ui`): `Button`/`Badge` con
  `class-variance-authority` siguiendo la convención de shadcn/ui pero sin su
  CLI ni Radix; `Tabs`/`Dialog` implementan su propio manejo de teclado
  (flechas en tabs, foco atrapado + `Escape` en el diálogo, devolución de foco
  al cerrar) para cumplir accesibilidad sin dependencias nuevas.
- **Accesibilidad**: landmarks (`header`/`main`/`footer`/`nav`/`aside`), skip
  link al contenido principal, foco visible global (`:focus-visible` con
  outline de 2px en `ink-500`, contraste AA), `alt`/`aria-label` en toda
  imagen o icono decorativo marcado `aria-hidden`, formularios con
  `<label>` asociado y `role="alert"` en errores, `Checkbox` con estado
  `:checked` comunicado visualmente sin depender solo del color.
- **i18n sin prefijo de ruta**: se eligió cookie (`inkademy_locale`) + fallback
  a `Accept-Language` en vez de rutas `/es`/`/en`, porque el pedido no incluía
  esa estructura de URL y así se evita duplicar cada página. El selector de
  idioma vive en el header (marketing), en el shell de campus/empresa/admin y
  en `(auth)/layout.tsx`.
- **Sesión simplificada**: el contrato pone el refresh token en una cookie
  httpOnly que gestiona `apps/api` en su propio dominio (`:4000`). Como el
  front corre en otro origen/puerto en desarrollo, además del `accessToken` en
  `localStorage` se guarda una cookie legible `inkademy_session` (JSON no
  sensible: id/nombre/rol/locale) para que el `middleware` y los Server
  Components puedan saber "hay sesión" sin depender de JS del cliente. Ver
  `src/lib/auth.ts` para el detalle y la advertencia de que esto es una
  simplificación de desarrollo, no un esquema de sesión listo para producción.

## 3. Qué falta para producción

1. **Alinear el DTO de aula virtual** (`GET /me/enrollments/:id`) entre
   `apps/api` y el shape simulado en `src/lib/mock-data.ts`
   (`ClassroomDetail`), y añadir el tipo correspondiente a
   `@inkademy/shared` para no seguir usando `any` en `meApi.enrollment`.
2. **Pagos reales**: reemplazar `fakeTokenize()` en `src/app/checkout/page.tsx`
   por el SDK de Culqi Checkout y/o Stripe Elements, cargados solo cuando hay
   `NEXT_PUBLIC_CULQI_PUBLIC_KEY` / `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` reales.
3. **Sesión/seguridad**: mover a un esquema de sesión servido desde el mismo
   dominio (proxy/rewrite de Next hacia `apps/api`, o cookies `SameSite=None;
   Secure` entre subdominios) en vez de la cookie `inkademy_session` legible;
   añadir rotación de refresh token y CSRF en mutaciones.
4. **Endpoints faltantes en el contrato** (ver sección 1): listado de
   certificados por empresa, listado global de certificados para admin, y una
   vía para captar cotizaciones B2B sin `companyId` previo.
5. **Paginación real del catálogo**: la UI ya lee `page`/`pageSize` de
   `CatalogFilters`, pero no se construyó el control de paginación (solo se
   muestra la primera página); falta el componente de "siguiente/anterior"
   una vez el volumen real de cursos lo justifique.
6. **Tests**: no se incluyeron pruebas (unitarias ni e2e) para este build
   inicial; `tests/e2e` en la raíz del monorepo es del otro equipo pero
   convendría añadir specs de Playwright para los flujos de checkout,
   inscripción y verificación de certificado.
7. **Imágenes reales**: `CourseCard` usa un degradado ink con la inicial del
   curso como placeholder porque no hay `coverImageUrl` real todavía; falta
   conectar `next/image` a las URLs de S3/MinIO (`S3_PUBLIC_BASE_URL`) cuando
   `apps/api` las devuelva.
8. **Auditoría de accesibilidad con herramientas** (axe/Lighthouse) sobre el
   sitio ya desplegado — se siguieron las convenciones de landmarks, foco y
   contraste manualmente, pero no se corrió un auditor automatizado porque no
   hay build corriendo en este entorno.
