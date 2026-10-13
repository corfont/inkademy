# Matriz de completitud — Inkademy — 2026-10-12

Alcance: todo el monorepo (88 páginas web, 24 módulos API, worker BullMQ, 72 modelos Prisma, 94 migraciones). Revisión **solo de lectura** contra los catálogos de la skill `system-completeness` (TBL, REP, FRM, MOD, BD, CAL, FE, DSH, ARC, INT, JOB, NOT). No se modificó código ni se tocó el servidor.
Seguridad (ASVS): la skill `owasp-asvs` no está instalada en este entorno; la seguridad se remite a `REVIEW.md` (revisión del 12-oct, ya con correcciones) y aquí solo se registra lo que cruza con completitud.
Método: 5 auditorías paralelas por área; "Hecho" solo con evidencia archivo:línea. Muestreé por mi cuenta los hallazgos más graves contra el código y los confirmé (marcados ✔ en "Pendientes"). Lo que exige ejecución real (VoiceOver, Core Web Vitals, restauración de backup, EXPLAIN) queda **No verificado**.
Abreviaturas de ruta: `web` = `apps/web/src`, `api` = `apps/api/src`, `ADM` = `web/app/(admin)/admin`, `EMP` = `web/app/(empresa)/empresa/[companyId]`.

## 1. Listados y tablas (TBL)

Causa raíz común: **no existe componente compartido** de tabla, paginador, filtros, exportar, estado vacío ni skeleton; cada pantalla reimplementa lo suyo (13 pantallas con `<table>` + ~23 gestores de tarjetas).

