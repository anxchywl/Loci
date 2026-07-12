#!/usr/bin/env bash
set -euo pipefail

# Apply CORS to the Cloudflare R2 media bucket so browsers can upload directly
# via presigned URLs (the fast, primary path). Until this is applied, uploads
# still succeed through the backend proxy fallback — just a hop slower.
#
# Requires the AWS CLI pointed at R2. Run from the repo root with .env loaded, or
# export these first:
#   S3_ACCESS_KEY / S3_SECRET_KEY  — R2 API token key/secret
#   S3_PUBLIC_ENDPOINT             — https://<account>.r2.cloudflarestorage.com
#   S3_MEDIA_BUCKET                — loci-media
#
# Alternatively configure the same rules in the Cloudflare dashboard:
#   R2 > <bucket> > Settings > CORS Policy  (paste deploy/r2-cors.json)

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$REPO_DIR/.env" ] && set -a && . "$REPO_DIR/.env" && set +a

: "${S3_ACCESS_KEY:?set S3_ACCESS_KEY}"
: "${S3_SECRET_KEY:?set S3_SECRET_KEY}"
: "${S3_PUBLIC_ENDPOINT:?set S3_PUBLIC_ENDPOINT}"
: "${S3_MEDIA_BUCKET:=loci-media}"

AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
aws s3api put-bucket-cors \
  --endpoint-url "$S3_PUBLIC_ENDPOINT" \
  --bucket "$S3_MEDIA_BUCKET" \
  --cors-configuration "{\"CORSRules\": $(cat "$REPO_DIR/deploy/r2-cors.json")}"

echo "applied CORS to $S3_MEDIA_BUCKET"
