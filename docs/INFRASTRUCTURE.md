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

The `worker` service runs Celery for photo optimization and durable media
erasure cleanup:
`celery -A app.workers.celery_app worker`. The `bot` service runs the aiogram
Mini App launcher. Production application containers run as unprivileged users
with read-only root filesystems, dropped capabilities, process/memory limits,
and only private Compose networks. Only Caddy publishes host ports.

Account-erasure media jobs are stored in PostgreSQL before story metadata is
removed. A maintenance task polls every five minutes and retries object-storage
deletion without a fixed attempt limit. Database backup retention remains
governed by the documented backup schedule; deleted records can persist inside
encrypted backups until those backups expire.

## Initial production topology

The first dedicated production stage targets one DigitalOcean Basic Droplet:

| Resource | Selection |
|---|---|
| Compute | 4 shared vCPUs, 8 GiB RAM |
| Disk | 160 GiB local SSD |
| Transfer | 5,000 GiB/month |
| Droplet backups | daily |
| Application backup | daily PostgreSQL custom dump to local disk and a separate private R2 bucket |

The Droplet is currently $48/month and daily Droplet backups add 30%, keeping
the baseline near $62.40/month before tax. Verify current pricing before
provisioning. PostgreSQL has a 3 GiB container limit and 2 GiB shared buffers;
Redis has a 512 MiB container limit and a 384 MiB no-eviction data ceiling; API
and photo workers each have 1 GiB limits. The preflight script rejects hosts
below 4 vCPUs, 8 GiB RAM, or 40 GiB remaining disk.

Application cache/session/rate-limit keys use Redis database 0, Celery broker
keys use database 1, and short-lived Celery results use database 2. This is
namespace separation, not failure isolation; all three initially share one
Redis process and memory ceiling.

## Environment variables

Single source: `.env` at the repo root (copy from `.env.example`). Compose
injects everything; the backend reads them via `pydantic-settings`
(`backend/app/core/config/`). No secrets in code, images, or the database.

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` / `production`; production enforces secure values at startup |
| `TELEGRAM_BOT_TOKEN` | bot token; also the HMAC key for initData validation |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | staleness bound, keep ≤300 in prod |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OIDC login; set all three to enable, leave empty to disable. Redirect URI must be HTTPS in production. Startup rejects partial configuration |
| `EMAIL_CODE_SECRET` | keys the HMAC over 6-digit email codes; ≥24 chars enforced in production. Leaking it does not reveal codes without the stored hashes, but rotate on suspicion |
| `EMAIL_CODE_TTL_MINUTES` / `EMAIL_CODE_MAX_ATTEMPTS` / `EMAIL_RESEND_COOLDOWN_SECONDS` | verification/reset code lifetime, attempt cap, and resend cooldown |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USERNAME` / `EMAIL_PASSWORD` / `EMAIL_FROM` | SMTP delivery; `EMAIL_HOST=console` is development-only. A real host and credentials are required in production |
| `HIBP_ENABLED` | optional k-anonymity compromised-password screening; fails open (allows) on API error |
| `LOCATION_FUZZ_SECRET` | keys the deterministic location-fuzz offset; leaking it makes approximate locations reversible |
| `JWT_SECRET_KEY` / `JWT_ALGORITHM` | token signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | token lifetimes |
| `POSTGRES_*` | database connection parts |
| `DATABASE_URL` | complete managed PostgreSQL URL; overrides `POSTGRES_*` when set |
| `REDIS_*` | cache / rate-limit / replay-guard store |
| `REDIS_URL` | complete managed application Redis URL; overrides `REDIS_*` when set |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | optional independent managed Redis URLs for Celery |
| `S3_*` | object storage — MinIO in dev, R2 in prod (endpoint + keys differ, code identical) |
| `ALLOWED_ORIGINS` | JSON list for CORS |
| `NEXT_PUBLIC_API_URL` | frontend → API base URL |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | public privacy/contact address embedded in the frontend build; required for production |
| `CADDY_DOMAIN` | prod domain for TLS + routing |
| `BACKUP_RETENTION_DAYS` / `BACKUP_DIR` | backup policy |
| `BACKUP_MAX_AGE_HOURS` | maximum acceptable age for backup health, 26 hours by default |
| `BACKUP_S3_*` | separate private R2 backup bucket and bucket-scoped credentials |
| `BACKUP_AGE_RECIPIENT` | public age recipient used to encrypt every offsite database dump |
| `ADMIN_TELEGRAM_IDS` | comma-separated Telegram IDs granted admin access. Transitional: from Phase 2 the authoritative admin flag is `users.is_admin`, and this variable is retired from the per-request authorization path |
| `INITIAL_ADMIN_TELEGRAM_ID` | bootstrap/recovery only: the first Telegram authentication matching this ID is granted `users.is_admin` (Phase 2). Never consulted for per-request authorization |
| `WEB_CONCURRENCY` | production Uvicorn worker count |
| `METRICS_TOKEN` | optional bearer token for direct `/metrics` access; Caddy does not expose this route |
| `GRAFANA_ADMIN_PASSWORD` | required before enabling the optional monitoring profile |
| `MONITORING_ENABLED` | enables the Prometheus/Grafana profile during deployment |
| `DEPLOYMENT_TARGET` | `dedicated` for the new Droplet or `shared-host` for the current server |

