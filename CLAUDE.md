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