| ID | Módulo | Estado | Evidencia | Notas |
|---|---|---|---|---|
| TBL-01 | Usuarios, gastos, licencias, roles, convenios, regalías, campañas, listas, docs IA | Hecho | `web/components/admin/UsersManager.tsx:884-962` | |
| TBL-01 | Áreas, programas, empresas, órdenes, matrículas, soporte (admin) | Parcial | `AreaManager.tsx`, `ProgramManager.tsx`, `ADM/empresas/page.tsx` | Solo editan / sin botón crear |
| TBL-02 | Órdenes, soporte, empresas | Hecho | `ADM/ordenes/page.tsx:126`, `ADM/soporte/page.tsx:41` | |
| TBL-02 | Matrículas, colaboradores, auditoría, log | Parcial | `ADM/matriculas/page.tsx:81-97` | Sin ficha de detalle |
| TBL-03 | Usuarios, catálogo, regalías, convenios, matrículas (extender acceso) | Hecho | `UsersManager.tsx` (EditUserModal), `ExtendAccessControl` | |
| TBL-04 | Gestores con ConfirmDialog (~15) | Parcial | `ExpenseManager.tsx:158` (mensaje genérico) | Sin "deshacer" en ninguna parte |
| TBL-04 | Tarifas, bitácora y adelantos docentes | Hecho | `web/components/ui/ConfirmButton.tsx`, `TeacherPayrollManager.tsx` | 13-oct: confirmación que nombra el registro (tarifa, adelanto, horas) |
| TBL-04 | Quitar regalía/convenio/docente de un curso | Hecho | `RoyaltyRecipientManager.tsx`, `PartnerInstitutionManager.tsx` | 13-oct: regalía y convenio con ConfirmButton; quitar docente de curso ya tenía ConfirmDialog (hallazgo impreciso) |
| TBL-04 | Borrado lógico | Parcial | `api/modules/admin/admin.service.ts:3185-3321` | Solo usuarios con `status`; resto borra físico con snapshot |
| TBL-05 | Duplicar/clonar (cursos, exámenes, plantillas, campañas) | Falta | grep sin botones | Baja prioridad |
| TBL-06 | Acciones masivas | Falta | solo `CourtesyGrantsHistory.tsx:84-122`, `BulkDeleteSection.tsx` | Resto sin selección múltiple |
| TBL-07 | Acciones por fila agrupadas y consistentes | Parcial | `CertificatesTable.tsx:225-251` | Botones sueltos, orden distinto por pantalla |
| TBL-10 | Usuarios, órdenes, matrículas, mis cursos | Hecho | `UsersManager.tsx:312`, `ADM/ordenes/page.tsx:85` | Sin debounce; inputs sin `aria-label` |
| TBL-10 | Empresas, soporte, pagos, reclamos, cotizaciones, catálogo admin y ~10 más | Falta | `ADM/empresas/page.tsx`, `ADM/soporte/page.tsx` | Sin buscador |
| TBL-11 | Auditoría, log notificaciones, certificados, horas docentes | Hecho | `AuditLogViewer.tsx:176-200` | Sin "Limpiar filtros" ni indicador |
| TBL-11 | Usuarios, órdenes, matrículas, empresas, soporte, reclamos, cotizaciones | Falta | | Sin filtro por estado/rol/fecha |
| TBL-12 | Orden por columna | Falta | 0 `aria-sort` en todo `web/` | Órdenes y catálogo usan un `<select>` |
| TBL-13 | Filtros en la URL | Parcial | `ADM/ordenes/page.tsx:47-51` | Solo órdenes, matrículas y catálogo público |
| TBL-14 | Vistas guardables | Falta | grep cero | |
| TBL-15 | Búsqueda/orden en servidor | Parcial | `admin.service.ts:2261,2898,2979` | Con tope fijo sin paginar; certificados/catálogo/cortesías filtran en cliente |
| TBL-20 | Paginación con tamaño y total | Parcial | `AuditLogViewer.tsx:278-290`, `app/notificaciones/page.tsx:106-120` | Solo 4 pantallas, sin selector ni total |
| TBL-20 | Resto de listados | Falta | órdenes 50/200, matrículas 100, usuarios 100, reclamos 300, cotizaciones 200 ✔ | **Recorte silencioso** sin aviso |
| TBL-21 | Columnas configurables | Falta | grep cero | |
| TBL-22 | Alineación y formato | Parcial | `OtherExpensesDetail.tsx:46-79` (bien); `ADM/ordenes/page.tsx:110,135` (no) | |
| TBL-23 | Densidad | Falta | grep cero | |
| TBL-24 | Fila de totales | Falta | 0 `<tfoot>` | |
| TBL-25 | Agrupación / expandibles | Parcial | `AuditLogViewer.tsx:207`, `UsersManager.tsx:204` | |
| TBL-26 | Edición en línea | No verificado | | Se edita por formulario/modal |
| TBL-27 | Estados con texto | Parcial | `ADM/ordenes/page.tsx:137`, `ADM/matriculas/page.tsx:90` | Órdenes, matrículas, empresas, soporte muestran código crudo (PAID, ACTIVE, URGENT) |
| TBL-28 | Encabezado fijo (sticky) | Falta | 0 `sticky` en tablas | |
| TBL-29 | Truncado con tooltip | Falta | | |
| TBL-30 | Cargando | Falta | 0 `loading.tsx`, 0 skeleton compartido ✔ | Solo texto "Cargando…" en gestores |
| TBL-31 | Vacío con acción | Parcial | `UsersManager.tsx:334` | Solo texto; empresas/soporte ni fila vacía |
| TBL-32 | Sin resultados + limpiar | Parcial | `EnrollmentListFilterBar.tsx:54-56` | Sin botón limpiar |
| TBL-33 | Error + Reintentar | Parcial | `web/lib/safe-fetch.ts` (withFallback relanza en producción) | Resuelto el dato inventado (13-oct, verificado en código y build); sigue sin botón Reintentar en gestores cliente |
| TBL-34 | Actualizar datos | Parcial | `router.refresh()` en gestores | Sin botón manual |
| TBL-40 | Reportes (centro, finanzas, horas, liquidaciones) | Hecho | `web/components/admin/ReportDownloadButtons.tsx`, `api/reports/reports.controller.ts:38` | PDF + Excel del mismo generador |
| TBL-40 | Certificados | Parcial | `CertificatesTable.tsx:114-141` | ZIP de PDF, no lista xlsx/csv |
| TBL-40 | ~20 listados restantes (usuarios, órdenes, matrículas, auditoría, empresas, regalías, soporte, reclamos, etc.) | Falta | sin botón Exportar | Ver REP |
| TBL-41 | Importación masiva | Parcial | `api/modules/admin/admin.controller.ts:511-533` | Solo preguntas de examen; síncrona, sin vista previa ni errores descargables |
| TBL-50 | Semántica de tabla | Parcial | `<thead><th>` en todas | Sin `scope`, `aria-sort`, `<caption>` |
| TBL-51 | Navegación grid ARIA | No aplica | tablas estáticas, no grid | |
| TBL-52 | Blancos táctiles / foco | Parcial | `Button.tsx` ≥36 px; `CourtesyGrantsHistory.tsx:122` checkbox ~13 px | Foco global `globals.css:195` |
| TBL-53 | Vista móvil | Parcial | 34 `overflow-x-auto` | Scroll, sin variante de tarjetas |
| TBL-60 | Permiso en servidor + IDOR | Hecho | `admin.controller.ts` 150/150 con `@Roles`; `app.module.ts:88-91`; `support.service.ts:103`; `CompanyGuard` | 4 de 124 `@Body` sin pipe Zod |
| TBL-61 | Auditoría de cambios críticos | Parcial | `api/modules/admin/audit-log.util.ts` | 13-oct: ahora también crear usuario, ampliar acceso, forzar avance y exportaciones |
| TBL-61 | Sin auditar: forzar avance 0/100 %, ampliar acceso (incl. SUPPORT), createUser, updateCourse, gastos, tarifas, regalías, regenerar certificados | Parcial | `admin.service.ts` (createUser, extendEnrollmentAccess), `enrollment.service.ts` (adminSetProgress) | 13-oct: cubiertos esos 3; siguen sin auditar updateCourse, gastos, tarifas, regalías y regenerar certificados |
| TBL-62 | Exportaciones auditadas y con permiso propio | Hecho | `reports.service.ts` auditExport, `reports.controller.ts`, `admin.controller.ts` (finanzas) | 13-oct: REPORT_EXPORT con filtros; permiso propio de exportación sigue pendiente (solo @Roles) |

## 2. Reportes, descargas y dashboards (REP, DSH)

