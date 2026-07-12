#!/usr/bin/env bash
set -euo pipefail

# restore a backup into the production database — destructive, asks for confirmation
# usage: deploy/restore.sh /opt/loci/backups/loci-YYYYMMDD-HHMMSS.dump

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="docker compose -f $REPO_DIR/docker/docker-compose.prod.yml --env-file $REPO_DIR/.env"

DUMP_FILE=${1:?usage: restore.sh <path-to-dump-file>}

if [ ! -f "$DUMP_FILE" ]; then
  echo "error: $DUMP_FILE not found" >&2
  exit 1
fi

$COMPOSE exec -T postgres pg_restore --list < "$DUMP_FILE" >/dev/null

if [ -f "$DUMP_FILE.sha256" ]; then
  (cd "$(dirname "$DUMP_FILE")" && sha256sum -c "$(basename "$DUMP_FILE.sha256")")
fi

echo "this will replace the production database contents"
read -r -p "type 'restore' to continue: " CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "aborted"
  exit 1
fi

$COMPOSE run --rm --no-deps backup /usr/local/bin/backup.sh
$COMPOSE stop api worker worker-events bot beat

restart_services() {
  $COMPOSE up -d --wait api worker worker-events bot beat
}
trap restart_services EXIT

$COMPOSE exec -T postgres sh -c \
  "pg_restore --username=\"\$POSTGRES_USER\" --dbname=\"\$POSTGRES_DB\" --clean --if-exists --no-owner --exit-on-error --single-transaction" \
  < "$DUMP_FILE"

$COMPOSE run --rm --no-deps api alembic upgrade head

echo "restore complete from $DUMP_FILE"
