#!/bin/sh
# Respaldo diario de Postgres de Inkademy (pg_dump formato custom, restaurable con pg_restore). Retención: 14 días.
# OJO: queda en el MISMO servidor; falta una copia fuera del VPS (ver REVIEW.md). Restaurar:
#   docker exec -i inkademy-postgres-1 pg_restore -U inkademy -d inkademy --clean --if-exists < archivo.dump
set -eu
DIR="${BACKUP_DIR:-/home/deploy/backups/inkademy}"
mkdir -p "$DIR"
FILE="$DIR/inkademy-$(date +%Y%m%d-%H%M).dump"
docker exec inkademy-postgres-1 pg_dump -U inkademy -d inkademy -Fc > "$FILE.tmp"
# Un volcado vacío o truncado no cuenta como respaldo.
if [ ! -s "$FILE.tmp" ] || ! docker exec -i inkademy-postgres-1 pg_restore -l < "$FILE.tmp" > /dev/null 2>&1; then
  rm -f "$FILE.tmp"
  echo "$(date -Iseconds) FALLO: el volcado no es válido" >&2
  exit 1
fi
mv "$FILE.tmp" "$FILE"
find "$DIR" -name 'inkademy-*.dump' -mtime +14 -delete
echo "$(date -Iseconds) OK $FILE $(du -h "$FILE" | cut -f1)"
