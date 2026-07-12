#!/usr/bin/env bash
set -euo pipefail

# daily postgres backup — runs inside the backup container via cron

BACKUP_DIR=${BACKUP_DIR:-/backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/loci-$STAMP.dump"
TEMP_FILE="$FILE.tmp"

umask 077

pg_dump \
  --host="${POSTGRES_HOST:-postgres}" \
  --username="${POSTGRES_USER:-loci}" \
  --dbname="${POSTGRES_DB:-loci}" \
  --format=custom \
  --file="$TEMP_FILE"

pg_restore --list "$TEMP_FILE" >/dev/null
mv "$TEMP_FILE" "$FILE"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE.sha256")")

if [ -n "${BACKUP_S3_ENDPOINT:-}" ] || [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if [ -z "${BACKUP_S3_ENDPOINT:-}" ] || [ -z "${BACKUP_S3_BUCKET:-}" ] || \
     [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    echo "error: offsite backup configuration is incomplete" >&2
    exit 1
  fi
  if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
    echo "error: BACKUP_AGE_RECIPIENT is required for offsite backups" >&2
    exit 1
  fi
  ENCRYPTED_FILE="$FILE.age"
  age --recipient "$BACKUP_AGE_RECIPIENT" --output "$ENCRYPTED_FILE.tmp" "$FILE"
  mv "$ENCRYPTED_FILE.tmp" "$ENCRYPTED_FILE"
  (cd "$BACKUP_DIR" && sha256sum \
    "$(basename "$ENCRYPTED_FILE")" > "$(basename "$ENCRYPTED_FILE.sha256")")
  aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp \
    "$ENCRYPTED_FILE" "s3://$BACKUP_S3_BUCKET/$(basename "$ENCRYPTED_FILE")" --only-show-errors
  aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp \
    "$ENCRYPTED_FILE.sha256" \
    "s3://$BACKUP_S3_BUCKET/$(basename "$ENCRYPTED_FILE.sha256")" --only-show-errors
fi

find "$BACKUP_DIR" -name "loci-*.dump" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "loci-*.dump.sha256" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "loci-*.dump.age" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "loci-*.dump.age.sha256" -mtime "+$RETENTION_DAYS" -delete

echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