| ID | Módulo | Estado | Evidencia | Notas |
|---|---|---|---|---|
| REP-01 | Centro de reportes (10) + finanzas | Parcial | `api/modules/admin/reports/report-xlsx.ts:7-10` | Montos y fechas salen como **texto**, no número/fecha |
| REP-01 | ~20 listados restantes | Falta | sin endpoint ni botón | Regla madre incumplida |
| REP-02 | CSV | Falta | único CSV: `CourseEditor.tsx:2095-2105` (asistencia) | Sin CSV en el resto |
| REP-03 | Criterios en el archivo | Parcial | `ReportDownloadButtons.tsx:20`, `FinanceExportControls.tsx:57` | No pasan orden ni columnas; `ReportsCenter.tsx:51` sin parámetros |
| REP-04 | Exportación en segundo plano | Falta | `reports.service.ts:83-108` | Todo síncrono; `alumnos-registrados` carga toda la tabla en memoria |
| REP-05 | Nombre con fecha/hora | Parcial | `reports.service.ts:131` (nombre fijo) | ZIP de certificados sí (`CertificatesTable.tsx:130`) |
| REP-06 | Inyección de fórmulas | Falta | `CourseEditor.tsx:2063-2065` (`csvEscape` no neutraliza `= + - @`) | Excel: No verificado |
| REP-07 | Permiso "exportar" y enmascarado | Parcial | `reports.controller.ts:11-14` | SUPPORT descarga todos los correos de alumnos |
| REP-08 | Exportación auditada | Hecho | `api/modules/admin/reports/reports.service.ts` auditExport | 13-oct: PDF y Excel de reportes y finanzas; falta auditar exportaciones de listados (aún no existen) |
| REP-10 | Vista de impresión | Falta | solo 2 `print:hidden` ✔ | Sin `@media print` |
| REP-11 | PDF A4, saltos, totales | Parcial | `reports/report-kit.ts:25-27,146,320` | Fuente embebida sin validar |
| REP-12 | Fecha de generación y zona horaria | Parcial | `report-kit.ts:146`, `report-xlsx.ts:44` | Sin zona horaria declarada |
| REP-13 | Totales consistentes con pantalla | Parcial | `admin.service.ts:35-37,95-99` vs `reports.service.ts:353-360` | KPI certificados excluye revocados, el reporte no; sin prueba numérica |
| REP-20 | Parámetros y periodos | Parcial | `reports.service.ts:67-71` | `new Date(to)` excluye el último día; sin presets |
| REP-21 | Comparativos | Parcial | `ADM/page.tsx` | Solo en dashboard de inicio |
| REP-22 | Drill-down | Falta | `DashboardCharts.tsx:125-210` | |
| REP-23 | Estados vacío/cargando/error en reportes | Parcial | `web/lib/safe-fetch.ts` | Datos de ejemplo al fallar la API |
| REP-24 | Gráficos accesibles y descargables | Parcial | `report-kit.ts:353,451,548` | Tabla en Excel; sin imagen |
| REP-30 | Envío programado | Parcial | `admin.controller.ts:1170` | Solo envío manual único del estado financiero |
| REP-31 | Reportes guardados/favoritos | Falta | | |
| REP-32 | Compartir con permiso | Falta | | |
| REP-40 | Decimales exactos | Parcial | `admin.service.ts:2416-2430` | `Number()`/`toFixed(2)` sobre Decimal; redondeo sin documentar |
| REP-41 | UTC en BD, zona del usuario | Parcial | `reports.service.ts:285` (solo horas-dictadas usa Lima) | Resto usa zona del servidor |
| REP-42 | Reproducible | Parcial | | Parámetros no figuran en el nombre del archivo |
| REP-43 | Horas docentes (totales de liquidación) | Hecho | `admin.service.ts` listTeacherSessionHours (sin `take`) | 13-oct: se quitó el tope de 500 sesiones que subestimaba los totales por docente |
| REP-43 | Órdenes (50/200), matrículas (100), gastos (200), usuarios (100), reclamos (300), cotizaciones (200) | Falta | `admin.service.ts:2261,2304,2737,2898,2979` ✔ | Recorte silencioso sin paginador ni aviso; sigue pendiente (etapa 2: paginación compartida) |
| DSH-01 | Definición, periodo y fuente por indicador | Falta | `ADM/page.tsx:134-158` | |
| DSH-02 | Filtros globales en URL | Falta | solo finanzas (`FinanceExportControls.tsx:23-31`) | |
| DSH-03 | Comparación y metas | Parcial | `ADM/page.tsx:117-126` | ▲/▼ en 2 KPI; sin metas |
| DSH-04 | Gráfico correcto | Hecho | `DashboardCharts.tsx:125-210` | |
| DSH-05 | Alternativa tabla / descarga / drill-down | Falta | `DashboardCharts.tsx` | |
| DSH-06 | Estado por widget | Parcial | `ADM/page.tsx:60-65` (`withFallback` con MOCK) | Un fallo sustituye todo con datos de ejemplo |
| DSH-07 | Personalizable | Falta | | |
| DSH-08 | Cifras = reportes | Hecho | `admin.service.ts` getKpis (currency: "PEN" + salesUsdLast30d) | 13-oct: ventas solo en soles y dólares aparte en la tarjeta; el KPI de estudiantes activos sigue usando findMany |
| DSH-09 | Rendimiento | Parcial | `admin.service.ts:52` | `findMany`+`.length` en vez de `count` |
| KPI | Tarjetas clicables (estándar 12-oct) | Parcial | Hecho solo en `EMP/page.tsx:45-58` | Falta en admin inicio/finanzas/órdenes, docente y campus |

## 3. Formularios y entrada (FRM)

