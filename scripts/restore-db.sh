#!/bin/sh
# Restaura un respaldo de Postgres de Inkademy (los .dump que genera scripts/backup-db.sh).
#
#   sh scripts/restore-db.sh /home/deploy/backups/inkademy/inkademy-20261012-2059.dump
#
# Qué hace, en orden: valida el archivo → te pide escribir RESTAURAR → guarda un respaldo "antes-de-restaurar"
# de la base actual → detiene api/worker/web (para que nadie escriba durante la restauración) → restaura → los vuelve a levantar.
# Variables: DB_NAME (por defecto inkademy; con otro nombre solo restaura ahí, sin detener nada: sirve para PROBAR un respaldo),
#            ASSUME_YES=1 (sin pregunta; solo para automatizar).
# Lo que NO cubre: los archivos (videos, SCORM, avatares, certificados PDF) viven en MinIO; este respaldo es solo la base de datos.
set -eu
FILE="${1:-}"
DB="${DB_NAME:-inkademy}"
COMPOSE="docker compose -f /home/deploy/apps/inkademy/docker-compose.prod.yml"
PG="docker exec -i inkademy-postgres-1"

[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Uso: sh scripts/restore-db.sh <archivo.dump>"; exit 2; }
$PG pg_restore -l < "$FILE" > /dev/null 2>&1 || { echo "El archivo no es un respaldo válido de Postgres (pg_restore no lo pudo leer)."; exit 1; }
echo "Respaldo válido: $FILE ($(du -h "$FILE" | cut -f1))"
echo "Se va a REEMPLAZAR el contenido de la base «$DB» por el de este archivo."

if [ "${ASSUME_YES:-0}" != "1" ]; then
  printf "Escribe RESTAURAR para continuar: "
  read -r ANSWER
  [ "$ANSWER" = "RESTAURAR" ] || { echo "Cancelado: no se cambió nada."; exit 1; }
fi

if [ "$DB" = "inkademy" ]; then
  SAFE="/home/deploy/backups/inkademy/antes-de-restaurar-$(date +%Y%m%d-%H%M%S).dump"
  mkdir -p "$(dirname "$SAFE")"
  docker exec inkademy-postgres-1 pg_dump -U inkademy -d inkademy -Fc > "$SAFE"
  echo "Respaldo de seguridad de la base actual: $SAFE"
  $COMPOSE stop api worker web
else
  docker exec inkademy-postgres-1 psql -U inkademy -d postgres -c "DROP DATABASE IF EXISTS \"$DB\"" -c "CREATE DATABASE \"$DB\"" > /dev/null
fi

# --clean --if-exists: reemplaza lo que haya; --no-owner: no depende de quién era el dueño en el origen.
$PG pg_restore -U inkademy -d "$DB" --clean --if-exists --no-owner < "$FILE" 2>&1 | grep -v "does not exist, skipping" || true
echo "Tablas restauradas: $($PG psql -U inkademy -d "$DB" -At -c "select count(*) from information_schema.tables where table_schema='public'")"

if [ "$DB" = "inkademy" ]; then
  $COMPOSE up -d api worker web
  echo "Listo: la plataforma volvió a levantarse con los datos del respaldo."
fi