## Local development

Use the quickstart in [README.md](../README.md). This file keeps deployment,
environment, backup, and recovery details.

## Production runbook

### Before the first deploy

1. Provision an Ubuntu 24.04 LTS Basic Droplet with 4 vCPUs, 8 GiB RAM,
   160 GiB SSD, daily Droplet backups, an SSH key, and a Reserved IP. Select the
   region only after latency testing from the expected user geography. Apply a
   DigitalOcean Cloud Firewall allowing inbound SSH only from administrator
   addresses and inbound TCP 80/443 plus UDP 443 from anywhere.

2. Clone and provision as root:

   ```sh
   git clone <repository-url> /opt/loci/repo
   cd /opt/loci/repo
   deploy/setup-server.sh
   cp .env.example .env
   chmod 600 .env
   ```

3. Replace every development/default credential in `.env`. Generate independent
   secrets; never reuse the bot token, database password, JWT secret, Redis
   password, S3 secret, or location-fuzz secret.

   ```sh
   openssl rand -base64 48
   ```

4. Set the production endpoints:

   - `APP_ENV=production`
   - `CADDY_DOMAIN` to the public hostname
   - `TELEGRAM_MINI_APP_URL=https://<CADDY_DOMAIN>`
   - `ALLOWED_ORIGINS=["https://<CADDY_DOMAIN>"]`
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` to the bot username without `@`
   - `NEXT_PUBLIC_SUPPORT_EMAIL` to a monitored address used for privacy and
     account-deletion requests; example-domain addresses are rejected
   - `EMAIL_CODE_SECRET` to a new independent secret of at least 24 characters
   - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USERNAME`, `EMAIL_PASSWORD`, and
     `EMAIL_FROM` to a verified SMTP sender; production rejects the `console`
     transport because verification and reset codes must reach users
   - optionally set all three `GOOGLE_*` values and register the exact HTTPS
     callback URI in Google Cloud; leave all three empty to disable Google login
   - decide whether to enable `HIBP_ENABLED` after confirming outbound access to
     the k-anonymity range API; a lookup outage deliberately fails open
   - Cloudflare R2 values for every `S3_*` variable, with HTTPS enabled
   - a separate private `loci-db-backups` R2 bucket with credentials restricted
     to that bucket in `BACKUP_S3_*`
   - `BACKUP_AGE_RECIPIENT` set to a public recipient whose identity file is
     stored offline and tested before launch
   - `MONITORING_ENABLED=true` and an independent Grafana password of at least
     24 characters
   - leave `DATABASE_URL`, `REDIS_URL`, and both `CELERY_*` URLs empty during the
     single-server stage

5. Point the hostname's A/AAAA records at the Reserved IP. Confirm inbound TCP
   80/443 and outbound DNS/HTTPS work. Set the same HTTPS URL as the Mini App URL
   in BotFather.

6. Validate the host, connection budget, secrets, offsite backup configuration,
   disk, public-domain/auth consistency, and Compose model before creating
   containers:

   ```sh
   deploy/preflight.sh
   ```

   Auth readiness requires `TELEGRAM_MINI_APP_URL` and `ALLOWED_ORIGINS` to
   contain the exact `https://$CADDY_DOMAIN` origin. When Google is enabled, its
   client ID must be a Google OAuth client and its callback must be exactly
   `https://$CADDY_DOMAIN/api/v1/auth/google/callback`.

### Deploy

Run from the repository checkout:

```sh
deploy/deploy.sh
```