| ID | Módulo | Estado | Evidencia | Notas |
|---|---|---|---|---|
| FRM-01 | Etiqueta visible | Parcial | `login/page.tsx:150-170` (bien); `CourseEditor.tsx:1315,1646,1808` (solo placeholder) | 40 `<Label>` sin `htmlFor`; sin marcador de obligatorio común |
| FRM-02 | Secciones / wizard / borrador | Parcial | `ui/Tabs.tsx` | Sin wizard ni progreso |
| FRM-03 | Tipo y `autocomplete` | Parcial | `registro/page.tsx:75-91` (bien) | Faltan en perfil, completar-perfil y checkout (comprador) |
| FRM-04 | Ayuda contextual | Parcial | `registro/page.tsx:92` | Sin ejemplos de formato |
| FRM-10 | Validación servidor | Hecho | `api/common/pipes/zod-validation.pipe.ts:17-24` | 120 de 124 `@Body` con pipe |
| FRM-10 | Mensajes claros | Parcial | `validation.ts:21-24` | Salen en inglés ("email: Invalid email") |
| FRM-11 | Resumen de errores y foco | Falta | sin `setFocus`/resumen | Errores del servidor a un `Callout` genérico |
| FRM-12 | No borrar lo escrito | No verificado | | |
| FRM-13 | RUC/DNI/duplicados | Falta | `packages/shared/src/validation.ts:169-172,217-246` | Sin validación de formato de RUC/DNI en checkout, cotización, reclamo, perfil |
| FRM-13 | Contraseña | Hecho | `validation.ts:10-17` | |
| FRM-14 | Confirmar destructivas / revisar antes de enviar | Parcial | ver TBL-04 | Sin revisión previa en checkout |
| FRM-20 | Estado de envío | Hecho | `login/page.tsx`, `checkout/page.tsx:433,499` | |
| FRM-21 | No pedir datos ya dados | Parcial | `checkout/page.tsx:295-299` | |
| FRM-22 | Cambios sin guardar | Falta | 0 `beforeunload`/`isDirty`; `Dialog.tsx:31-32` cierra al clic en fondo | |
| FRM-23 | Teclado | Hecho | `hooks/useFocusTrap.ts:52` | `CourseEditor` principal: Enter no envía (Parcial) |
| FRM-24 | Autenticación accesible | Hecho | `ui/Input.tsx:11-45` | Pegar permitido, ojo con `aria-pressed` |
| FRM-25 | Fechas | Parcial | `type="date"` en 14 archivos | Sin rangos min/max |
| FRM-26 | Combobox en listas largas | Falta | `<Select>` nativo | |
| FRM-30 | Importar con plantilla | Parcial | `assessment.service.ts:1190-1290` | Solo preguntas de examen |
| FRM-31 | Importación en segundo plano / dry-run | Falta | `admin.controller.ts:526-533` | |
| FRM-32 | Subida de archivos | Parcial | `ui/FileDropzone.tsx:54-66`; límites en servidor | Sin progreso real, límites de cliente solo en `AssessmentRunner.tsx:192` |
| FRM-40 | Borradores | Falta | grep cero | |
| FRM-41 | Campos de auditoría en cada registro | Parcial | `prisma/schema.prisma` | `createdAt` falta en 32 de 72 modelos, `updatedAt` en 47, `createdBy` en 6 |
| FRM-42 | Concurrencia | Falta | 0 `expectedVersion`/`ifMatch` | Gana la última escritura |

## 4. Módulos base, apariencia y administración (MOD)

| ID | Módulo | Estado | Evidencia | Notas |
|---|---|---|---|---|
| MOD-10 | Perfil | Parcial | `web/app/(campus)/campus/perfil/page.tsx:19,422` | Solo en `/campus/perfil`; admin (sin rol STUDENT) y empresa sin enlace |
| MOD-10 | Idioma y zona horaria del perfil se aplican | Falta | `LocaleSwitcher.tsx:15`, `lib/i18n/request.ts:9` | Se guardan pero el idioma sale de cookie y los formatos son "es-PE"/Lima fijos |
| MOD-11 | Cambiar contraseña | Parcial | `api/modules/auth/auth.controller.ts:165`, `ChangePasswordCard.tsx` | Mismo alcance por rol que el perfil |
| MOD-11 | Cambiar correo con verificación | Falta | campo Email `disabled` | |
| MOD-12 | 2FA con códigos de respaldo | Falta | grep cero en api/web/schema ✔ | Ni para ADMIN |
| MOD-13 | Sesiones activas y dispositivos | Falta | `auth.service.ts:67-69,206` | Sesión única: un login nuevo expulsa al anterior sin aviso |
| MOD-14 | Preferencias de notificación y apariencia por usuario | Falta | `ThemeToggle.tsx:23,29` | Tema solo en localStorage |
| MOD-15 | Descarga de mis datos / eliminación (Ley 29733) | Hecho | `api/modules/privacy/*`, `web/app/privacidad/page.tsx` | 13-oct: descarga inmediata + solicitudes de rectificación/oposición/eliminación; verificado en producción con cuentas de prueba (luego borradas) |
| MOD-20 | Configuración sin tocar código | Parcial | `ADM/apariencia`, `ADM/configuracion` | Sin nombre de plataforma ni favicon; pasarelas, Zoom y Teams por entorno |
| MOD-21 | Catálogos administrables | Parcial | `AreaManager.tsx:36,108` | Áreas sin desactivar; países/tipos de documento fijos en código; `CountryConfig` sin uso |
| MOD-22 | Integraciones: secretos y probar conexión | Parcial | `settings/email-server-settings.service.ts:38` | Solo correo de prueba SMTP; sin prueba para SUNAT ni IA |
| MOD-23 | Plantillas editables con vista previa | Parcial | `CertificateTemplateManager.tsx`, `worker/src/templates/email-templates.ts` | Resto de correos fijos en código |
| MOD-24 | Config auditada y reversible | Parcial | `settings.service.ts:126-127` | Auditada con before/after; sin revertir |
| MOD-30 | Gestión de usuarios | Parcial | `admin.service.ts:3028-3214`, `UsersManager.tsx:707` | Sin invitación por correo, sin cambio obligatorio de clave, sin desbloqueo manual |
| MOD-30/33 | Flujo de bloqueo de cuenta | Hecho | `auth.service.ts` resetPassword, `admin.service.ts` resetUserPassword | 13-oct: restablecer la clave limpia failedLoginAttempts y lockedUntil (código desplegado; no probado con cuenta bloqueada real) |
| MOD-31 | RBAC por módulo y acción | Parcial | `common/guards/admin-module.guard.ts:33-62`, `packages/shared/src/admin-modules.ts` | 8 módulos × {VER, EDITAR}; sin crear/eliminar/exportar/aprobar |
| MOD-32 | Auditoría consultable y exportable | Parcial | `AuditLogViewer.tsx:135-155` | Sin exportar; no registra logins ni intentos fallidos; UI sin filtro por usuario |
| MOD-33 | Políticas configurables | Parcial | `validation.ts:10-15`, `auth.service.ts:104-105` | Política y bloqueo fijos en código; sin expiración ni inactividad |
| MOD-34 | Suplantación | Falta | grep cero | |
| MOD-35 | Multi-organización | Parcial | `common/guards/company.guard.ts`, `20260826190000_company_rls` | Guard + RLS en 7 tablas; solo 1 e2e de aislamiento; instancias arrendadas se aíslan por despliegue |
| MOD-36 | Copias y restauración | Parcial | `scripts/backup-db.sh`, `BackupManager.tsx` | Ver BD-50 (copia externa construida, pendiente de credenciales de Microsoft) |
| MOD-40 | Tema claro/oscuro/auto | Parcial | `layout.tsx:72`, `ThemeToggle.tsx:23-30` | Sin parpadeo; persistencia solo en localStorage, no en BD |
| MOD-41 | Tokens y contraste AA | Parcial | `globals.css:18-175` | `ash-400` 2,91:1; chips del sidebar con colores fijos |
| MOD-42 | reduced-motion / contrast | Falta | 0 usos en `web/` ✔ | `scroll-behavior: smooth` sin guarda |
| MOD-43 | Personalización por usuario | Falta | | Sin densidad, vistas guardadas ni sidebar colapsable |
| MOD-44 | Personalización por organización | Parcial | `AppearanceForm.tsx:139-590` | Falta nombre, favicon, módulos habilitados; sin marca por `Company` |
| MOD-45 | Diálogos | Parcial | `ui/Dialog.tsx:25,38-44` | Campana y chat sin Esc; sin redimensionar |
| MOD-46 | Atajos y búsqueda global | Falta | | Solo buscador de cursos en el catálogo |
| MOD-50 | Campana de notificaciones | Parcial | `NotificationBell.tsx:20-146` | Sin filtros ni preferencias por canal |
| MOD-51 | Mensajes ARIA | Hecho | `ui/Callout.tsx:20-35` | |
| MOD-52 | Ayuda y onboarding | Parcial | `HelpButton.tsx`, `ayuda/page.tsx` | Sin tour de primer uso ni manual enlazado |
| MOD-53 | "Acerca de" | Falta | | |
| MOD-54 | Páginas de error | Parcial | `not-found.tsx`, `error.tsx`, `ErrorState.tsx` | Sin 403, mantenimiento ni sin conexión |
| MOD-55 | Navegación | Parcial | `SidebarShell.tsx` | Sin migas de pan ni búsqueda global |
| MOD-56 | Ayuda consistente | Hecho | `layout.tsx` (`HelpButton`+`ChatWidget`) | |
| MOD-60 | Toda pantalla con salida | Parcial | `SidebarShell.tsx`, `Dialog.tsx` | Páginas sueltas (checkout, encuesta, auth) no verificadas |
| MOD-61 | Reversibilidad | Parcial | `ConfirmDialog.tsx` | Sin deshacer genérico |
| MOD-62 | Logout invalida en servidor | Hecho | `auth.service.ts` logout(), `auth.controller.ts` | 13-oct: verificado en producción: access y refresh dan 401 tras el logout |

