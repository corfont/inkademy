# Cómo trabajar en este repo

Este archivo no existía hasta el 22-sep-2026 — Inkademy era el único
sistema del portafolio sin su propio `CLAUDE.md`. Ver `../CLAUDE.md` (un
nivel arriba) para la infraestructura compartida del portafolio (VPS,
puertos, jerarquía de sitios, SSO) — acá solo lo propio de este repo.

## Acceso al VPS

- **Host:** `2.25.200.202` — mismo servidor que el resto del portafolio.
  Detalle completo (usuario `deploy`, llave SSH, firewall) en `../CLAUDE.md`.
- **Ubicación:** `/home/deploy/apps/inkademy`.

## Despliegue — alineado al patrón `git push` el 22-sep-2026

Hasta el 22-sep-2026, este era el único sistema desplegado con `git clone`
desde GitHub + `git pull` manual (conectando como usuario del sistema
operativo, no necesariamente `deploy`) — distinto del resto del portafolio
(`git push` directo con `receive.denyCurrentBranch=updateInstead`). Se
alineó al mismo patrón:

```bash
git remote add vps ssh://deploy@2.25.200.202/home/deploy/apps/inkademy  # una sola vez
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_inkapitales_vps" git push vps main
```

Verificado el 22-sep-2026: `git config receive.denyCurrentBranch
updateInstead` activado en el repo del VPS, probado con un push real
(no-op, ambos lados ya estaban en el mismo commit) — no se tocó código ni
se reconstruyó ningún contenedor en esa verificación.