The script performs a fast-forward pull, runs the capacity/security preflight,
validates Compose, builds images,
starts PostgreSQL and Redis, creates and validates a pre-migration backup, runs
Alembic in a one-off API container, starts the full stack with health waiting,
verifies the mounted backup again, checks the public HTTPS health endpoint, and
runs a non-destructive public auth smoke test. The smoke verifies provider
capabilities, the privacy and terms contact, the unauthenticated refresh boundary,
and the enabled/disabled Google start contract. It does not create an account,
send email, or complete Google authorization. A failed migration, health check,
or auth smoke stops the deploy with a non-zero exit code.

Inspect the result:

```sh
docker compose --env-file .env -f docker/docker-compose.prod.yml ps
curl --fail --show-error "https://$CADDY_DOMAIN/health"
deploy/smoke-auth.sh
docker compose --env-file .env -f docker/docker-compose.prod.yml logs --tail=100 caddy api worker bot
```

Expected: PostgreSQL, Redis, API, and web are healthy; Caddy, worker, bot, and
backup are running; `/health` returns `{"status":"ok"}`. The API and databases
must not have published host ports.

### Backups and restore

The `backup` container runs `deploy/backup.sh` daily at 03:00 server time.
Backups use PostgreSQL custom format, are written atomically, validated with
`pg_restore --list`, checksummed, encrypted client-side with an age public
recipient, copied to a separate private R2 bucket, and
retained locally for 14 days by default. Configure an R2 lifecycle rule for the
offsite retention period. Every deployment also creates and uploads a validated
backup before migrations. Backup health fails when the newest dump is older
than 26 hours or its checksum/restore catalog is invalid.

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

The restore script validates the catalog and checksum, creates a new pre-restore
backup, stops every writer, restores in one transaction with exit-on-error, and
reapplies Alembic migrations. Services restart after success or transaction
rollback. Run the public health check and a private/anonymous-story privacy
smoke test afterward.

R2 stores only `.dump.age` ciphertext and its checksum. To recover an offsite
copy, download both files, verify the ciphertext checksum, and decrypt with the
offline identity before calling the restore script:

```sh
sha256sum -c loci-YYYYMMDD-HHMMSS.dump.age.sha256
age --decrypt --identity /secure/offline/loci-backup.agekey \
  --output loci-YYYYMMDD-HHMMSS.dump loci-YYYYMMDD-HHMMSS.dump.age
deploy/restore.sh /opt/loci/backups/loci-YYYYMMDD-HHMMSS.dump
```

### Rollback and incident handling

- Application rollback: identify a known-good Git commit, check it out, build
  its API/web images, run its Alembic state only if its migration history is
  forward-compatible, and start that Compose definition. Do not downgrade the
  database automatically; restore the pre-deploy dump when a schema rollback is
  actually required.
- Auth schema rollback: after the first Google- or email-only account exists,
  do not downgrade past `e3f4a5b6c7d8`. Those accounts cannot satisfy the old
  non-null Telegram ID constraint. Fix forward or restore the validated
  pre-migration dump together with the last compatible application version.
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
zero-downtime. PostgreSQL and Redis remain up during normal deploys.

### Temporary shared-host target

Until the dedicated Droplet is provisioned, CI deploys with
`DEPLOYMENT_TARGET=shared-host` and
`docker/docker-compose.shared-host.yml`. The override keeps the existing Wished
Caddy edge, two API workers, conservative PostgreSQL/Redis memory settings, one
image worker, and one lightweight notification/maintenance worker. It does not
start Prometheus, Grafana, or a second Caddy. Local validated PostgreSQL backups
remain mandatory; encrypted R2 database backups are enabled when their five
`BACKUP_*` values are present and become mandatory on the dedicated target.

The shared target is a compatibility stage, not evidence for the target-scale
capacity claim. `deploy/deploy.sh` auto-detects the existing `wished-caddy`
container when `DEPLOYMENT_TARGET` is absent, while CI sets the target explicitly.

### Migration from the shared host

1. Lower DNS TTL to 300 seconds at least one day before cutover.
2. Provision and deploy the dedicated Droplet without moving DNS.
3. Confirm local health through an SSH tunnel, R2 access, a successful offsite
   backup, metrics, and a restore rehearsal using a copy of production data.
4. At the maintenance window, stop the old bot and application writers, create
   and verify a final dump, and securely copy the dump plus checksum to the new
   host.
5. Restore on the new host, run migrations, and perform exact/approximate,
   anonymous, private, moderation, upload, and Telegram authentication smoke
   tests.
