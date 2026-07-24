#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=${ENV_FILE:-$REPO_DIR/.env}

fail() {
  echo "error: $1" >&2
  exit 1
}

env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

[ -f "$ENV_FILE" ] || fail "environment file not found: $ENV_FILE"
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

DOMAIN=$(env_value CADDY_DOMAIN)
BASE_URL=${BASE_URL:-https://$DOMAIN}
BASE_URL=${BASE_URL%/}
SUPPORT_EMAIL=$(env_value NEXT_PUBLIC_SUPPORT_EMAIL)

GOOGLE_EXPECTED=false
if [ -n "$(env_value GOOGLE_CLIENT_ID)" ]; then
  GOOGLE_EXPECTED=true
fi

request() {
  curl --fail --silent --show-error --retry 5 --retry-delay 2 \
    --connect-timeout 10 --max-time 30 "$@"
}

request "$BASE_URL/health" | jq -e '.status == "ok"' >/dev/null

PROVIDERS=$(request "$BASE_URL/api/v1/auth/providers")
printf '%s' "$PROVIDERS" | jq -e --argjson google "$GOOGLE_EXPECTED" \
  '.email == true and .google == $google' >/dev/null \
  || fail "public provider capabilities do not match the deployment configuration"

for path in privacy terms; do
  PAGE=$(request "$BASE_URL/$path")
  printf '%s' "$PAGE" | grep -Fq "$SUPPORT_EMAIL" \
    || fail "/$path does not contain NEXT_PUBLIC_SUPPORT_EMAIL"
done

REFRESH_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --connect-timeout 10 --max-time 30 --request POST \
  "$BASE_URL/api/v1/auth/refresh")
[ "$REFRESH_STATUS" = "401" ] || fail "refresh without cookies must return 401, got $REFRESH_STATUS"

if [ "$GOOGLE_EXPECTED" = "true" ]; then
  GOOGLE_START=$(request "$BASE_URL/api/v1/auth/google/start?redirect=%2Fprofile")
  printf '%s' "$GOOGLE_START" | jq -e \
    '.authorization_url | startswith("https://accounts.google.com/")' >/dev/null \
    || fail "enabled Google login did not return a Google authorization URL"
else
  GOOGLE_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 10 --max-time 30 \
    "$BASE_URL/api/v1/auth/google/start?redirect=%2Fprofile")
  [ "$GOOGLE_STATUS" = "404" ] || fail "disabled Google login start returned $GOOGLE_STATUS"
fi

echo "public auth smoke passed: base=$BASE_URL google=$GOOGLE_EXPECTED"
