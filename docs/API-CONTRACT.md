# Contrato de API — Inkademy (v1)

Base URL dev: `http://localhost:4000`. Todas las respuestas JSON. Autenticación: JWT de acceso (Bearer, TTL corto) + refresh token en cookie httpOnly. Los DTOs referenciados viven en `packages/shared/src/types.ts` y los esquemas de request en `packages/shared/src/validation.ts` — **usar esos tipos desde ambas apps, no redefinirlos**. Documentación autogenerada real en `/docs` (Swagger) una vez levantada la API.

Convención de errores: `{ statusCode, message, error }` (formato por defecto de NestJS `HttpException`).

## Auth (`/auth`)
| Método | Ruta | Body/Query | Respuesta | Notas |
|---|---|---|---|---|
| POST | `/auth/register` | `RegisterInput` | `{ user: AuthUser, accessToken }` | Envía email de verificación (async, cola) |
| POST | `/auth/login` | `LoginInput` | `{ user: AuthUser, accessToken }` | Set-Cookie refresh token |
| POST | `/auth/refresh` | — (cookie) | `{ accessToken }` | |
| POST | `/auth/logout` | — | `204` | Limpia cookie |
| GET | `/auth/me` | — | `AuthUser` | Requiere Bearer |
| GET | `/auth/google` | — | 302 redirect | Inicia flujo OAuth |
| GET | `/auth/google/callback` | — | 302 redirect a `APP_URL/auth/callback?token=...` | |
| GET | `/auth/microsoft` / `/auth/microsoft/callback` | — | igual que Google | Mismo tenant Azure AD que Teams |
| POST | `/auth/forgot-password` | `{ email }` | `202` | |
| POST | `/auth/reset-password` | `{ token, password }` | `204` | |
| PATCH | `/profile` | `CompleteProfileInput` | `AuthUser` | Completado progresivo del perfil |

## Catálogo público (`/catalog`)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/areas` | `AreaSummary[]` |
| GET | `/courses?` (`CatalogFilters` como query params) | `{ items: CourseCardDTO[], total, page, pageSize }` |
| GET | `/courses/:slug` | `CourseDetailDTO` |
| GET | `/programs/:slug` | `ProgramDetailDTO` |
| GET | `/catalog/sections` | `{ featured, upcomingLive, new, recommendedPaths, mostDemanded }: CourseCardDTO[]` por clave (curadas por admin/reglas) |

## Campus del alumno (`/me`, requiere auth)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/me/enrollments?status=` | `EnrollmentSummaryDTO[]` |
| GET | `/me/enrollments/:id` | detalle + módulos/lecciones + `LessonProgress` |
| PATCH | `/me/lessons/:lessonId/progress` | `{ completed?, lastPositionSeconds? }` → recalcula `progressPct` del enrollment |
| GET | `/me/calendar?from=&to=` | `CalendarEvent[]` |
| GET | `/me/calendar.ics` | archivo `.ics` (suscribible) |
| GET | `/me/certificates` | `CertificateDTO[]` |
| GET | `/me/recommendations` | `CourseCardDTO[]` con `reason` |
| GET | `/me/orders` | historial de compras/comprobantes |

## Checkout / Comercio (`/checkout`, `/orders`)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/checkout` | body `CheckoutInput` → crea `Order`, cobra vía `PaymentProvider` (Culqi/Stripe), si éxito: crea `Enrollment`(s) automáticamente → `CheckoutResult` |
| GET | `/orders/:id` | detalle + comprobante |
| POST | `/webhooks/stripe` | webhook público (firma verificada) — confirma pagos async |
| POST | `/webhooks/culqi` | idem |

## Evaluación (`/assessments`, `/attempts`)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/assessments/:id` | preguntas (orden/alternativas aleatorias según config, sin `correctAnswer`) |
| POST | `/assessments/:id/attempts` | valida intentos restantes/fecha → crea `AssessmentAttempt` |
| POST | `/attempts/:id/submit` | body `SubmitAttemptInput` → autocorrección objetivas, abiertas quedan `PENDING_REVIEW` → `AssessmentResultDTO` |
| GET | `/attempts/:id` | estado/resultado |

## Certificados (`/certificates`)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/certificates/verify/:code` | **público** — solo datos autorizados (nombre, curso, fecha, estado vigente/revocado) |
| GET | `/certificates/:id/pdf` | redirige a URL firmada del objeto en storage |

## Aula virtual (`/live-sessions`)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/live-sessions/:id/join` | valida matrícula + ventana horaria → `{ joinUrl, role }` (Teams) |
| POST | `/live-sessions/:id/sync-attendance` | (admin/worker) llama Graph API `reports/getMeetingAttendanceReport` y puebla `Attendance` |

## Empresas / B2B (`/companies`)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/companies` | `CreateCompanyInput` → crea Company + membership `COMPANY_ADMIN` para el creador |
| GET | `/companies/:id/dashboard` | `CompanyDashboardSummaryDTO` |
| GET | `/companies/:id/members?team=&role=` | |
| POST | `/companies/:id/members/invite` | `InviteCollaboratorInput` → crea usuario si no existe + `CompanyMembership` estado `INVITED` + email |
| DELETE | `/companies/:id/members/:membershipId` | soft-remove |
| GET | `/companies/:id/seat-pools` | cupos por oferta |
| POST | `/companies/:id/seat-pools/:poolId/assign` | `{ userId }` → crea `Enrollment` `source=B2B_SEAT`, incrementa `seatsUsed` |
| GET | `/companies/:id/reports?area=&team=&courseId=` | avance/asistencia/notas agregado |
| POST | `/companies/:id/quotes` | `RequestQuoteInput` |
| GET | `/companies/:id/quotes` | |

## Soporte (`/support`)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/support/tickets` | `CreateSupportTicketInput` |
| GET | `/support/tickets` | propios, o de la empresa si `companyId` en query y es `COMPANY_ADMIN` |
| GET | `/support/tickets/:id` | + mensajes |
| POST | `/support/tickets/:id/messages` | `{ body }` |

## Admin (`/admin`, requiere `globalRole=ADMIN` o `SUPPORT` según ruta)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/admin/dashboard/kpis` | ventas, inscripciones, alumnos activos/riesgo, certificados emitidos, tickets |
| GET | `/admin/exceptions` | `AdminExceptionDTO[]` — el corazón del "trabajo por excepción" |
| GET/POST/PATCH | `/admin/courses`, `/admin/programs`, `/admin/areas` | CRUD de catálogo |
| GET | `/admin/attempts/pending-review` | cola de preguntas abiertas por calificar |
| POST | `/admin/attempts/:attemptId/answers/:answerId/grade` | `{ score, isCorrect }` |
| GET/POST | `/admin/certificate-templates` | |
| GET | `/admin/companies` | |

## Roles y guards
`GlobalRole` (STUDENT/TEACHER/SUPPORT/ADMIN) protege `/admin/*` y rutas de docente. `CompanyMembershipRole` (COMPANY_ADMIN/PARTICIPANT) protege `/companies/:id/*` vía un `CompanyGuard` que verifica membership activa — **toda ruta con `:companyId` debe pasar por este guard** (separación estricta entre empresas).
