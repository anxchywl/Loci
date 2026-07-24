#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR=$(mktemp -d)
PORT=${AUTH_SMOKE_TEST_PORT:-18765}
SERVER_PID=

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

ENV_FILE="$TEST_DIR/test.env"
{
  echo 'CADDY_DOMAIN=loci.test'
  echo 'NEXT_PUBLIC_SUPPORT_EMAIL=privacy@loci.test'
  echo 'GOOGLE_CLIENT_ID='
} > "$ENV_FILE"

python3 "$REPO_DIR/deploy/tests/auth_smoke_server.py" "$PORT" &
SERVER_PID=$!
for _attempt in $(seq 1 20); do
  if curl --fail --silent "http://127.0.0.1:$PORT/health" >/dev/null; then
    break
  fi
  sleep 0.1
done

ENV_FILE="$ENV_FILE" BASE_URL="http://127.0.0.1:$PORT" \
  "$REPO_DIR/deploy/smoke-auth.sh" >/dev/null

sed -i.bak 's/privacy@loci.test/other@loci.test/' "$ENV_FILE"
if ENV_FILE="$ENV_FILE" BASE_URL="http://127.0.0.1:$PORT" \
  "$REPO_DIR/deploy/smoke-auth.sh" >/dev/null 2>&1; then
  echo "expected mismatched public contact to fail" >&2
  exit 1
fi

kill "$SERVER_PID" >/dev/null 2>&1 || true
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=
PORT=$((PORT + 1))
{
  echo 'CADDY_DOMAIN=loci.test'
  echo 'NEXT_PUBLIC_SUPPORT_EMAIL=privacy@loci.test'
  echo 'GOOGLE_CLIENT_ID=client.apps.googleusercontent.com'
} > "$ENV_FILE"
python3 "$REPO_DIR/deploy/tests/auth_smoke_server.py" "$PORT" true &
SERVER_PID=$!
for _attempt in $(seq 1 20); do
  if curl --fail --silent "http://127.0.0.1:$PORT/health" >/dev/null; then
    break
  fi
  sleep 0.1
done
ENV_FILE="$ENV_FILE" BASE_URL="http://127.0.0.1:$PORT" \
  "$REPO_DIR/deploy/smoke-auth.sh" >/dev/null

echo "auth smoke tests passed"
