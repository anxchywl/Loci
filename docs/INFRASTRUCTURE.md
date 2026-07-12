# Loci — Infrastructure

## Services

| Service | Dev | Prod |
|---|---|---|
| API | uvicorn --reload in container, port 8000 | uvicorn workers behind Caddy |
| Web | next dev in node container, port 3000 | standalone Next.js build behind Caddy |
| PostgreSQL | postgis/postgis:16-3.4, host port 5433 | same image, internal network only |
| Redis | redis:7-alpine with password | same, internal network only |
| Object storage | MinIO (ports 9000/9001) | Cloudflare R2 (S3-compatible API) |
| TLS / routing | — | Caddy 2 with automatic HTTPS |
| Backups | — | daily pg_dump cron container, 03:00, 14-day retention |
| Map tiles | OpenFreeMap (no API key, no usage cap) | same; fallback option: MapTiler free tier |

The `worker` service runs Celery for photo optimization:
`celery -A app.workers.celery_app worker`. The `bot` service runs the aiogram
Mini App launcher. Production application containers run as unprivileged users
with read-only root filesystems, dropped capabilities, process/memory limits,
and only private Compose networks. Only Caddy publishes host ports.

## Environment variables

Single source: `.env` at the repo root (copy from `.env.example`). Compose
injects everything; the backend reads them via `pydantic-settings`
(`backend/app/core/config/`). No secrets in code, images, or the database.

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` / `production`; production enforces secure values at startup |
| `TELEGRAM_BOT_TOKEN` | bot token; also the HMAC key for initData validation |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | staleness bound, keep ≤300 in prod |
| `LOCATION_FUZZ_SECRET` | keys the deterministic location-fuzz offset; leaking it makes approximate locations reversible |
| `JWT_SECRET_KEY` / `JWT_ALGORITHM` | token signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | token lifetimes |
| `POSTGRES_*` | database connection parts |
| `REDIS_*` | cache / rate-limit / replay-guard store |
| `S3_*` | object storage — MinIO in dev, R2 in prod (endpoint + keys differ, code identical) |
| `ALLOWED_ORIGINS` | JSON list for CORS |
| `NEXT_PUBLIC_API_URL` | frontend → API base URL |
| `CADDY_DOMAIN` | prod domain for TLS + routing |
| `BACKUP_RETENTION_DAYS` / `BACKUP_DIR` | backup policy |
| `ADMIN_TELEGRAM_IDS` | comma-separated Telegram IDs granted access to the admin panel |
| `WEB_CONCURRENCY` | production Uvicorn worker count |

## Local development

Use the quickstart in [README.md](../README.md). This file keeps deployment,
environment, backup, and recovery details.

## Production runbook

### Before the first deploy

1. Provision a current Debian/Ubuntu host as root:

   ```sh
   git clone <repository-url> /opt/loci/repo
   cd /opt/loci/repo
   deploy/setup-server.sh
   cp .env.example .env
   chmod 600 .env
   ```

2. Replace every development/default credential in `.env`. Generate independent
   secrets; never reuse the bot token, database password, JWT secret, Redis
   password, S3 secret, or location-fuzz secret.

   ```sh
   openssl rand -base64 48
   ```

3. Set the production endpoints:

   - `APP_ENV=production`
   - `CADDY_DOMAIN` to the public hostname
   - `TELEGRAM_MINI_APP_URL=https://<CADDY_DOMAIN>`
   - `ALLOWED_ORIGINS=["https://<CADDY_DOMAIN>"]`
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` to the bot username without `@`
   - Cloudflare R2 values for every `S3_*` variable, with HTTPS enabled

4. Point the hostname's A/AAAA records at the server. Confirm inbound TCP
   80/443 and outbound DNS/HTTPS work. Set the same HTTPS URL as the Mini App URL
   in BotFather.

5. Validate configuration before creating containers:

   ```sh
   docker compose \
     --env-file .env \
     -f docker/docker-compose.prod.yml \
     config -q
   ```

### Deploy

Run from the repository checkout:

```sh
deploy/deploy.sh
```

The script performs a fast-forward pull, validates Compose, builds images,
starts PostgreSQL and Redis, creates and validates a pre-migration backup, runs
Alembic in a one-off API container, starts the full stack with health waiting,
verifies the mounted backup again, checks the public HTTPS health endpoint, and
then prunes dangling images. A failed migration or health check stops the deploy
with a non-zero exit code.

Inspect the result:

```sh
docker compose --env-file .env -f docker/docker-compose.prod.yml ps
curl --fail --show-error "https://$CADDY_DOMAIN/health"
docker compose --env-file .env -f docker/docker-compose.prod.yml logs --tail=100 caddy api worker bot
```

Expected: PostgreSQL, Redis, API, and web are healthy; Caddy, worker, bot, and
backup are running; `/health` returns `{"status":"ok"}`. The API and databases
must not have published host ports.

### Backups and restore

The `backup` container runs `deploy/backup.sh` daily at 03:00 server time.
Backups use PostgreSQL custom format, are validated with `pg_restore --list`
before success is logged, live under `BACKUP_DIR`, and are retained for 14 days
by default. Every deployment also creates a validated backup before migrations.

Verify at any time:

```sh
docker compose --env-file .env -f docker/docker-compose.prod.yml exec -T backup \
  /usr/local/bin/verify-backup.sh /backups
