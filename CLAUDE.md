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
