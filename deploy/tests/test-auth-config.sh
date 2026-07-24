#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
ENV_FILE="$TEST_DIR/test.env"

write_valid_config() {
  {
    echo 'CADDY_DOMAIN=loci.test'
    echo 'TELEGRAM_MINI_APP_URL=https://loci.test'
    echo 'ALLOWED_ORIGINS=["https://loci.test"]'
    echo 'NEXT_PUBLIC_SUPPORT_EMAIL=privacy@loci.test'
    echo 'GOOGLE_CLIENT_ID=client.apps.googleusercontent.com'
    echo 'GOOGLE_CLIENT_SECRET=secret'
    echo 'GOOGLE_REDIRECT_URI=https://loci.test/api/v1/auth/google/callback'
  } > "$ENV_FILE"
}

write_valid_config
ENV_FILE="$ENV_FILE" "$REPO_DIR/deploy/check-auth-config.sh" >/dev/null

sed -i.bak 's#privacy@loci.test#privacy@example.com#' "$ENV_FILE"
if ENV_FILE="$ENV_FILE" "$REPO_DIR/deploy/check-auth-config.sh" >/dev/null 2>&1; then
  echo "expected example support address to fail" >&2
  exit 1
fi

write_valid_config
sed -i.bak 's#https://loci.test/api/v1/auth/google/callback#https://other.test/callback#' "$ENV_FILE"
if ENV_FILE="$ENV_FILE" "$REPO_DIR/deploy/check-auth-config.sh" >/dev/null 2>&1; then
  echo "expected mismatched Google callback to fail" >&2
  exit 1
fi

write_valid_config
sed -i.bak 's#\["https://loci.test"\]#\["https://other.test"\]#' "$ENV_FILE"
if ENV_FILE="$ENV_FILE" "$REPO_DIR/deploy/check-auth-config.sh" >/dev/null 2>&1; then
  echo "expected missing public CORS origin to fail" >&2
  exit 1
fi

echo "auth configuration tests passed"
