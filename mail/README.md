# Correo propio de Inkademy (VPS)

Servidor `docker-mailserver` (envío y recepción de `@inkademy.lat`) + webmail Roundcube en `https://mail.inkademy.lat`.

## Registros DNS (en el panel de DNS de `inkademy.lat`, hoy Namecheap)
| Tipo | Nombre | Valor |
|---|---|---|
| A | `mail` | `2.25.200.202` (hoy apunta a `198.54.114.219`, el hosting anterior) |
| MX | `@` | `mail.inkademy.lat`, prioridad 10 (reemplaza los 3 `*.jellyfish.systems`) |
| TXT | `@` | `v=spf1 mx ip4:2.25.200.202 ~all` (reemplaza el SPF del hosting anterior) |
| TXT | `mail._domainkey` | la clave DKIM que genera el servidor (`setup config dkim`) |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@inkademy.lat; adkim=s; aspf=s` |
| PTR (rDNS) | `2.25.200.202` | `mail.inkademy.lat` — se cambia en el panel de **Hostinger** (hoy dice `srv1974012.hstgr.cloud`) |

## Operación
- Datos: `/home/deploy/mail-data` (respaldar). Contraseñas de buzones: se piden al crearlos (`docker exec -it inkademy-mailserver setup email add usuario@inkademy.lat`).
- Ver buzones: `docker exec inkademy-mailserver setup email list`. Cuota/alias: `setup alias add`, `setup quota set`.
- Los certificados los renueva Caddy; el servidor los relee solo.
- Las apps envían por `inkademy-mailserver:25` (red `inkademy_default`, sin contraseña).
