# Loci

Loci — the plural of the Latin *locus*, meaning “place” — is a Telegram Mini App
for pinning meaningful life moments to real places on a shared world map. It is
map-first, privacy-first, and built as a production-grade FastAPI + Next.js
monorepo.

People drop a story on the map, optionally with photos, and others discover it by
place. Stories can be public or private, signed or anonymous, and every public
story passes through human moderation before it appears.

## Features

**For everyone**
- Interactive world map with clustered markers and category filters (MapLibre GL)
- Publish a story at a place, with up to several photos, a date, and a category
- Public or private ("only me") visibility, and optional anonymous authorship
- Discover by viewport, nearby radius, trending, and full-text search (PostGIS)
- Comments, reactions, and bookmarks on approved stories
- Report abusive content; one report per person per story
- Trilingual UI — English, Kazakh, Russian — with Telegram-native light/dark theming

**For moderators (admin panel)**
- Review queue: approve or reject pending stories with a reason
- Reported-content workflow: stories that cross the report threshold are
  auto-hidden (never silently deleted) and queued for human review with the full
  report timeline — restore, keep hidden, delete, or dismiss the reports
- User management: search, block, warn, delete/restore, per-user story history
- Dashboard analytics: users, moderation throughput, and report metrics
  (pending, auto-hidden, resolved, average review time, most-reported categories)
- Immutable audit log of every moderation action

## What makes it different

- Server-validated Telegram `initData` with stale/replay protection
- Optional anonymous stories with author IDs stripped from public responses
- Server-side approximate-location fuzzing before coordinates are ever stored
- Public/private and moderation visibility checks on every read path
- Resilient photo uploads: direct-to-storage presigned PUT with an automatic,
  invisible backend-proxy fallback, then async WebP optimization
- Human-in-the-loop moderation — reports inform, admins decide; nothing is
  auto-deleted
- Prometheus metrics and structured logging for the upload and moderation paths

## Stack

| Area | Technology |
|---|---|
| Frontend | Next.js App Router, TypeScript, Tailwind, TanStack Query, Zustand |
| Mini App | Telegram Web App SDK, aiogram bot launcher |
| Map | MapLibre GL JS, OpenFreeMap tiles |
| Backend | FastAPI, Pydantic v2, SQLAlchemy, Alembic |
| Data | PostgreSQL, PostGIS, Redis |
| Media | S3-compatible storage — Cloudflare R2 in production, MinIO locally |
| Workers | Celery for photo processing and notifications |
| Ops | Docker Compose, Caddy, GitHub Actions |

## Repository layout

```text
backend/    FastAPI API, domain services, repositories, models, migrations
frontend/   Next.js Mini App, MapLibre UI, Telegram/i18n/client state
docker/     Dev and production Compose files plus Dockerfiles
deploy/     Server setup, deploy, backup, restore, verification scripts
docs/       Product, infrastructure, and design source-of-truth docs
```

Backend flow: `router → service → repository → model → database`.
Frontend flow: `route → manager component → query hook → API client`.

## Quickstart

Requirements:

- Docker + Docker Compose
- Node.js 22 — for frontend checks outside Docker
- Python 3.12 + [`uv`](https://docs.astral.sh/uv/) — for backend checks outside Docker

Run the full local stack:

```sh
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

Local services:

```text
Web:           http://localhost:3000
API:           http://localhost:8000
Health:        http://localhost:8000/health
Metrics:       http://localhost:8000/metrics
MinIO console: http://localhost:9001
Postgres:      localhost:5433
Redis:         localhost:6380
```

To exercise the app inside Telegram you need a bot from
[@BotFather](https://t.me/BotFather); set its token and Mini App URL in `.env`.
See [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) for the full environment
reference.

Run backend checks:

```sh
cd backend
uv sync --extra dev
uv run ruff check .
uv run alembic upgrade head   # against a local Postgres
uv run pytest
```

Run frontend checks:

```sh
cd frontend
npm ci
npm run typecheck
npm run lint
npm run build
```

## Production

Production runs on Docker Compose behind Caddy (automatic HTTPS), with
PostgreSQL/PostGIS, Redis, Celery workers, Cloudflare R2-compatible object
storage, and daily verified PostgreSQL backups. Database migrations run with
Alembic on deploy.

The deployment runbook — environment, secrets, backups, and recovery — is in
[docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md). Never deploy with the
development secrets from `.env.example`.

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md) — product rules, privacy invariants, moderation workflow, API contract
- [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) — environment, deployment, backups, recovery
- [docs/DESIGN.md](docs/DESIGN.md) — visual system, category colors, UI constraints
- [AGENTS.md](AGENTS.md) — engineering conventions and guardrails for this repository

## Contributing

Issues and pull requests are welcome. Before opening a PR, run the backend and
frontend checks above and keep changes consistent with the conventions in
[AGENTS.md](AGENTS.md). Please describe user-facing changes and any migration or
configuration impact in the PR.