## 5. Base de datos (BD)

| ID | Módulo | Estado | Evidencia | Notas |
|---|---|---|---|---|
| BD-01 | Claves primarias | Hecho | 72/72 modelos con `@id uuid()` | |
| BD-02 | Claves foráneas | Parcial | 115 `@relation` | 46 sin `onDelete` explícito (ej. `Enrollment`) |
| BD-03 | UNIQUE/CHECK | Parcial | 57 unique; 0 `CHECK` en 94 migraciones ✔ | `User.status` es String libre |
| BD-03 | `Enrollment(userId,courseId)` único | Hecho | `prisma/migrations/20261013000000_enrollment_unique_active` | 13-oct: índice único PARCIAL solo sobre ACTIVE (retakeCourse crea otra matrícula con la anterior COMPLETED); 0 duplicados antes de crearlo; aplicado en producción |
| BD-04 | 3FN | No verificado | | |
| BD-05 | Dinero Decimal, fechas DateTime | Hecho | 22 campos `Decimal(10,2)` | |
| BD-06 | Diccionario de datos | Parcial | `docs/DATA-MODEL.md` | 37 de 72 entidades; sin tocar desde 21-ago |
| BD-07 | Catálogos en tablas | Parcial | `Area`, `CountryConfig`, `RatingDimension`, `AdminRole` | Pagos, canales, niveles y modalidades son enums en código |
| BD-10 | Columnas estándar | Parcial | script sobre `schema.prisma` | `createdAt` falta en 32/72, `updatedAt` en 47/72, `createdBy` en 6, `deletedAt` en 0 |
| BD-11 | Auditoría | Parcial | `AuditLog` (L1879) | Sin IP/user-agent; mutable (`hiddenAt`); sin hash en cascada |
| BD-12 | Optimistic locking | Falta | | 13-oct: cerradas las carreras críticas con reclamos atómicos (reembolso, conversión de cotización) e incrementos atómicos de cupos, verificado con concurrencia real en producción; el control de versión general en ediciones sigue pendiente |
| BD-13 | Multi-tenant | Parcial | `prisma.module.ts:21-55` | RLS solo en `/companies/:id/*`; apagada sin `TENANT_DATABASE_URL` |
| BD-20 | Índices | Parcial | 49 `@@index` | ~50 columnas `*Id` sin índice; `OrderItem(orderId)` sin índice |
| BD-21 | EXPLAIN / N+1 | No verificado | | 194 `findMany` sin revisar |
| BD-22 | Paginación | Parcial | `common/utils/pagination.ts` | Solo 34 `take` de 194 `findMany` |
| BD-23 | Particionado/retención | Falta | | |
| BD-24 | Pool y timeout | Falta | | |
| BD-30–34 | Exactitud, completitud, consistencia, trazabilidad | Parcial | Zod en API; sin CHECK | |
| BD-35 | Confidencialidad | No verificado | `strip-sensitive-fields.interceptor.ts` | Cifrado en reposo sin verificar |
| BD-36 | Retención y eliminación | Falta | | |
| BD-37 | Comprensibilidad | Parcial | comentarios en schema | |
| BD-40 | Migraciones versionadas | Parcial | 94 carpetas | `_prisma_migrations` desfasada (11 aplicadas a mano, REVIEW §3) |
| BD-41 | Migraciones reversibles/probadas | Falta | | |
| BD-42 | Seeds idempotentes | Parcial | `prisma/seed.ts:55-57` | "Todo o nada"; mezcla catálogos con demo (`Demo1234!`) |
| BD-43 | Paridad y conexión por env | Parcial | `.env.example` | `docker-compose.yml` con contraseñas fijas |
| BD-44 | Pruebas de migración en CI | Falta | sin `.github/` ✔ | |
| BD-50 | Copias automáticas, off-site, restauración probada | Parcial | `packages/shared/src/sharepoint.ts`, `worker/src/lib/offsite-backup.ts`, `web/components/admin/BackupOffsiteSettings.tsx` | 13-oct: copia externa a SharePoint con ruta configurable desde el admin y cifrado opcional. NO verificado contra un SharePoint real: faltan las credenciales MS_* y el permiso Sites.ReadWrite.All. Restauración probada sigue sin evidencia; RPO/RTO sin definir |
| BD-51 | RPO/RTO | Falta | | |
| BD-52 | Alta disponibilidad | No aplica | instancia única | Decisión de negocio pendiente |
| BD-53 | Monitoreo | Falta | | Sin Sentry ni métricas; Redis sin AOF |
| BD-54 | Privilegios mínimos | Parcial | `prisma.module.ts:9-13` | App, worker y migraciones usan superusuario |
| BD-60 | Inventario de datos personales | Parcial | `User.termsAcceptedAt` | 13-oct: registro de solicitudes ARCO con plazo; falta inventario de datos personales documentado |
| BD-61 | Anonimización en pruebas | Falta | | |
| BD-62 | Exportar/eliminar datos del titular | Hecho | `privacy.service.ts` executeCancellation, `web/app/(admin)/admin/privacidad` | 13-oct: anonimiza y conserva comprobantes y certificados; plazo de 10 días hábiles a CONFIRMAR con el asesor legal; textos libres (soporte) quedan asociados a la cuenta anonimizada |