6. Move the A/AAAA record to the Reserved IP, verify Caddy TLS and BotFather's
   Mini App URL, then start the new bot. Never run both polling bots together.
7. Keep the old host stopped but recoverable for 48 hours. Roll back DNS and
   restart it only if no writes have been accepted on the new host; otherwise a
   database rollback requires explicit reconciliation.

### Horizontal migration path

Scale only from measured pressure, not story count alone. Triggers include API
CPU above 70% for 15 minutes, memory above 80%, database pool use above 70%,
Redis p95 above 50 ms, sustained swap activity, or user-visible latency missing
the documented engineering thresholds.

1. Move PostgreSQL first when database memory/I/O or backup windows dominate.
   Provision managed PostgreSQL with PostGIS and a connection pool, restore a
   rehearsal copy, set `DATABASE_URL`, transfer backup ownership, and repeat the
   privacy smoke suite before cutover.
2. Move Redis next when latency, memory, or Celery contention appears. Use
   independent managed endpoints for `REDIS_URL`, `CELERY_BROKER_URL`, and
   `CELERY_RESULT_BACKEND`; replay/rate-limit/session state may expire naturally,
   but drain Celery queues before broker cutover.
3. Add at least two stateless API/web nodes behind a DigitalOcean Load Balancer.
   JWT/session state already lives outside the API, R2 owns photo bytes, and
   PostgreSQL remains authoritative, so no sticky sessions are required.
4. Run image workers separately from API nodes and scale them from queue depth.
   Keep one Celery Beat instance to avoid duplicate scheduled maintenance.
5. Recalculate `WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` across every
   API replica before adding capacity; keep operational and migration reserve
   below the database connection limit.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

- backend Ruff and the full pytest suite against PostGIS, Redis, and MinIO
- frontend typecheck, ESLint, component tests, and production build
- dev/prod Compose validation and production API/web/backup image builds

CI credentials are isolated placeholder values; no repository secret is baked
into an image. A green workflow is required before production deployment.

## Observability

The API exports Prometheus metrics at internal-only `GET /metrics`. HTTP labels
use route templates rather than raw paths, SQL labels are limited to operation
type, and Redis labels contain commands but never keys. User IDs, story IDs,
Telegram data, authorization values, query strings, and request bodies are not
metric labels or structured log fields.

Production uses `PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus`; the API entrypoint
clears it before Uvicorn starts, and each scrape removes dead-worker gauge files
before aggregating all live workers. Metrics cover request latency, status,
request/response size, database query latency/errors, pool usage, Redis command
latency, Celery queue depth and task outcomes, backup age/size, host resources,
and per-container CPU and memory.

Prometheus, Grafana, and the provisioned Loci dashboard use a Compose profile
that `deploy/deploy.sh` enables when `MONITORING_ENABLED=true`. Set a strong
independent password before the first deploy:

```sh
test -n "$GRAFANA_ADMIN_PASSWORD"
docker compose --env-file .env -f docker/docker-compose.prod.yml \
  --profile monitoring up -d prometheus grafana node-exporter cadvisor
ssh -L 3001:127.0.0.1:3001 "deploy@$SERVER_HOST"
```

Open `http://127.0.0.1:3001` through the SSH tunnel. Grafana is bound only to
host loopback; Prometheus has no published port; Caddy does not route `/metrics`.
Alert rules cover scrape availability, 5xx ratio, HTTP p95 latency, database
pool saturation, Redis latency, image-queue backlog, backup freshness, and host
memory pressure. Connect an alert receiver before relying on them for paging.

PostgreSQL starts with `pg_stat_statements` preloaded, and Alembic owns the
extension. After deployment, verify collection and inspect the slowest
normalized statements without selecting query parameters from application logs:

```sh
docker compose --env-file .env -f docker/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT calls, total_exec_time, mean_exec_time, rows, query FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20"
```

The read-only k6 workload, safety guard, dataset assumptions, engineering
thresholds, cold/warm cache matrix, and evidence checklist live in
`load_tests/README.md`. Load-test numbers are measurements only when the target,
dataset, duration, concurrency, cache state, and command are recorded together.

## Object storage

Cloudflare R2 in production (zero egress fees), MinIO locally. Both are
S3-compatible; the backend uses one client with `S3_*` env config. Bucket
holds photo bytes only — metadata and moderation state live in PostgreSQL.
Presigned PUT URLs are single-key-scoped and expire in 10 minutes.
