# Revisión íntegra previa al lanzamiento — Inkademy (12-oct-2026)

Cuatro revisiones de solo lectura (seguridad, bugs y lógica de negocio, UX/frontend, infraestructura y lanzamiento), con verificación contra producción donde fue posible.
Estado al cierre de este documento: lo marcado ✅ se corrigió y desplegó hoy; lo marcado ⏳ sigue pendiente.

## 1. Bloqueantes de lanzamiento que dependen de ti (datos o decisiones, no de código)

| | Qué falta | Por qué bloquea |
|---|---|---|
| ⏳ | **Correo real** (SMTP o Resend para `inkademy.lat`, con SPF/DKIM/DMARC) | Hoy api y worker envían a Mailpit: verificación de cuenta, reset de contraseña, recibos y certificados no llegan a nadie. El remitente es `no-reply@inkademy.com` (otro dominio). |
| ⏳ | **Claves de pago** (Culqi, Stripe, PayPal) y **datos SUNAT** (RUC, usuario SOL, certificado, modo producción) | Sin claves, comprar falla a propósito (✅ ya no se aprueba solo). Sin SUNAT las boletas quedan SIMULATED. `SUNAT_ENV=beta` y `PAYPAL_ENV=sandbox` hoy. |
| ⏳ | **Zoom y Teams** en modo simulado | Los enlaces de clases en vivo son falsos. |
| ⏳ | **Cuentas demo** (`alumno@`, `docente@`, `empresa@`, `soporte@demo.inkademy.com`, dos de corpandina) con contraseña del seed | Desactivarlas. Cambiar además la contraseña de `roberto.cisneros@inkapitales.com` (ADMIN) si conserva la demo. |
| ⏳ | **Contenido demo público** (11 cursos, 1 programa, 1 empresa, 3 órdenes de prueba) | Decidir cuáles son reales. 10 de 11 cursos no tienen portada. |
| ⏳ | **Datos de contacto reales** (`/admin/apariencia`): hoy `hola@inkademy.com`, `+51 1 234 5678`, «Lima, Perú» | Son del seed. |
| ⏳ | **Legal (Perú)**: Libro de Reclamaciones (Ley 29571), textos de privacidad/términos con razón social, RUC y derechos ARCO (Ley 29733), buzón `privacidad@` real, banner de cookies | Hoy las páginas legales son 3 a 4 frases genéricas. Lo valida tu abogado. |
| ⏳ | **Precios visibles para visitantes** | Hoy dicen «Inicia sesión para ver el precio» y los filtros de precio no sirven a anónimos. |
| ⏳ | **Color de marca**: `primaryColor` en la base es `#489BF4`; el título principal da ~2,7:1 de contraste | Cargar `#586BD8` (manual) o quitar el degradado. |
| ⏳ | **Copia de respaldo fuera del VPS** | El `pg_dump` diario y los zips internos viven en el mismo servidor. |
| ⏳ | Rotar la contraseña de administrador de MinIO | Quedó impresa en un registro de sesión de trabajo. |

## 2. Corregido hoy ✅

**Seguridad**
- Los respaldos (con datos de todos los usuarios) eran descargables sin credenciales desde el CDN; también las respuestas de exámenes de los alumnos. Ahora el bucket solo es público en `materials/ scorm/ certificates/ subtitles/ avatars/ admin-uploads/`; lo demás va con enlace firmado (y los enlaces firmados ahora usan la dirección pública, antes apuntaban a `minio:9000`). La política queda persistida en el compose.
- Mailpit (con los enlaces de reset y verificación) tenía su interfaz pública: ahora solo escucha en el propio servidor.
- Pagos simulados: en producción las pasarelas rechazan el cobro sin clave real; los ids `sim_…` (webhook de Culqi, captura de PayPal) ya no se aceptan. `ALLOW_PAYMENT_SIMULATION=true` lo reactiva a propósito.
- Cualquier usuario podía crear una empresa, crearse cupos B2B y asignárselos gratis: crear y renovar cupos ahora es solo de administradores.
- El certificado HTML ejecutaba lo que el alumno escribiera en su nombre (ejecución de código en el navegador del worker con acceso a la red interna). Ahora se escapa todo, JavaScript apagado y solo se permiten recursos `data:` o del CDN; nombres limitados a 80 caracteres.
- Rol de administrador acotado: se saltaba con mayúsculas en la URL (`/ADMIN/...`) y con rutas fuera de `/admin` (cortesías, cancelar/reembolsar órdenes). Corregido; además un rol acotado solo puede MIRAR usuarios y no puede ver ni descargar respaldos (contienen todos los secretos).
- El límite de peticiones era compartido por todos los usuarios (el servidor veía solo la IP del proxy): ahora usa la IP real. Rutas sensibles a mayúsculas.
- `GET /companies/:id/members` devolvía el perfil completo (DNI, teléfono, banco) de cada miembro; ahora solo nombre y correo.
- PayPal: se verifica que el monto aprobado coincida con el carrito antes de capturar.
- Un docente podía leer los intentos y archivos de cualquier alumno: ahora solo de sus cursos. Las respuestas de examen solo aceptan archivos subidos para ese fin.
- Redirección abierta tras iniciar sesión (`?next=https://…`) y HTML sin escapar en el correo de invitación.
- El refresh de sesión se rechaza si lo pide contenido servido desde el mismo origen de la API (SCORM).