## 6. Calidad, integraciones, archivos y jobs (CAL, ARC, INT, JOB, NOT)

| ID | Módulo | Estado | Evidencia | Notas |
|---|---|---|---|---|
| CAL-01/03 | Adecuación funcional | Parcial | 24 módulos API, 37 secciones admin | Pendientes en `REVIEW.md` §3 |
| CAL-02 | Corrección de cálculos | Parcial | `assessment.e2e-spec.ts`, `checkout.e2e-spec.ts` | Sin pruebas de liquidaciones, regalías ni notas |
| CAL-10/11/12 | Desempeño, recursos, capacidad | No verificado | | Sin pruebas de carga |
| CAL-20 | Coexistencia | Hecho | `crm-bridge.provider.ts`, `modules/platform-core` | Producción no verificada en esta revisión |
| CAL-21 | OpenAPI y versionado | Parcial | `main.ts:75-84` | Swagger solo fuera de producción; sin `/v1` |
| CAL-30–32 | Usabilidad | Parcial | `ayuda/page.tsx` | Sin tours |
| CAL-33 | Protección frente a errores | Parcial | | Sin papelera ni deshacer |
| CAL-35 | Accesibilidad | Parcial | ver FE | |
| CAL-40/63 | Pruebas automatizadas | Parcial | 3 e2e API (10 casos), 4 specs Playwright (9 casos) | Worker sin pruebas; sin unitarias; flujos de pago real, SUNAT, certificados, RLS sin prueba |
| CAL-41 | Health checks | Hecho | `api/modules/health/health.controller.ts`; `healthcheck` en api y web de `docker-compose.prod.yml` (servidor) | 13-oct: api y web `healthy` en producción. El worker no tiene HTTP y queda sin healthcheck. `docker-compose.prod.yml` sigue sin versionarse (respaldo `.bak-preHealthcheck` en el servidor) |
| CAL-42 | Tolerancia a fallos | Parcial | BullMQ `attempts: 3` + backoff | Culqi, PayPal, Zoom/Graph y SUNAT sin timeout |
| CAL-43 | Recuperabilidad | Parcial | `restore-db.sh` | Sin reproceso manual de jobs fallidos |
| CAL-50 | Seguridad | Parcial | `REVIEW.md` §3 | Alto: carreras de matrícula/cupos/reembolso, rutas de staff fuera de `/admin`, login social sin correo verificado, `api`/`worker` como root. Medio: sin CSP, Redis sin AOF |
| CAL-60 | Reutilización | Parcial | `admin.service.ts` >3000 líneas | |
| CAL-61 | Logs y métricas | Parcial | `worker/lib/logger.ts` (JSON) | API no es JSON; sin `requestId` |
| CAL-62 | Config externa | Hecho | `.env.example`, `worker/lib/mailer.ts:25-39` | |
| CAL-64 | Documentación | Parcial | `README.md`, `docs/*` | Docs base sin tocar desde 21-ago; sin manual de usuario ni de administrador |
| CAL-70 | Adaptabilidad | Hecho | `.env.example` | |
| CAL-71 | Instalabilidad | Parcial | `docker-compose.yml`, 3 Dockerfile | `docker-compose.prod.yml` no versionado; sin `deploy.sh`; imágenes `latest`; `api`/`worker` sin `USER` |
| CAL-72 | Reemplazabilidad | Parcial | `payment-provider.interface.ts`, `StorageService` | Sin interfaz para SUNAT, correo ni WhatsApp |
| CAL-80 | Despliegue automatizado y runbooks | Falta | sin CI ni `deploy.sh` | |
| CAL-81 | Límites de recursos | Falta | sin `mem_limit` | |
| CAL-82 | Twelve-Factor | Parcial | | Compose dev y prod comparten proyecto y volumen (incidente 29-sep) |
| ARC-01 | Subida: tipo, tamaño, contenido | Parcial | `common/file-filter.ts:21-33` | Valida `Content-Type` declarado, no los bytes; SCORM sin tope descomprimido |
| ARC-02 | Vista previa, descarga, reemplazo | Parcial | `storage.service.ts:56-59` | `StorageService` no puede borrar: reemplazos dejan huérfanos |
| ARC-03 | WebP y miniaturas | Falta | grep `sharp`/`webp` cero | |
| ARC-04 | Metadatos | Parcial | columnas `...AssetId` | Sin tabla central de archivos |
| ARC-05 | S3, enlaces firmados, antivirus | Parcial | `storage.service.ts:49` | Sin antivirus |
| ARC-06 | Cuotas | Falta | | |
| INT-01 | Proveedores con timeout/reintento/idempotencia | Parcial | solo `crm-bridge.provider.ts` con `AbortSignal.timeout` | |
| INT-02 | Webhooks | Parcial | `stripe.provider.ts:82` (firma) | Culqi sin firma; sin tabla de eventos |
| INT-03 | Sandbox/producción | Parcial | `.env.example` | Hoy `SUNAT_ENV=beta`, `PAYPAL_ENV=sandbox` en producción |
| INT-04 | API propia | Parcial | `app.module.ts:56` (throttle) | Ver CAL-21 |
| INT-05 | Panel de integraciones | Parcial | `/admin/notificaciones`, `/admin/facturacion` | Sin panel único ni reintento manual |
| JOB-01 | Tareas largas en cola | Parcial | 10 colas (`worker/queues.ts`) | Reportes y exportaciones son síncronos |
| JOB-02 | Reintentos y dead-letter | Parcial | | Sin pantalla de reproceso ni alertas |
| JOB-03 | Idempotencia | Parcial | `email-campaign.processor.ts:312` | Reintento de campaña puede reenviar |
| JOB-04 | Cron configurable | Parcial | `worker/index.ts:71-124` | Intervalos fijos; sin registro de ejecuciones |
| NOT-01 | Plantillas de correo | Parcial | `email-templates.ts` | Sin enlace de baja ni `List-Unsubscribe`; remitente `@inkademy.com`; SPF/DKIM/DMARC sin verificar; hoy envía a Mailpit |
| NOT-02 | Registro y reenvío | Parcial | `Notification` (status/attempts) | Sin reenvío manual ni preferencias por tipo |
| NOT-03 | Tiempo real | Hecho | `support.gateway.ts` | |