**Lo que NO cambió, a propósito** (no confundir "alinear el mecanismo de
git" con "tener un despliegue automatizado como el resto"):
- **No existe `deploy.sh`** para este sistema todavía. Un `git push`
  actualiza los archivos en el working tree del VPS, pero NO reconstruye
  ni reinicia ningún contenedor — eso sigue siendo un paso manual
  (`docker compose -f docker-compose.prod.yml build/up`) después de cada
  push. Construir ese script es un pendiente aparte, más grande, no
  incluido en esta alineación.
- **`docker-compose.prod.yml` sigue sin versionar en git, a propósito**
  (no es un archivo olvidado, como sí lo era el caso análogo que motivó
  esto en Licita-Perú) — trae credenciales reales en texto plano
  (`MINIO_ROOT_PASSWORD`, `POSTGRES_PASSWORD`) directo en el YAML, no via
  variables de entorno de un `.env`. Commitearlo filtraría esas
  credenciales al historial de GitHub. Queda como el único sistema del
  portafolio con este patrón — el resto separa secretos a `.env.production`
  y versiona su `docker-compose.prod.yml` limpio. Si se prioriza alinear
  esto también, hay que primero mover esas credenciales a variables de
  entorno.

**⚠️ Incidente real, 29-sep-2026 — `docker-compose.yml` (el archivo
DEV/genérico, SÍ versionado en git) y `docker-compose.prod.yml` (el real,
sin versionar) comparten el mismo nombre de proyecto Compose (derivado
del nombre del directorio, `inkademy` — ninguno de los dos fija
`name:`/`COMPOSE_PROJECT_NAME` explícito) y el mismo volumen de Postgres
(`pgdata`)**: correr `docker compose -f docker-compose.yml up -d web`
(el archivo por defecto, sin `-prod`) RECREA los mismos contenedores
`inkademy-web-1`/`inkademy-api-1`/etc. que ya corrían bajo
`docker-compose.prod.yml`, reemplazando su configuración — en este caso,
el mapeo de puertos: `docker-compose.yml` publica `3000:3000`/`4000:4000`
(los puertos INTERNOS de los contenedores, pensados para dev local),
mientras que el real es `8082:3000`/`8083:4000` (ver tabla del portafolio
compartido) — el sitio quedó inalcanzable en 8082/8083 hasta corregirlo.
**Sin pérdida de datos** en este incidente puntual (ambos archivos usan
el mismo volumen `pgdata` Y el mismo `env_file: .env`, así que no hubo
mezcla de credenciales tampoco) — pero eso es specific a este estado
actual de ambos archivos, no una garantía general: si algún día divergen
en el nombre del volumen o en qué `.env*` usan, el mismo error SÍ
perdería datos o mezclaría secretos. **Cualquier comando `docker compose`
contra este proyecto necesita `-f docker-compose.prod.yml` explícito,
siempre** — el archivo sin sufijo es solo para desarrollo local, nunca
para tocar el VPS. Encontrado y corregido en la misma sesión que agregó
el fix de nav de Alumno (ver más abajo).

## Bug real corregido: CORS con un solo origen fijo bloqueaba el login vía `www.inkademy.lat` (23-sep-2026)

Reportado por el usuario como "no puedo entrar a Inkademy con mi cuenta"
— con la cuenta real (`jose.cortes@inkapitales.com`) ya creada y
verificada por API/curl funcionando perfecto, el login seguía fallando
en el navegador real con "No pudimos conectar", reproducible en
múltiples dispositivos/redes/navegadores (wifi, datos móviles del
celular directo, VPN, incógnito) — descartando por completo DNS, TLS,
bloqueo de cuenta, rate-limit y problemas de red (todo verificado con
`curl`/`dig`/check-host.net contra producción real antes de sospechar
del código).

**Causa raíz real**, encontrada ejecutando un diagnóstico en vivo dentro
de la consola del navegador en la página real (no adivinada): `apps/api/
src/main.ts` llamaba `app.enableCors({ origin: config.get<string>
("APP_URL", ...), credentials: true })` — un ÚNICO string fijo
(`https://inkademy.lat`) como origen permitido. Pero `../Caddyfile`
enruta TANTO `inkademy.lat` COMO `www.inkademy.lat` al mismo frontend
(ambos con certificado TLS propio válido) — cualquier persona que
entrara por la variante con "www." (autocompletado del navegador, un
marcador viejo) mandaba `Origin: https://www.inkademy.lat`, y la API
seguía devolviendo `Access-Control-Allow-Origin: https://inkademy.lat`
(el valor fijo, sin coincidir) — el navegador bloqueaba CUALQUIER
fetch/XHR real (login incluido) con un error de CORS, mientras una
navegación simple (GET de página completa, sin preflight) cargaba
perfecto — exactamente el síntoma reportado ("el sitio carga pero no
entro"). Verificado de forma concluyente comparando con `curl` el header
`Access-Control-Allow-Origin` real devuelto para `Origin:
https://inkademy.lat` vs. `Origin: https://www.inkademy.lat` antes del
fix (el segundo NUNCA coincidía).

**Fix real**: `main.ts` ahora arma un `Set` con AMBAS variantes
(con/sin "www.") del hostname de `APP_URL` y usa una función de
validación de origen en vez de un string único — deja pasar cualquier
origen dentro de ese set, rechaza el resto. Reconstruido
(`docker compose -f docker-compose.prod.yml build api && ... up -d api`)
y verificado con `curl` real contra producción: ambos orígenes ahora
reciben su propio header `Access-Control-Allow-Origin` correcto.

**Por qué costó tanto diagnosticarlo**: cada prueba aislada (mía, vía
`curl`; y la del propio usuario probando `https://inkademy.lat/login`
explícitamente, sin "www.") usaba el origen CORRECTO por casualidad,
así que siempre pasaba — el bug solo se manifestaba en el uso real y
orgánico del usuario (que sí pasaba por www. en algún momento). La regla
abstracta (CORS de un solo origen fijo rompe si el mismo backend se
sirve bajo más de un hostname) queda documentada en
`~/.claude/CLAUDE.md` (regla global, sección 3) para no repetir esta
misma investigación larga en otro sistema del portafolio.

## Cuentas de personal (Platform Core) ya no pasan por "Completa tu perfil" (23-sep-2026)

Pedido explícito del usuario tras probar su propia cuenta real: el
formulario de `completar-perfil` (documento, país, ciudad, cargo,
empresa, nivel de experiencia, áreas de interés) es de Inkademy, pensado
para un alumno/empresa que se AUTO-registra ahí (necesario para emitir
certificado y personalizar recomendaciones de curso) — no tiene sentido
para una cuenta ADMIN/TEACHER/SUPPORT provisionada desde el CRM vía
Platform Core. **Corregido**: `platform-core.service.ts` marca
`profileCompletedAt` automáticamente en creación/actualización para
cualquier rol distinto de STUDENT — STUDENT queda afuera a propósito por
si este mismo puente algún día provisiona alumnos reales (ej. matrícula
B2B masiva), que sí deben completar su perfil real.

**Decisión de diseño tomada, NO construida todavía** (sin superficie de
UI que la necesite hoy — ver abajo): "Cargo actual" y "Empresa" deberían
sincronizarse con el CRM **solo cuando la persona sea un `Employee` real
de Inkapitales** (dato real del CRM) — un docente contratado externo o
un alumno NO tienen ningún registro ahí, así que para ellos el campo
sigue siendo texto libre como hoy. Para "Empresa" específicamente: si es
personal administrando esta instancia de Inkademy, la empresa es
Inkapitales (sale del CRM); si Inkademy se vende/alquila a otra empresa
(marca blanca, ver `docs/aprovisionar-instancia-arrendada.md`), la
empresa la determina el tenant/instancia al registrarse, no algo que el
usuario individual escriba.

**Por qué no se construyó ahora**: se verificó que `jobTitle`/
`companyFreeText` (los campos en cuestión) SOLO existen en dos pantallas
— `completar-perfil` (el personal ya la salta por completo, ver arriba)
y `campus/perfil`, que es exclusiva del área de ALUMNO
(`(campus)/campus/perfil/page.tsx`). No existe ninguna pantalla de "Mi
perfil" para ADMIN/TEACHER/SUPPORT donde estos campos lleguen a
mostrarse — construir el lookup CRM-por-email para sincronizarlos sería
trabajo especulativo sin una superficie real que lo consuma. Retomar
este diseño (un endpoint de solo lectura en el CRM, `GET /api/
integraciones/empleado?email=...`, que devuelva `jobTitle`/empresa si el
correo corresponde a un `Employee` real) el día que Inkademy tenga una
pantalla de perfil para personal, o que este dato se use en algo real
(certificados, reportes, liquidaciones).

## Revisión de feedback de alumnos y docentes (7-oct-2026)

Pedido directo del usuario (excepción a «Inkademy no se toca» de `../CLAUDE.md`). Cambios desplegados (`docker compose -f docker-compose.prod.yml build api web worker`):
- **Clases en vivo**: una sesión creada DESPUÉS de que los alumnos se matricularon nunca llegaba a su agenda (los `CalendarEvent` solo se creaban al matricularse). Ahora `CalendarService.addLiveSessionToEnrolled()` los agrega al crear la sesión (única y serie); además «próxima clase» usa `endsAt > now` (antes `startsAt > now` hacía desaparecer la clase en curso) y el aula muestra un aviso con botón para entrar.
- **Aula**: cualquier módulo se abre desde la barra lateral (un módulo con solo lecturas, sin clases, no se podía abrir); avance con cola de reintentos (antes un fallo al guardar se ignoraba en silencio) y 95 % del video cuenta como visto; SCORM con tamaño elegible y pantalla completa; el estado del examen SCORM se muestra aunque el paquete no reporte nota.
- **Checkout**: formato y validación de tarjeta (`lib/card-format.ts`: solo dígitos, MM/AA válido, Luhn, CVC de 3 o 4 según la marca).
- **Marca**: logo centrado en la barra lateral y proporcional (`object-fit: contain`); vista previa con el ancho real de la barra.
- **Certificados**: «Regenerar» ya no borra el PDF actual antes de tener el nuevo (si la generación fallaba, quedaba para siempre «generando…»).
- **Regalías**: la fecha de fin ya era opcional (vacía = indefinida); ahora se ve explícito en la pantalla.
- **Pendiente propuesto, sin construir**: pantalla de bienvenida/introducción del curso (video, imagen, PPT) antes de las clases; reproductor de video propio (hoy es el `<video>` nativo del navegador).

## Matriz de hallazgos de un revisor externo (10/12-oct-2026)

Se verificó cada uno de los 49 hallazgos contra el código (no se asumió que fueran ciertos). Desplegado en dos tandas; migraciones aplicadas a mano contra Postgres con `IF NOT EXISTS` (mismo patrón que arriba): `support_ticket_attention`, `backup_verification`, `notification_trace`, `course_welcome`.
- **Reportes en Excel**: `report-kit.ts` anota todo lo que dibuja (indicadores, tablas, gráficos) en `ctx.sheets/kpis/notes` y `reportCollector` (AsyncLocalStorage) lo recoge; `report-xlsx.ts` arma el .xlsx. El Excel sale del mismo generador del PDF, así nunca difieren. Endpoints `admin/reports/:key.xlsx` y `admin/finance/report.xlsx`; claves nuevas `horas-dictadas-docentes` y `liquidaciones-docentes`.
- **Backups**: el worker calcula SHA-256, vuelve a leer lo guardado, abre el zip y compara filas por tabla (`verifyBackup`); la pantalla distingue «archivo generado», «integridad verificada» y «recuperación probada» (esta última la registra una persona: el sistema no puede restaurar sobre la base real).
- **Notificaciones**: `Notification.errorMessage/attempts`; FAILED solo tras agotar reintentos; `admin/notifications/log` y `/test`.
- **Soporte**: `SupportTicket.assigneeId/dueAt/firstResponseAt/resolvedAt` y `PATCH support/tickets/:id` (antes RESOLVED/CLOSED nunca se asignaban).
- **Base de conocimiento de la IA**: acepta .docx (lector de zip propio con `zlib`, sin dependencia nueva) y, si supera el tope, elige los fragmentos más relevantes a la pregunta en vez de cortar el final.
- **Aviso a cursos guardados**: al crearse la primera clase próxima de un curso, `notifyCourseDatesConfirmed` avisa en la campana a quien lo guardó (correo solo con consentimiento de marketing).
- **Pendiente por decisión del dueño** (ver el informe): certificado con horas/fechas, encuesta por categorías, programas (comprar uno no matricula sus cursos), cotización pública, roles finos de administración, datos bancarios de regalías, referidos (Ley 29733).

## Matriz de hallazgos, 3.ª tanda (12-oct-2026) — desplegada

Migraciones aplicadas en producción: `20261012150000_payment_and_contract_details` (datos de pago/contrato, vigencia de licencias),
`20261012160000_audit_log_hidden` (ocultar en vez de borrar auditoría), `20261012170000_rating_dimensions` (4 dimensiones sembradas).
Supuestos tomados por defecto (el usuario no respondió las preguntas): cuenta bancaria de regalías reutiliza la del perfil; método de pago
«convenio» solamente; estado de licencia derivado de su fecha; cortesía con fecha de fin (no de inicio); ajustes auditados con `diffForAudit`;
etiquetas de certificado `courseHours`/`coursePeriod` (hay que colocarlas en el editor de la plantilla); calificación por dimensiones con
aspectos a mejorar. Las decisiones pendientes se resolvieron después (ver sección siguiente).

## Decisiones de la matriz resueltas (12-oct-2026) — desplegadas

Migraciones aplicadas: `20261012180000_quote_leads`, `20261012190000_catalog_filters`, `20261012200000_academic_profile_referrals`, `20261012210000_admin_roles`.
- **Programas**: comprar, recibir de cortesía o asignar un cupo B2B de un Programa matricula al alumno en cada curso (`EnrollmentService.enrollProgramCourses`,
  idempotente; si ya tiene el curso activo/completado, ese avance cuenta). El avance del programa es el promedio de sus cursos obligatorios y al completarlos todos
  se emite el certificado del programa (`CertificateService.issueForProgram`). El aula de un programa (`ProgramView`) lista sus cursos. Se repartieron los 2 programas
  que ya existían en producción.
- **Cotización pública** (`POST /public/quote-requests`, 5 por 10 min por IP, campo trampa `website`): guarda un `QuoteLead`, avisa al correo de contacto de la plataforma,
  acusa recibo y registra el contacto en el CRM (`/api/integraciones/partners`, solo con RUC de 11 dígitos). Se atiende en Admin → Cotizaciones.
- **Catálogo**: `Course.weeklyHours/classDays/skills` (los declara el admin en el editor) y filtros `weeklyLoad`, `classDay`, `skill`; opciones de competencias en `GET /catalog/filter-options`.
- **Panel de empresa**: las 4 tarjetas abren su detalle (`/empresa/[id]/detalle?kpi=progress|risk`, colaboradores, cupos).
- **Perfil académico y referidos**: campos en `User`; `GET /profile/referral` crea el código la primera vez; el registro acepta `?ref=`. Nunca se piden contactos de terceros.
- **Roles de administrador por módulo**: `AdminRole` + `User.adminRoleId`; `AdminModuleGuard` (guard global) aplica el rol en todas las rutas `/admin/*` según `adminModuleForApiPath`
  (lo no mapeado cae en "sistema"; la gestión de roles es solo de administradores completos). Quien no tiene rol sigue siendo administrador completo. Menú filtrado en `admin/layout.tsx`.
  Verificado con la compilación real y un doble de la BD (no con una cuenta restringida real: no se crean cuentas en producción). Pantalla: Admin → Roles de administrador.
- Pendiente sin decisión: nota/puntaje del SCORM visible al alumno (el usuario lo dejó para revisar).

## Revisión previa al lanzamiento (12-oct-2026)
Informe completo y priorizado en `REVIEW.md` (qué se corrigió hoy y qué sigue pendiente). Lo que cambia cómo se trabaja aquí: las pasarelas de pago rechazan en producción sin clave real
(`ALLOW_PAYMENT_SIMULATION=true` para simular a propósito); el bucket solo es público en `materials/ scorm/ certificates/ subtitles/ avatars/ admin-uploads/` (prefijos privados:
`StorageService.PRIVATE_PREFIXES`, se sirven con `getAccessUrl()`, enlace firmado con la dirección pública); un rol de administrador acotado no puede crear/modificar usuarios ni ver respaldos;
`AdminModuleGuard` normaliza la ruta a minúsculas y cubre `/grants` y `/orders/:id/cancel`; certificados HTML con variables escapadas y sin JavaScript. Respaldo diario `scripts/backup-db.sh`.
