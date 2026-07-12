#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=${COMPOSE_ENV_FILE:-$REPO_DIR/.env}
COMPOSE_FILE="$REPO_DIR/docker/docker-compose.prod.yml"
MODEL=$(mktemp)
SHARED_MODEL=$(mktemp)
trap 'rm -f "$MODEL" "$SHARED_MODEL"' EXIT

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  --profile dedicated --profile monitoring config --format json > "$MODEL"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  -f "$REPO_DIR/docker/docker-compose.shared-host.yml" \
  config --format json > "$SHARED_MODEL"

jq -e '
  (.services.api.mem_limit | tonumber) == 1073741824 and
  (.services.worker.mem_limit | tonumber) == 805306368 and
  (.services["worker-events"].mem_limit | tonumber) == 268435456 and
  (.services.postgres.mem_limit | tonumber) == 3221225472 and
  (.services.redis.mem_limit | tonumber) == 536870912 and
  .services.api.environment.WEB_CONCURRENCY == "3" and
  .services.api.environment.DB_POOL_SIZE == "5" and
  .services.api.environment.DB_MAX_OVERFLOW == "3" and
  (.services.postgres.command | index("shared_buffers=2GB") != null) and
  (.services.postgres.command | index("max_connections=60") != null) and
  (.services.redis.command | index("384mb") != null) and
  (.services["node-exporter"].mem_limit | tonumber) == 67108864 and
  (.services.cadvisor.mem_limit | tonumber) == 134217728 and
  ([.services[] | has("mem_limit")] | all) and
  ([.services | to_entries[] | select(.key != "caddy" and .key != "grafana") | .value.ports // []] | add | length) == 0 and
  (.services.grafana.ports | all(.host_ip == "127.0.0.1")) and
  ([.services[].mem_limit | tonumber] | add) <= 7784628224
' "$MODEL" >/dev/null

jq -e '
  (.services.api.mem_limit | tonumber) == 536870912 and
  (.services.worker.mem_limit | tonumber) == 536870912 and
  (.services["worker-events"].mem_limit | tonumber) == 201326592 and
  (.services.postgres.mem_limit | tonumber) == 1073741824 and
  (.services.redis.mem_limit | tonumber) == 268435456 and
  .services.api.environment.WEB_CONCURRENCY == "2" and
  .services.api.environment.DB_POOL_SIZE == "5" and
  .services.api.environment.DB_MAX_OVERFLOW == "3" and
  (.services.postgres.command | index("shared_buffers=256MB") != null) and
  (.services.postgres.command | index("max_connections=50") != null) and
  (.services.redis.command | index("128mb") != null) and
  (.services.api.networks | has("wished-proxy")) and
  (.services.web.networks | has("wished-proxy")) and
  ([.services | to_entries[] | .value.ports // []] | add | length) == 0
' "$SHARED_MODEL" >/dev/null

echo "dedicated and shared-host capacity models validated"
