# Despliegue — cómo corre Inkademy en producción

**Inkademy corre en un VPS propio (Hostinger, `2.25.200.202`, `/home/deploy/apps/inkademy`) con Docker Compose, detrás del Caddy compartido del portafolio.**
No usa Vercel, Supabase, Render, Railway ni Fly: todo — web, API, worker, Postgres, Redis y almacenamiento — son contenedores del mismo servidor.
(Hasta el 13-oct-2026 este documento describía una ruta Supabase + Render/Fly + Vercel que nunca se usó; se reescribió con lo desplegado de verdad.)
Para el acceso al servidor, usuario, llave SSH y el patrón `git push`, ver `../CLAUDE.md` de este repo y el `CLAUDE.md` de la raíz del portafolio.

## 1. Qué corre y dónde

| Servicio | Contenedor | Puerto en el servidor | Notas |
|---|---|---|---|
| Web (Next.js, `output: standalone`) | `inkademy-web-1` | `8082` | `https://inkademy.lat` |
| API (NestJS) | `inkademy-api-1` | `8083` | `https://api.inkademy.lat` |
| Worker (BullMQ: correo, certificados, recordatorios, backups…) | `inkademy-worker-1` | — | sin puerto público |
| PostgreSQL 16 | `inkademy-postgres-1` | solo red interna | volumen `pgdata` |
| Redis 7 | `inkademy-redis-1` | solo red interna | solo colas BullMQ |
| MinIO (almacenamiento S3-compatible) | `inkademy-minio-1` | `8084` | `https://cdn.inkademy.lat`; bucket `inkademy-assets` |
| Mailpit (solo desarrollo) | `inkademy-mailhog-1` | `127.0.0.1:8085` | NO envía correo real; ver sección 6 |

- **HTTPS y dominios:** los termina el Caddy compartido (`/home/deploy/apps/crm/Caddyfile`, contenedor `inkapitales_caddy_prod`): `inkademy.lat` y `www` → 8082, `api.inkademy.lat` → 8083, `cdn.inkademy.lat` → 8084. El certificado lo emite y renueva Caddy solo.
- Los puertos 8082/8083/8084 también quedan abiertos al mundo por HTTP plano (Docker ignora `ufw`); está pendiente enlazarlos a `127.0.0.1` (ver `REVIEW.md`).
- El archivo real es **`docker-compose.prod.yml`** (no versionado: trae credenciales en el YAML). `docker-compose.yml` (versionado) es el de desarrollo: **no usarlo en el servidor** — comparte nombre de proyecto y volúmenes y recrearía los contenedores reales con otra configuración (incidente del 29-sep-2026, detalle en `CLAUDE.md`).

## 2. Cómo se despliega

```bash
# desde tu máquina
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_inkapitales_vps" git push vps main     # actualiza los archivos en el VPS; NO reinicia nada

# en el servidor (ssh deploy@2.25.200.202), dentro de /home/deploy/apps/inkademy
docker compose -f docker-compose.prod.yml build api web worker
docker compose -f docker-compose.prod.yml up -d api web worker
```

- **Migraciones:** cada `prisma/migrations/<fecha>_<nombre>/migration.sql` es idempotente (`IF NOT EXISTS`) y se aplica a mano contra la base real:
  `docker exec -i inkademy-postgres-1 psql -U inkademy -d inkademy -v ON_ERROR_STOP=1 < prisma/migrations/<carpeta>/migration.sql`
  La tabla `_prisma_migrations` está desfasada (las migraciones posteriores al 15-sep-2026 no se registraron en ella); no usar `prisma migrate deploy` sin revisarlo antes.
- **Después de cambiar `prisma/schema.prisma`:** `pnpm --filter @inkademy/db run generate` y reconstruir `packages/shared` (`pnpm --filter @inkademy/shared run build`) antes de compilar las apps.
- **`NEXT_PUBLIC_*` se hornean al compilar `web`:** cambiar una de ellas exige reconstruir la imagen, no basta con reiniciar.
- Verificar siempre contra producción (`curl https://api.inkademy.lat/courses`, abrir el sitio), no contra el entorno local.
- No existe `deploy.sh` para este sistema: el despliegue es manual.