## 7. Front end, accesibilidad y sitio (FE)

| ID | Módulo | Estado | Evidencia | Notas |
|---|---|---|---|---|
| FE-01 | HTML semántico | Parcial | `layout.tsx:127`; h1 en 76/88 páginas | 12 sin h1; `/checkout` y `not-found` sin `<main>` |
| FE-02 | Metaetiquetas | Parcial | `layout.tsx:37-52` | Descripción propia en 3 páginas; login/registro/checkout sin metadata |
| FE-03 | Skip-link y landmarks | Parcial | `Header.tsx:28`, `SidebarShell.tsx:200` | Faltan en `/checkout` y `not-found` |
| FE-04 | Favicon, theme-color, manifest | Parcial | `web/app/icon.png` | Sin apple-touch-icon, theme-color ni manifest |
| FE-10 | Responsive | Parcial | `Tabs.tsx:48`, 30/31 tablas con wrapper | `AuditLogViewer.tsx:238` sin wrapper; sin medir a 320 px |
| FE-11 | Navegadores | No verificado | 4 specs Playwright | |
| FE-12 | Táctil | Parcial | `Button.tsx:20-23` | |
| FE-20 | Contraste | Parcial | `globals.css:18-85` | `text-ash-400` 2,91:1 (placeholder y 24 usos) |
| FE-21 | Teclado y foco | Hecho | `globals.css:195-199`, `hooks/useFocusTrap.ts:52` | Menú de cuenta del header sin Esc |
| FE-22 | Alt y subtítulos | Parcial | `Classroom.tsx:916-919`, worker de subtítulos | `<track>` sin `src`; sin transcripción |
| FE-23 | Errores asociados al campo | Parcial | `ui/Input.tsx:18,58,77,91` | 0 `aria-describedby` |
| FE-24 | reduced-motion | Falta | 0 usos ✔ | |
| FE-25 | WCAG 2.2 (arrastrar, etc.) | Parcial | `CourseEditor.tsx:9` | Alternativa solo confirmada en CourseEditor |
| FE-26 | Lector de pantalla / axe | No verificado | `IMPLEMENTATION-NOTES.md:158-161` | |
| FE-30/34 | Core Web Vitals / RUM | No verificado | | |
| FE-31 | Imágenes optimizadas | Parcial | `next/image` en 3 archivos | 30 `<img>` crudos; 0 `loading="lazy"` |
| FE-32 | JS/CSS y fuentes | Parcial | `layout.tsx:23-35` | Solo 2 `dynamic()` |
| FE-33 | Caché y compresión | No verificado | | Proxy fuera del repo |
| FE-40 | Cinco estados de UI | Parcial | 7 `error.tsx` | 0 `loading.tsx`, sin EmptyState/Skeleton, sin vista 403 ✔ |
| FE-41 | Sin datos de prueba | Hecho | `web/lib/safe-fetch.ts`, `web/app/checkout/page.tsx` | 13-oct: en producción un fallo de la API se relanza al error.tsx; checkout pide el registro real por id y bloquea el pago si falla. Páginas públicas siguen con `soft` |
| FE-42 | i18n | Parcial | `messages/es.json`/`en.json` (376 claves c/u) | Admin (103 archivos) y docente sin i18n |
| FE-50 | Tokens | Hecho | `globals.css:18-85`, `tailwind.config.ts` | |
| FE-51 | Componentes: botón, campo, casilla, pestañas, diálogo, progreso, avatar, badge, tarjeta | Hecho | `web/components/ui/*` | |
| FE-51 | Radio, acordeón, menú, toast, skeleton, selector de fecha, carga de archivos | Parcial | usos nativos/ad hoc | Sin componente compartido |
| FE-51 | Interruptor, tabla, paginación, tooltip, migas, stepper, árbol | Falta | | |
| FE-52 | Estados de componente | Parcial | `Button.tsx:6` | Sin estado "cargando" |
| FE-60 | Marca editable sin código | Parcial | `AppearanceForm.tsx` | Falta favicon, borrador/publicado, contraste AA, restablecer paleta, logo claro/oscuro |
| FE-61 | SEO técnico | Parcial | `robots.ts`, `sitemap.ts` | Sin JSON-LD ni canonical; OG global con ícono cuadrado |
| FE-62 | Analítica y consentimiento | No aplica | sin analítica ni cookies de terceros | Obligatorio si se agrega analítica |
| FE-63 | Legales y Libro de Reclamaciones | Parcial | `legales/[doc]/page.tsx:17-35`, `ComplaintForm.tsx` | Libro completo; legales hardcodeados con fecha fija y correo `@inkademy.com` |
| FE-64 | Contacto con anti-spam | Parcial | `QuoteForm.tsx:46-52`, `quote-leads.controller.ts:26-28` | Falta enlace a redes/WhatsApp |
| FE-65 | HTTPS y cabeceras | Parcial | `next.config.js:42-55` | Sin CSP ni Permissions-Policy |
| FE-66 | Imágenes compartibles | Parcial | `layout.tsx:43` | |
| FE-70 | Presentaciones/brochure | No aplica | plataforma web | |
| FE-71 | PDF accesibles | No verificado | | |

