# Loci

[![CI](https://github.com/anxchywl/Loci/actions/workflows/ci.yml/badge.svg)](https://github.com/anxchywl/Loci/actions/workflows/ci.yml)

Pin meaningful life moments to real places on a shared world map.

**Live:** [loci.anxchywl.dev](https://loci.anxchywl.dev) · **Telegram:** [@loci_app_bot](https://t.me/loci_app_bot)

Loci (the plural of the Latin *locus*, "place") is a Telegram Mini App that also
runs in any browser. People drop a story on the map, optionally with photos, and
others discover it by place. It is a collective archive of memories, not a social
network.

## Features

- Interactive globe with clustered, category-coloured markers
- Stories with photos, a date, and one of twelve categories
- Public or private stories, signed or anonymous, exact or approximate location
- Discovery by map viewport, nearby radius, trending, and search
- Reactions, comments, bookmarks, and reporting
- Sign in with Telegram, Google, or email
- English, Kazakh, and Russian, with Telegram-native light and dark themes
- Admin panel: review queue, reported content, user management, audit log

## Privacy by design

- Approximate locations are fuzzed on the server before they are stored; the
  exact point is never returned.
- Anonymous stories never expose the author in any response.
- Private stories are returned only to their author, checked on every read.
- Every public story and every photo is approved by a human before it appears.

## Stack

| Area | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind, TanStack Query, Zustand |
| Map | MapLibre GL JS, OpenFreeMap tiles |
| Backend | FastAPI, Pydantic v2, SQLAlchemy, Alembic |
| Data | PostgreSQL + PostGIS, Redis |
| Media | S3-compatible storage (Cloudflare R2 in production, MinIO locally) |
| Workers | Celery (photo processing, notifications), aiogram bot |
| Ops | Docker Compose, Caddy, GitHub Actions |

## Quickstart

You need Docker with Docker Compose.

```sh
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:8000 (health at `/health`) |
| MinIO console | http://localhost:9001 |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6380` |

To run the app inside Telegram, create a bot with
[@BotFather](https://t.me/BotFather) and set its token and Mini App URL in `.env`.

## Development

Backend (Python 3.12 and [`uv`](https://docs.astral.sh/uv/)):

```sh
cd backend
uv sync --extra dev
uv run ruff check .
uv run pytest
```

Frontend (Node.js 22):

```sh
cd frontend
npm ci
npm run typecheck
npm run lint
npm test
```

## Project layout

```text
backend/    FastAPI API, services, repositories, models, migrations, workers
frontend/   Next.js app, MapLibre UI, i18n
docker/     Dockerfiles and Compose files (dev and production)
deploy/     Server setup, deploy, backup, and restore scripts
docs/       Product, infrastructure, and design documentation
```

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md): product rules, privacy invariants, moderation, API contract
- [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md): environment, deployment, backups, recovery
- [docs/DESIGN.md](docs/DESIGN.md): visual system and UI constraints
- [AGENTS.md](AGENTS.md): engineering conventions for this repository

## Contributing

Issues and pull requests are welcome. Run the backend and frontend checks above
before opening a pull request, follow the conventions in [AGENTS.md](AGENTS.md),
and describe any user-facing, migration, or configuration impact.