## 3. Variables de entorno de producción

Viven en `docker-compose.prod.yml` / `.env` del servidor — **nunca en el repositorio**. Grupos (los valores reales no se documentan aquí):

- **Base y colas:** `DATABASE_URL`, `REDIS_URL`.
- **Sesión:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (64 caracteres, distintos entre sí), `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`.
- **Direcciones públicas:** `APP_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`, `API_URL_INTERNAL` (la web llega a la API por la red de Docker para evitar el hairpin NAT).
- **Almacenamiento:** `S3_ENDPOINT` (interno, `http://minio:9000`), `S3_PUBLIC_BASE_URL` (`https://cdn.inkademy.lat/inkademy-assets`, también se usa para firmar enlaces), `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`.
- **Pagos:** `CULQI_PUBLIC_KEY/SECRET_KEY`, `STRIPE_PUBLIC_KEY/SECRET_KEY/WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID/SECRET/ENV`, y los `NEXT_PUBLIC_*` equivalentes. **En producción, sin clave real las pasarelas rechazan el cobro**; `ALLOW_PAYMENT_SIMULATION=true` las deja simular a propósito (nunca dejarlo encendido al abrir al público).
- **SUNAT (facturación electrónica):** `SUNAT_RUC`, `SUNAT_SOL_USER`, `SUNAT_SOL_PASSWORD`, `SUNAT_CERT_PEM`, `SUNAT_CERT_KEY_PEM`, `SUNAT_ENV` (`beta` o `produccion`), series, `SUNAT_RAZON_SOCIAL`, `SUNAT_ADDRESS`, `SUNAT_UBIGEO`, `SUNAT_TAX_AFFECTATION`. También editables desde Admin → Facturación.
- **Login social y Teams:** `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`, `MS_TENANT_ID/CLIENT_ID/CLIENT_SECRET/CALLBACK_URL`, `MS_TEAMS_ORGANIZER_UPN`. Vacíos hoy: el login social y las aulas de Teams no están activos.
- **Puente con el CRM:** `CRM_API_URL`, `CRM_API_SECRET`, `CRM_BRIDGE_SECRET`.
- **Correo:** el servidor SMTP se configura desde Admin → Configuración (tabla `EmailServerSettings`); `SMTP_*` y `EMAIL_FROM` solo son el respaldo. Ver sección 6.
- **Otros:** `GEMINI_API_KEY` (asistente), `DEFAULT_CURRENCY`, `SUPPORTED_CURRENCIES`, `SUPPORTED_LOCALES`, `TZ`, `WHATSAPP_*`, `PUPPETEER_EXECUTABLE_PATH` (en la imagen del worker).

## 4. Almacenamiento (MinIO)

- El bucket **no** es de lectura pública: solo lo son los prefijos `materials/`, `scorm/`, `certificates/`, `subtitles/`, `avatars/` y `admin-uploads/`. Respaldos, respuestas de exámenes, informes y documentos del asistente son privados y se sirven con **enlace firmado** (`StorageService.getAccessUrl`, firmado con la dirección pública `cdn.inkademy.lat`).
- La política la fija el servicio `minio-init` de `docker-compose.prod.yml` en cada arranque. Si se agrega un prefijo nuevo que deba ser público, hay que sumarlo ahí y a `StorageService.PRIVATE_PREFIXES` si es privado.

## 5. Dominios y DNS

- `inkademy.lat`, `www`, `api` y `cdn` → `2.25.200.202`. El DNS de `inkademy.lat` está en Namecheap (hosting); lo administra otra persona.
- Cualquier dominio nuevo necesita su registro A hacia la IP y un bloque en el Caddyfile compartido (el cambio exige recrear el contenedor de Caddy con `--env-file .env.production`; ver `../CLAUDE.md`).

## 6. Correo saliente

