# Plan de fases — Inkademy

Este plan ordena el alcance en tres fases. La Fase 1 es lo cubierto por este
entregable (más lo que construyen en paralelo los agentes de `apps/api` y
`apps/web`); las Fases 2 y 3 quedan documentadas como guía de producto para
priorizar después del lanzamiento, no como compromiso de fechas.

## Fase 1 — Lanzamiento

Objetivo: vender y dictar cursos en Perú, B2C y B2B, con lo mínimo necesario
para operar de forma sostenible (no solo "vender", también certificar,
soportar y medir).

- Catálogo público (áreas, cursos, programas/diplomados) y checkout con
  Culqi (Perú) y Stripe (compradores internacionales).
- Campus del alumno: progreso por lección, calendario (clases en vivo,
  vencimientos, exámenes) con `.ics` suscribible, certificados descargables
  y verificables públicamente.
- Clases en vivo integradas con Microsoft Teams (Graph API), con
  sincronización de asistencia.
- Evaluación: exámenes con preguntas objetivas autocalificadas y abiertas
  calificadas por docente/admin; reglas de aprobación configurables por
  curso (progreso + asistencia + nota).
- Certificación automática: PDF con QR de verificación, generado en
  background (`apps/worker`) apenas se cumplen las reglas.
- B2B: alta de empresa, invitación de colaboradores, cupos por oferta,
  asignación de cupos, reportes de avance/asistencia/notas por empresa y
  cotizaciones (`Quote`) para acuerdos a medida.
- Notificaciones transaccionales por email (bienvenida, matrícula, pago,
  recordatorios de clase/examen/vencimiento, aviso de inasistencia,
  certificado emitido, recomendación de siguiente curso).
- Recomendación básica basada en reglas (siguiente curso de un programa,
  mismo área con nivel superior, asignación directa por empresa) — sin
  machine learning todavía.
- Soporte: mesa de ayuda con tickets propios o de empresa.
- Panel de administración por excepción (KPIs, exámenes pendientes de
  calificar, cursos sin docente asignado, cupos por vencer, pagos sin
  matrícula) en vez de una bandeja genérica de "todo".
- Infraestructura: Postgres + Redis + object storage S3-compatible,
  contenedores para `api`/`worker`/`web`, un solo país (Perú) y dos idiomas
  de contenido (es/en) a nivel de datos (aunque el lanzamiento comercial
  sea en español).

## Fase 2 — Crecimiento

Objetivo: bajar el costo de adquisición/atención y abrir canales que ya
esperan los clientes corporativos y los compradores más grandes.

- **SSO corporativo** (SAML/OIDC) para que empresas grandes integren su
  propio IdP en vez de depender solo de Google/Microsoft OAuth personal.
- **WhatsApp Business** como canal de notificación y soporte (el modelo ya
  reserva `NotificationChannel.WHATSAPP` y `SupportTicket.channel`, y
  `.env.example` ya deja el flag `WHATSAPP_ENABLED`).
- **Chat en vivo** para soporte en tiempo real (hoy es asíncrono vía
  tickets).
- **Adapter de PayPal** como tercer proveedor de pago (el modelo ya
  contempla `PaymentProviderType.PAYPAL`), útil para ciertos mercados
  LatAm donde PayPal sigue siendo dominante.
- **Facturación/cotización con pipeline comercial**: llevar `Quote` más
  allá de "solicitada/enviada/aceptada/rechazada" a un flujo con
  seguimiento de un equipo de ventas (dueño de la oportunidad, historial de
  contacto, generación de factura/boleta electrónica según normativa local).
- **Campañas de marketing**: segmentación por intereses/nivel/empresa,
  integración con una herramienta de email marketing/automatización, y
  medición de conversión del catálogo curado (`/catalog/sections`) por
  campaña.
- **Streaming de video mejorado**: transcoding adaptativo (HLS/DASH),
  protección de contenido (DRM básico o URLs firmadas de corta duración),
  analítica de reproducción (dónde abandonan los alumnos un video).
- **Más países**: el modelo ya soporta esto vía `CountryConfig` (tipos de
  documento, moneda, prefijo telefónico por país) y `priceCurrency` por
  curso — Fase 2 es el trabajo de producto/legal/pagos para activarlo
  (medios de pago locales adicionales, aspectos tributarios).
- **Subtítulos/transcripción** de las lecciones en video (accesibilidad y
  SEO de contenido), aprovechando `subtitleLanguages` ya presente en
  `Course`.

## Fase 3 — Diferenciación

Objetivo: pasar de "vender y dictar cursos" a una plataforma con retención y
efectos de red — lo que es más difícil de copiar por un competidor.

- **Recomendación con machine learning**: reemplazar/complementar el motor
  de reglas de `apps/worker` (completado→siguiente, mismo área→nivel
  superior, asignado por empresa) con un modelo de recomendación real
  basado en comportamiento agregado (qué combinaciones de cursos completan
  juntos alumnos similares), manteniendo `Recommendation.reason` como
  explicación al usuario.
- **Comunidad**: foros o espacios de discusión por curso/cohorte, preguntas
  entre alumnos, participación de docentes.
- **Referidos**: programa de referidos B2C (y posiblemente B2B) con
  incentivos medibles.
- **App móvil**: nativa o híbrida, para consumo de contenido grabado y
  notificaciones push, reusando la misma API.
- **Integraciones CRM**: sincronizar leads/oportunidades B2B (`Quote`,
  reportes de empresa) con un CRM externo (HubSpot/Salesforce) para que el
  equipo comercial no viva solo dentro de Inkademy.
- **Alertas predictivas**: detectar alumnos "en riesgo" (progreso
  estancado, inasistencias repetidas, plazo de acceso por vencer) antes de
  que abandonen, y disparar intervención (recordatorio personalizado,
  contacto humano) en vez de solo reportar el dato ya consumado.
