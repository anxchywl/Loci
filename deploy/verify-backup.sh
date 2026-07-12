#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${1:-${BACKUP_DIR:-/backups}}
MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-26}
LATEST=$(find "$BACKUP_DIR" -name "loci-*.dump" -type f -size +0c -print | sort | tail -n 1)

if [ -z "$LATEST" ]; then
  echo "error: no non-empty backup found in $BACKUP_DIR" >&2
  exit 1
fi

pg_restore --list "$LATEST" >/dev/null

AGE_SECONDS=$(( $(date +%s) - $(stat -c %Y "$LATEST") ))
if [ "$AGE_SECONDS" -gt $((MAX_AGE_HOURS * 3600)) ]; then
  echo "error: latest backup is older than $MAX_AGE_HOURS hours" >&2
  exit 1
fi

if [ -f "$LATEST.sha256" ]; then
  (cd "$BACKUP_DIR" && sha256sum -c "$(basename "$LATEST.sha256")" >/dev/null)
fi

echo "backup verified: $LATEST"
