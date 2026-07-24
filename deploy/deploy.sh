#!/usr/bin/env bash
set -euo pipefail

# deploy latest main to production — run from the repo root on the server

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="docker compose -f $REPO_DIR/docker/docker-compose.prod.yml --env-file $REPO_DIR/.env"

cd "$REPO_DIR"

if [ ! -f .env ]; then
  echo "error: .env not found in $REPO_DIR — copy .env.example and fill it" >&2
  exit 1
fi

DOMAIN=${CADDY_DOMAIN:-$(sed -n 's/^CADDY_DOMAIN=//p' .env | tail -n 1)}
if [ -z "$DOMAIN" ]; then
  echo "error: CADDY_DOMAIN is empty" >&2
  exit 1
fi

git fetch origin main
git reset --hard origin/main

TARGET=${DEPLOYMENT_TARGET:-$(sed -n 's/^DEPLOYMENT_TARGET=//p' .env | tail -n 1)}
if [ -z "$TARGET" ]; then
  if docker ps --format '{{.Names}}' | grep -qx wished-caddy; then
    TARGET=shared-host
  else
    TARGET=dedicated
  fi
fi

if [ "$TARGET" = "shared-host" ]; then
  COMPOSE="$COMPOSE -f $REPO_DIR/docker/docker-compose.shared-host.yml"
else
  COMPOSE="$COMPOSE --profile dedicated"
fi

DEPLOYMENT_TARGET="$TARGET" "$REPO_DIR/deploy/preflight.sh"

MONITORING_ENABLED=$(sed -n 's/^MONITORING_ENABLED=//p' .env | tail -n 1)
if [ "$TARGET" = "dedicated" ] && [ "${MONITORING_ENABLED:-true}" = "true" ]; then
  COMPOSE="$COMPOSE --profile monitoring"
fi

$COMPOSE config -q
if [ "${DEPLOY_USE_PREBUILT:-false}" = "true" ]; then
  $COMPOSE pull
else
  $COMPOSE build
fi
$COMPOSE up -d --wait postgres redis
$COMPOSE run --rm --no-deps backup /usr/local/bin/backup.sh
$COMPOSE run --rm --no-deps api alembic upgrade head
$COMPOSE up -d --remove-orphans --wait
$COMPOSE exec -T backup /usr/local/bin/verify-backup.sh /backups

curl --fail --silent --show-error --retry 10 --retry-delay 3 \
  "https://$DOMAIN/health" >/dev/null
ENV_FILE="$REPO_DIR/.env" BASE_URL="https://$DOMAIN" "$REPO_DIR/deploy/smoke-auth.sh"

docker image prune -f

$COMPOSE ps
echo "deploy complete"
