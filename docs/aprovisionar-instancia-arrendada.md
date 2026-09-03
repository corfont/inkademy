# Aprovisionar una instancia arrendada (arriendo aislado / marca blanca)

Este documento es para cuando un tercero **arrienda el sistema completo** (no cursos ni
alumnos individuales) — quiere su propia marca, su propio catálogo, su propio dominio.

## Decisión de arquitectura (por qué esto y no multi-tenancy en la misma base de datos)

Cada arrendatario obtiene su **propia instancia desplegada**: su propio `docker-compose`
stack, su propia base de datos Postgres, su propio bucket S3, su propio dominio —
corriendo exactamente el mismo código que esta instancia. El aislamiento es total y
trivial (bases de datos físicamente distintas, cero riesgo de fuga de datos entre
arrendatarios) sin tocar el modelo de datos.

La alternativa (tenant-scoping a nivel de código, agregando `tenantId` a decenas de
modelos hoy compartidos — `Course`, `Area`, `Program`, `PlatformSettings`, etc.) es un
proyecto de arquitectura grande, solo justificado si el número de arrendatarios
simultáneos crece mucho. Ver la sección "Arrendar el sistema completo" en el plan de
esta sesión para el detalle completo de esa comparación.

## Checklist para levantar una instancia nueva

1. **Registrar la licencia** en `/admin/licencias` de la instancia MATRIZ (Inkapitales) —
   cliente, dominio, ciclo de facturación, precio, fecha de inicio/vencimiento. Esto es
   solo para que Inkapitales lleve la cuenta comercial y reciba la alerta de vencimiento
   — no aprovisiona nada por sí solo.
2. **Servidor**: un VPS/instancia nueva (ver recomendaciones de hosting ya conversadas —
   un droplet/VPS con Docker, cerca de la región del cliente). Clonar este repo.
3. **Variables de entorno** (`.env`, a partir de `.env.example`):
   - `DATABASE_URL`, `S3_*`, `SMTP_*`: apuntar a recursos NUEVOS y exclusivos de esta
     instancia (nunca reusar los de otra instancia arrendada ni los de Inkademy mismo).
   - `APP_URL`/`API_URL`: el dominio propio del cliente.
   - `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`: generar secretos nuevos, distintos a
     cualquier otra instancia.
   - `GEMINI_API_KEY`, `CULQI_*`/`STRIPE_*`/`PAYPAL_*`, `SUNAT_*`: credenciales propias
     del cliente si va a facturar/cobrar con sus propias cuentas (o dejarlas vacías para
     que el sistema simule esos flujos en modo desarrollo/beta, igual que en cualquier
     entorno sin esas claves configuradas).
4. **Levantar el stack**: `docker-compose up -d` (o el equivalente en el VPS elegido).
   Correr las migraciones (`prisma migrate deploy`) y el seed inicial si aplica.
5. **Branding inicial** — vía `/admin/apariencia` de la NUEVA instancia (nunca a mano en
   la base de datos): logo, tamaño del logo, color primario/de acento, tipografía,
   fondo, y el sello de agua si el cliente lo pide. Todo esto ya es 100% configurable
   por UI, sin tocar código.
   - **Gap conocido, no bloqueante**: el favicon/ícono de pestaña todavía NO es
     configurable por UI — hoy es el archivo estático `apps/web/src/app/icon.png` del
     código, compartido por todas las instancias. Para una instancia arrendada que
     necesite su propio favicon, hoy hay que reemplazar ese archivo en el código de ESA
     instancia antes de desplegar (un cambio de 1 archivo, no de configuración). Si el
     volumen de instancias arrendadas crece, vale la pena moverlo a
     `PlatformSettings.faviconAssetId` (mismo patrón que `watermarkAssetId`) para que
     sea configurable por UI como el resto del branding.
6. **Primer usuario ADMIN**: crear la cuenta del administrador designado por el cliente
   (`POST /admin/users` o el flujo de registro + ascenso manual de rol).
7. **DNS**: apuntar el dominio del cliente al VPS nuevo, certificado TLS (Let's Encrypt
   vía el proxy que se use — Caddy/nginx).
8. **Verificación**: abrir el dominio, confirmar que carga con la marca del cliente (no
   la de Inkapitales), crear un curso de prueba, matricular un alumno de prueba, y
   confirmar que el correo transaccional llega desde el SMTP propio del cliente.

## Qué NO hace falta tocar

Ningún archivo de código cambia entre instancias — todo lo que distingue una instancia
arrendada de otra vive en variables de entorno + la fila `Settings`/`PlatformSettings`
de su propia base de datos. Si en algún momento aparece algo de branding que hoy está
hardcodeado en vez de ser configurable, se corrige ahí (en el código compartido, para
que todas las instancias se beneficien), no con un parche por cliente.