## Resumen

Hechos 37 · Parciales 145 · Faltan 59 · No aplica 4 · No verificado 11 *(256 filas; conteo automático de la columna Estado. Cada fila agrupa varias pantallas o requisitos, así que no es una proporción exacta del sistema. Actualizado el 13-oct tras la etapa 1.)*

## Pendientes ordenados por impacto

**Críticos — seguridad, pérdida de datos o cifras falsas**
1. **Datos de ejemplo mostrados como reales** si la API falla, en campus, empresa, docente y admin (FE-41, TBL-33, DSH-06). Un admin podría actuar sobre datos inventados.
2. **Respaldos solo en el mismo VPS, sin cifrar, sin RPO/RTO ni restauración probada** (BD-50/51); sin health checks ni CI (CAL-41, BD-44, CAL-80).
3. **Integridad concurrente**: sin `@@unique` en matrícula, sin optimistic locking, sin `CHECK` en la BD (BD-03/12, FRM-42).
4. **Recorte silencioso de listados y de horas docentes** (REP-43, TBL-20): los totales que alimentan liquidaciones quedan subestimados.
5. **Sesión y cuentas**: logout no invalida el servidor (MOD-62), sin 2FA ni para admin (MOD-12), reset de clave no desbloquea (MOD-30/33), cuentas creadas por admin sin invitación ni cambio obligatorio.
6. **Auditoría con huecos**: forzar avance al 100 %, ampliar acceso, crear usuarios, exportar datos no dejan rastro (TBL-61/62, REP-08, MOD-32).
7. **Dashboard suma PEN y USD como soles** (DSH-08).
8. **Ley 29733**: sin autoservicio de acceso/eliminación de datos, ARCO solo por un correo de dominio equivocado (MOD-15, BD-62).

**Altos — funciones obvias faltantes**
9. Exportación (Excel/CSV/PDF) en ~20 listados, con tipos reales en Excel y neutralización de fórmulas; exportaciones en segundo plano (REP-01/02/04/06).
10. Componentes compartidos de tabla, paginador, filtros, vacío, skeleton, toast, migas y `loading.tsx` — resuelve de raíz la incoherencia entre pantallas (TBL-*, FE-40/51).
11. Confirmación en borrados financieros de un clic (tarifas, adelantos, regalías, convenios) (TBL-04).
12. Perfil y cambio de contraseña inalcanzables para admin y empresa; idioma/zona horaria guardados pero no aplicados; tema solo en localStorage (MOD-10/11/14/40).
13. Validación de RUC/DNI y errores del servidor en español, con resumen y foco (FRM-10/11/13).
14. Accesibilidad: `prefers-reduced-motion`, contraste `ash-400`, `aria-describedby`, `htmlFor` faltantes (FE-20/23/24, MOD-42).
15. Archivos: borrado físico, antivirus, validación de bytes, WebP/miniaturas, cuotas (ARC-01..06).
16. Integraciones: timeouts en Culqi/PayPal/Zoom/SUNAT, registro de eventos de webhook, panel de integraciones (INT-01/02/05).
17. Datos y correo: enlace de baja y remitente del dominio `.lat`, legales editables, favicon/nombre de plataforma editables (NOT-01, FE-63, MOD-20/44).

**Medios — pulido**
18. Impresión, vistas guardadas, columnas configurables, densidad, atajos y buscador global, página "Acerca de", 403/mantenimiento/sin conexión, i18n del admin, manuales de usuario/administrador y diccionario de datos al día.

*Nota de alcance: las filas Hecho son pocas a propósito — se exige evidencia archivo:línea. Casi todo "Parcial" significa que existe en alguna pantalla pero no en todas las del mismo tipo, que es justo la incoherencia que esta revisión debía detectar.*

