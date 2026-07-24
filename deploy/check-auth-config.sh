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
command -v jq >/dev/null 2>&1 || fail "jq is required"

DOMAIN=$(env_value CADDY_DOMAIN)
[ -n "$DOMAIN" ] || fail "CADDY_DOMAIN must be set"
case "$DOMAIN" in
  *://*|*/*|*:*|*[[:space:]]*) fail "CADDY_DOMAIN must be a hostname without scheme, path, port, or spaces" ;;
esac

PUBLIC_URL="https://$DOMAIN"
MINI_APP_URL=${TELEGRAM_MINI_APP_URL:-$(env_value TELEGRAM_MINI_APP_URL)}
MINI_APP_URL=${MINI_APP_URL%/}
[ "$MINI_APP_URL" = "$PUBLIC_URL" ] || fail "TELEGRAM_MINI_APP_URL must equal $PUBLIC_URL"

ORIGINS=$(env_value ALLOWED_ORIGINS)
printf '%s' "$ORIGINS" | jq -e --arg origin "$PUBLIC_URL" \
  'type == "array" and index($origin) != null' >/dev/null \
  || fail "ALLOWED_ORIGINS must be a JSON array containing $PUBLIC_URL"

SUPPORT_EMAIL=$(env_value NEXT_PUBLIC_SUPPORT_EMAIL)
[[ "$SUPPORT_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] \
  || fail "NEXT_PUBLIC_SUPPORT_EMAIL must be a valid monitored address"
case "$SUPPORT_EMAIL" in
  *@example.com|*@example.org|*@example.net) fail "NEXT_PUBLIC_SUPPORT_EMAIL must not use an example domain" ;;
esac

GOOGLE_CLIENT_ID_VALUE=$(env_value GOOGLE_CLIENT_ID)
GOOGLE_CLIENT_SECRET_VALUE=$(env_value GOOGLE_CLIENT_SECRET)
GOOGLE_REDIRECT_URI_VALUE=$(env_value GOOGLE_REDIRECT_URI)
GOOGLE_CONFIGURED=false
if [ -n "$GOOGLE_CLIENT_ID_VALUE" ] || [ -n "$GOOGLE_CLIENT_SECRET_VALUE" ] || [ -n "$GOOGLE_REDIRECT_URI_VALUE" ]; then
  [ -n "$GOOGLE_CLIENT_ID_VALUE" ] \
    && [ -n "$GOOGLE_CLIENT_SECRET_VALUE" ] \
    && [ -n "$GOOGLE_REDIRECT_URI_VALUE" ] \
    || fail "all GOOGLE_* values must be set together"
  case "$GOOGLE_CLIENT_ID_VALUE" in
    *.apps.googleusercontent.com) ;;
    *) fail "GOOGLE_CLIENT_ID must end with .apps.googleusercontent.com" ;;
  esac
  EXPECTED_REDIRECT="$PUBLIC_URL/api/v1/auth/google/callback"
  [ "$GOOGLE_REDIRECT_URI_VALUE" = "$EXPECTED_REDIRECT" ] \
    || fail "GOOGLE_REDIRECT_URI must equal $EXPECTED_REDIRECT"
  GOOGLE_CONFIGURED=true
fi

echo "auth configuration valid: domain=$DOMAIN google=$GOOGLE_CONFIGURED"