- Hoy: `SMTP_HOST=mailhog` (Mailpit) en las variables, y el servidor SMTP real se carga desde el panel. Sin uno configurado **no sale ningún correo real** (verificación de cuenta, recuperar contraseña, recibos, constancias).
- La cuenta de Microsoft 365 de `inkapitales.com` rechaza el SMTP (autenticación SMTP desactivada en el tenant); se evaluaron Resend y un servidor propio.
- Servidor propio preparado (no arrancado): `mail/` (docker-mailserver + webmail Roundcube). Requiere registros DNS (A `mail`, MX, SPF, DKIM, DMARC) y el PTR de la IP en Hostinger; ver `mail/README.md`.

## 7. Respaldos

- **Base de datos:** `scripts/backup-db.sh` (cron `15 3 * * *` del usuario `deploy`) genera un `pg_dump` restaurable en `/home/deploy/backups/inkademy/` con retención de 14 días. Restaurar: `sh scripts/restore-db.sh <archivo.dump>` (valida el archivo, pide escribir `RESTAURAR`, guarda un respaldo previo, detiene la plataforma, restaura y la vuelve a levantar). Con `DB_NAME=otra_base` solo prueba la restauración en una base temporal.
- **Respaldo interno de la app** (Admin → Backups, semanal): un `.zip` con los datos como JSON, para descargar. No tiene botón de carga.
- **Archivos** (videos, SCORM, avatares, PDF de certificados): viven en el volumen de MinIO (`inkademy_miniodata`). Hoy no tienen respaldo propio.
- **Pendiente:** copia de todo lo anterior **fuera del VPS** y una restauración de prueba periódica.

## 8. Checklist: App Registration de Azure AD (Microsoft Graph / Teams)

Necesario para "Login con Microsoft" y las reuniones de Teams (sin esto el adaptador de Teams trabaja en modo simulado):

1. Crear una **App Registration** en Microsoft Entra ID del tenant de la organización (requiere un rol que permita registrar aplicaciones; el consentimiento de administrador a permisos de Graph requiere **Administrador global**).
2. Agregar el permiso de aplicación `OnlineMeetings.ReadWrite.All` sobre Microsoft Graph y otorgar el consentimiento de administrador.
3. Generar un **client secret** → `MS_CLIENT_SECRET`.
4. Registrar el redirect URI de login: `https://api.inkademy.lat/auth/microsoft/callback` (`MS_CALLBACK_URL`).
5. Definir `MS_TEAMS_ORGANIZER_UPN` (cuenta licenciada para Teams que organiza las reuniones) y confirmar `MS_TENANT_ID`/`MS_CLIENT_ID`.
6. Probar: crear una `LiveSession`, verificar `providerMeetingId`/`joinUrl` y que `POST /live-sessions/:id/sync-attendance` llene `Attendance`.

## 9. Checklist: pasarelas de pago en modo live

**Culqi** (Perú): verificación de negocio, claves `pk_live_`/`sk_live_`, webhook a `https://api.inkademy.lat/webhooks/culqi`, prueba real con monto pequeño.
**Stripe** (internacional): cuenta activada, claves live, webhook a `https://api.inkademy.lat/webhooks/stripe` con su `STRIPE_WEBHOOK_SECRET` (no dejarlo vacío), revisar monedas soportadas.
**PayPal:** `PAYPAL_ENV=live` solo con credenciales reales; el servidor verifica que el monto aprobado coincida con el carrito antes de capturar.
Con claves reales cargadas, confirmar que `ALLOW_PAYMENT_SIMULATION` no esté definido.

## 10. Monitoreo

- Logs: `docker compose -f docker-compose.prod.yml logs --tail=200 api worker` (la API y el worker escriben a stdout; el worker en JSON por línea). Docker rota los logs (10 MB × 3).
- No existe endpoint `/health` de la API ni alertas externas; es parte de lo pendiente en `REVIEW.md`. Vigilar a mano: errores 5xx de la API, jobs fallidos en Admin → Notificaciones, espacio en disco y memoria del servidor (que comparte con los demás sistemas).

## 11. Checklist de salida a producción

Ver `REVIEW.md` (estado real y pendientes priorizados). Lo mínimo antes de abrir al público: correo real, claves de pago y datos SUNAT, desactivar cuentas demo, contenido demo despublicado, datos de contacto reales, textos legales con razón social, copia de respaldo fuera del VPS.