docker compose --env-file .env -f docker/docker-compose.prod.yml logs --tail=100 backup
find /opt/loci/backups -name 'loci-*.dump' -type f -size +0 -ls
```

Test restore procedures on a non-production host before launch and at least
quarterly. A production restore is destructive and confirmation-gated:

```sh
deploy/restore.sh /opt/loci/backups/loci-YYYYMMDD-HHMMSS.dump
```

The restore script reads database credentials inside the PostgreSQL container,
restores with `--clean --if-exists`, and reapplies Alembic migrations. Run the
public health check and a private/anonymous-story privacy smoke test afterward.

### Rollback and incident handling

- Application rollback: identify a known-good Git commit, check it out, build
  its API/web images, run its Alembic state only if its migration history is
  forward-compatible, and start that Compose definition. Do not downgrade the
  database automatically; restore the pre-deploy dump when a schema rollback is
  actually required.
- Failed migration: application services have not yet been replaced. Inspect
  the one-off container output, fix forward, and rerun `deploy/deploy.sh`.
- Failed post-start health check: inspect `docker compose ... logs`; the
  pre-migration dump is already available. Rebuild the last known-good commit or
  restore if the failure is data-related.
- TLS failure: confirm DNS resolves to the host, ports 80/443 are reachable, and
  inspect Caddy logs. Do not bypass HTTPS for Telegram production traffic.
- Suspected secret leak: rotate the affected credential immediately. Rotating
  `LOCATION_FUZZ_SECRET` changes future deterministic offsets and requires a
  privacy review before any data rewrite.

This Compose deployment briefly restarts application containers and is not
zero-downtime. The database and Redis remain up during normal deploys. Add a
multi-host/orchestrated rollout only when availability requirements justify it.

### Shared edge proxy

If the host already has a Caddy container bound to ports 80/443, do not start a
second public Caddy. Attach the existing Caddy container to Loci's app network
and add a site block for `CADDY_DOMAIN` that routes `/api/*` and `/health` to
`loci-api-1:8000`, and all other paths to `loci-web-1:3000`. Validate and reload
the existing Caddy config before considering the deploy complete.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

- backend Ruff and the full pytest suite against PostGIS, Redis, and MinIO
- frontend typecheck, ESLint, component tests, and production build
- dev/prod Compose validation and production API/web/backup image builds

CI credentials are isolated placeholder values; no repository secret is baked
into an image. A green workflow is required before production deployment.

## Object storage

Cloudflare R2 in production (zero egress fees), MinIO locally. Both are
S3-compatible; the backend uses one client with `S3_*` env config. Bucket
holds photo bytes only — metadata and moderation state live in PostgreSQL.
Presigned PUT URLs are single-key-scoped and expire in 10 minutes.