**Bugs de negocio**
- La nota de un examen sumaba puntos de preguntas de otros exámenes.
- Una lección SCORM completada no actualizaba el avance, el examen ni el certificado.
- La liquidación de docentes se saltaba el último día del periodo y mostraba fechas de calendario un día antes.
- Las campañas de correo ignoraban filtros combinados (p. ej. «excluir compradores recientes»).
- Una falla al encolar el recibo dejaba una orden pagada sin matrícula completa; una orden cancelada se reactivaba por un webhook tardío.
- Se podía perdonar dos veces la deducción de una liquidación.
- `/catalogo` omitía un curso (filtro `certificationOnly=false` tratado como verdadero).

**UX / lanzamiento**
- Verificación pública de certificados: existe `/verificar` con formulario, el pie ya no apunta a un código demo, y si la API falla NUNCA muestra un certificado inventado como válido. Sin datos de ejemplo en producción en home/catálogo.
- La ficha del curso mostraba una clase ya pasada como «próxima»; los modales ya se desplazan en móvil.
- `robots.txt`, `sitemap.xml` (con los cursos), favicon, metadatos para compartir, títulos legales, 404 de marca con enlaces, pantallas de error de marca (`error.tsx`, `global-error.tsx`).
- Registro con aceptación obligatoria de Términos y Privacidad (queda la fecha en `termsAcceptedAt`).
- Ojo de contraseña alcanzable por teclado; confirmaciones al eliminar/quitar/desactivar en Roles de administrador.
- Respaldo diario de Postgres restaurable (`scripts/backup-db.sh`, 03:15, 14 días).

## 3. Pendiente técnico ⏳ (ordenado por severidad)

**Alto**
- Rutas de staff fuera de `/admin` que un rol acotado aún puede usar: `/companies/:id/*`, `/live-sessions`, `/support/tickets` (staff), `/suggestions`, `/admin/certificates/*` (cae en «sistema»).
- Login social: vincula cuentas por correo sin exigir correo verificado (Microsoft en modo multi-tenant). Latente: Google/Microsoft no están configurados.
- Condiciones de carrera sin restricción en la base: matrícula activa duplicada, pool de cupos duplicado, cupos que suman con `+` (pérdida de actualizaciones), convertir una cotización dos veces genera dos pools y dos facturas, doble reembolso en `cancelOrder`.
- Cupos nacidos de una cotización vencen con la vigencia de la OFERTA (`validUntil`), no la del producto.
- Regalías `PER_ENROLLMENT` y `PER_COMPLETION` no multiplican por la tarifa.
- Imágenes/archivos: nunca se borra el archivo físico al reemplazar o eliminar (no existe método de borrado); SCORM sin límite de tamaño descomprimido.
- Un curso con precio 0 no puede pasar por el checkout en producción.
- Contenedores `api` y `worker` corren como root; contraseñas débiles/fijas en el compose (Postgres `inkademy`); puertos 8082/8083/8084 publicados al mundo saltándose Caddy/TLS (los callbacks OAuth aún apuntan a `…:8083`).

**Medio**
- Sin CSP en web ni API; sin healthchecks ni límites de memoria; Redis sin AOF (los jobs pueden perderse); Node 20 (subir a 22); `www` no redirige al dominio principal; `_prisma_migrations` desfasada (11 migraciones aplicadas a mano).
- Índices faltantes: `OrderItem`, `AuditLog(createdAt,action,actorId)`, `LessonProgress(userId,lessonId)`, `SupportMessage(ticketId)`, `SupportTicket(createdById,assigneeId)`, `Certificate(courseId,programId)`; listados sin `take` (commerce, calendar, live-session, notification, nps, scorm, suggestions, platform-license).
- Notificaciones que quedan PENDING (la fila se crea después de encolar); recordatorios que avisan a quien ya aprobó y saturan la cola; `createAttempt` no revisa estado/vencimiento de la matrícula.
- Tokens de reseteo reutilizables 1 h; el logout no revoca el refresh; correos sin normalizar a minúsculas; `GET /settings` público expone comisiones.
- Cacheo: páginas de marketing y API sin `Cache-Control`; portadas del CDN sin optimizar; `next/image` acepta cualquier host.
- Aviso persistente para calificar el curso si el alumno cierra el modal (el certificado depende de ello); `loading.tsx`; `formatDateTime` sin zona horaria fija en ~40 usos; confirmar que el build de producción lleve la clave pública de Culqi (el checkout usa un formulario simulado sin ella; el servidor ya lo rechaza).
- i18n: muchos textos nuevos no pasan por diccionarios (QuoteForm, ReferralCard, ProgramView, CourseRatingPrompt…); páginas legales solo en español.

**Bajo**
- `<Link><Button>` anidado (26 usos), `DndContext` sin `id` estable, sin `prefers-reduced-motion`, estados vacíos sin ilustración, chat y botón de ayuda apilados en móvil, `/ayuda` con texto repetido y sin acordeones, búsqueda de catálogo sensible a mayúsculas/tildes, `setMonth` desborda en fin de mes, sincronización con el CRM dentro del checkout (hasta 15 s), `X-Powered-By`, imágenes Docker con tag `latest`, archivos `.bak` legibles en el servidor.

## 4. No se pudo verificar
Pantallas con sesión (campus, admin, docente, empresa, checkout); explotación real de los hallazgos autenticados (no se crean cuentas en producción); contenido de los respaldos publicados; la contraseña real de las cuentas demo; que los buzones `hola@`/`privacidad@` existan; consultas lentas reales (sin `EXPLAIN`).
