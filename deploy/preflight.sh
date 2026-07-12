#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
COMPOSE_FILE="$REPO_DIR/docker/docker-compose.prod.yml"
SHARED_COMPOSE_FILE="$REPO_DIR/docker/docker-compose.shared-host.yml"

fail() {
  echo "error: $1" >&2
  exit 1
}

env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

[ -f "$ENV_FILE" ] || fail ".env not found"

ENV_MODE=$(stat -c %a "$ENV_FILE")
case "$ENV_MODE" in
  400|600) ;;
  *) fail ".env permissions must be 400 or 600, found $ENV_MODE" ;;
esac

[ "$(stat -c %U "$ENV_FILE")" = "$(id -un)" ] || fail ".env must be owned by the deploy user"
[ "$(env_value APP_ENV)" = "production" ] || fail "APP_ENV must be production"
[ "$(env_value S3_SECURE)" = "true" ] || fail "S3_SECURE must be true in production"

case "$(env_value ALLOWED_ORIGINS)" in
  *localhost*|*127.0.0.1*) fail "ALLOWED_ORIGINS contains a development origin" ;;
esac

for pair in \
  "JWT_SECRET_KEY:change-me" \
  "LOCATION_FUZZ_SECRET:change-me-fuzz" \
  "POSTGRES_PASSWORD:loci" \
  "REDIS_PASSWORD:loci-redis" \
  "S3_SECRET_KEY:loci-password"; do
  VARIABLE=${pair%%:*}
  INSECURE=${pair#*:}
  VALUE=$(env_value "$VARIABLE")
  [ -n "$VALUE" ] || fail "$VARIABLE must be set"
  [ "$VALUE" != "$INSECURE" ] || fail "$VARIABLE still has its development value"
done

for variable in JWT_SECRET_KEY LOCATION_FUZZ_SECRET POSTGRES_PASSWORD; do
  VALUE=$(env_value "$variable")
  [ "${#VALUE}" -ge 24 ] || fail "$variable must be at least 24 characters"
done

MEMORY_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
AVAILABLE_KB=$(df -Pk "$REPO_DIR" | awk 'NR == 2 {print $4}')

TARGET=${DEPLOYMENT_TARGET:-$(env_value DEPLOYMENT_TARGET)}
TARGET=${TARGET:-dedicated}
case "$TARGET" in
  dedicated)
    [ "$(nproc)" -ge 4 ] || fail "at least 4 vCPUs are required"
    [ "$MEMORY_KB" -ge 7500000 ] || fail "at least 8 GiB RAM is required"
    [ "$AVAILABLE_KB" -ge 41943040 ] || fail "at least 40 GiB disk space must remain free"
    COMPOSE_ARGS=(-f "$COMPOSE_FILE" --profile dedicated)
    MAX_CONNECTIONS=60
    DEFAULT_WEB_CONCURRENCY=3
    REDIS_VALUE=$(env_value REDIS_PASSWORD)
    [ "${#REDIS_VALUE}" -ge 24 ] || fail "REDIS_PASSWORD must be at least 24 characters"
    ;;
  shared-host)
    [ "$(nproc)" -ge 2 ] || fail "at least 2 vCPUs are required"
    [ "$MEMORY_KB" -ge 3500000 ] || fail "at least 4 GiB RAM is required"
    [ "$AVAILABLE_KB" -ge 20971520 ] || fail "at least 20 GiB disk space must remain free"
    COMPOSE_ARGS=(-f "$COMPOSE_FILE" -f "$SHARED_COMPOSE_FILE")
    MAX_CONNECTIONS=50
    DEFAULT_WEB_CONCURRENCY=2
    ;;
  *) fail "DEPLOYMENT_TARGET must be dedicated or shared-host" ;;
esac

docker info >/dev/null 2>&1 || fail "docker daemon is unavailable"
docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" config -q

BACKUP_CONFIGURED=false
if [ -n "$(env_value BACKUP_S3_ENDPOINT)" ] || [ -n "$(env_value BACKUP_S3_BUCKET)" ]; then
  BACKUP_CONFIGURED=true
fi
if [ "$TARGET" = "dedicated" ] || [ "$BACKUP_CONFIGURED" = "true" ]; then
  for variable in BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY BACKUP_AGE_RECIPIENT; do
    [ -n "$(env_value "$variable")" ] || fail "$variable must be set for offsite backups"
  done

  case "$(env_value BACKUP_AGE_RECIPIENT)" in
    age1*) ;;
    *) fail "BACKUP_AGE_RECIPIENT must be an age recipient public key" ;;
  esac

  case "$(env_value BACKUP_S3_ENDPOINT)" in
    https://*) ;;
    *) fail "BACKUP_S3_ENDPOINT must use HTTPS" ;;
  esac

  MEDIA_BUCKET=$(env_value S3_MEDIA_BUCKET)
  MEDIA_BUCKET=${MEDIA_BUCKET:-loci-media}
  [ "$(env_value BACKUP_S3_BUCKET)" != "$MEDIA_BUCKET" ] || fail \
    "database backups must use a bucket separate from photo media"
else
  echo "warning: offsite database backups are not configured on the shared host" >&2
fi

MONITORING_ENABLED=$(env_value MONITORING_ENABLED)
if [ "$TARGET" = "dedicated" ] && [ "${MONITORING_ENABLED:-true}" = "true" ]; then
  GRAFANA_PASSWORD=$(env_value GRAFANA_ADMIN_PASSWORD)
  [ "${#GRAFANA_PASSWORD}" -ge 24 ] || fail \
    "GRAFANA_ADMIN_PASSWORD must be set when monitoring is enabled"
fi

WEB_CONCURRENCY=${WEB_CONCURRENCY:-$(env_value WEB_CONCURRENCY)}
DB_POOL_SIZE=${DB_POOL_SIZE:-$(env_value DB_POOL_SIZE)}
DB_MAX_OVERFLOW=${DB_MAX_OVERFLOW:-$(env_value DB_MAX_OVERFLOW)}
WEB_CONCURRENCY=${WEB_CONCURRENCY:-$DEFAULT_WEB_CONCURRENCY}
DB_POOL_SIZE=${DB_POOL_SIZE:-5}
DB_MAX_OVERFLOW=${DB_MAX_OVERFLOW:-3}

for value in "$WEB_CONCURRENCY" "$DB_POOL_SIZE" "$DB_MAX_OVERFLOW"; do
  [[ "$value" =~ ^[0-9]+$ ]] || fail "worker and database pool sizes must be integers"
done
RESERVED_CONNECTIONS=14
APP_CONNECTIONS=$((WEB_CONCURRENCY * (DB_POOL_SIZE + DB_MAX_OVERFLOW)))

if [ $((APP_CONNECTIONS + RESERVED_CONNECTIONS)) -gt "$MAX_CONNECTIONS" ]; then
  fail "database connection budget exceeds max_connections=$MAX_CONNECTIONS"
fi

BACKUP_DIR=$(env_value BACKUP_DIR)
BACKUP_DIR=${BACKUP_DIR:-/opt/loci/backups}
[ -d "$BACKUP_DIR" ] || fail "backup directory does not exist: $BACKUP_DIR"
[ -w "$BACKUP_DIR" ] || fail "backup directory is not writable: $BACKUP_DIR"

echo "preflight passed for $TARGET: $(nproc) vCPUs, $((MEMORY_KB / 1024)) MiB RAM, $((AVAILABLE_KB / 1024 / 1024)) GiB free"
echo "database connection budget: $APP_CONNECTIONS application + $RESERVED_CONNECTIONS reserved / $MAX_CONNECTIONS"
