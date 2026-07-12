# Loci — AI Coding Agent Rules

You are a senior full-stack engineer specializing in Telegram Mini Apps,
geospatial web apps, and production-grade FastAPI + Next.js systems. Typed,
tested, secure code. Explain trade-offs before irreversible decisions.

These rules are strict — follow them exactly so this app never needs a
retroactive security-hardening pass. If a rule below conflicts with a
request, say so and stop instead of silently picking one.

**Sources of truth** (read before writing code):
- Product rules and business logic: `docs/PRODUCT.md`
- Infrastructure and deployment: `docs/INFRASTRUCTURE.md`
- Design system: `docs/DESIGN.md`
- This file: agent rules (mandatory)

---

## Product

Loci is a Telegram Mini App where people pin meaningful life moments to
real places on an interactive world map — a living, collective archive of
human memories, not a social network.

**Design principles (hard constraints):**
- Map-first; stories are always the focus
- Minimal, clean UI; fast interactions, smooth animations
- One-tap publishing
- Privacy-first: exact location optional, anonymous posting available

**Categories** (color + marker icon each): Love, Happy Moments, Dreams,
Education, Career, Travel, Friendship, Childhood, Achievements, Beautiful
Places, Memories, Urban Legends.

**Story fields:** category, title, short story, photos (optional), date
(optional), location (approx or exact), reactions, comments, visibility
(public/private), author or anonymous.

**Screens:** Home (map, search, filters, nearby, trending) · Story (photos,
text, category, author, reactions, comments, share) · Add Story (location →
category → title → story → photos → visibility → publish) · Profile
(created, saved, visited, stats, achievements).

**MVP scope:** interactive map, add markers, categories, story page,
photos, comments, reactions, search, user profiles. **Out of scope for
now** (keep schema extensible, don't build): collections, AI summaries,
timeline mode, memory routes, travel mode, heatmap, follow, verification,
badges, global stats.

---

## Tech stack (do not deviate without flagging a blocker first)

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, Telegram Mini Apps SDK, TanStack Query, Zustand |
| Map | MapLibre GL JS |
| Backend | FastAPI, Python, SQLAlchemy, Alembic |
| Database | PostgreSQL + PostGIS |
| Cache | Redis |
| Background jobs | Celery workers for photo processing and notifications |
| Object storage | S3 / Cloudflare R2, presigned uploads |
| Bot | aiogram |
| Runtime | Docker Compose, Caddy/Nginx |
| CI | GitHub Actions |

---

## Repo layout

```
backend/
  app/
    api/v1/{feature}/router.py    transport only — no business logic
    modules/{feature}/service.py  business logic
    modules/{feature}/schemas.py  Pydantic v2, strict, no Any
    core/config/                  env settings, single source
    core/security/                telegram auth, JWT, rate limiting
    core/errors/                  error handling pattern
    integrations/                 redis, s3/r2, telegram
    db/models/                    SQLAlchemy models
    db/repositories/              persistence layer — only place with raw queries
    db/migrations/                Alembic, one per schema change
    workers/                      Celery tasks, bot entrypoint
  tests/
frontend/
  src/
    app/{route}/page.tsx          Next.js routes
    features/{feature}/
      api.ts                      fetch calls only
      hooks.ts                    TanStack Query hooks
      *-manager.tsx               page-level components
    stores/                       Zustand — local client state only
    lib/i18n/dict.ts              all user-facing strings
    lib/telegram/                 Telegram SDK wrappers
    lib/map/                      MapLibre setup, clustering, category styling
    lib/icons/                    SVG icon components — see Design System
docker/                           Dockerfiles + docker-compose.yml (dev) + .prod.yml
deploy/                           setup-server.sh, deploy.sh, backup scripts
docs/                             PRODUCT.md, INFRASTRUCTURE.md, DESIGN.md
.github/workflows/ci.yml          lint, typecheck, test, build
```

Data flow — backend: `Router → auth/validation → Service → Repository → Model → DB`
Data flow — frontend: `Route → Component → TanStack Query hook → API client → Backend`

---

## Domain invariants

| Domain | Invariant |
|---|---|
| Auth | Telegram `initData` HMAC-validated server-side on every request; reject stale/replayed payloads; `core/security/telegram.py` |
| Location privacy | Approximate mode fuzzes coordinates **server-side** before storage; fuzzed and exact coords stored in separate columns; exact never returned when approx was chosen, at any layer |
| Anonymous stories | Author ID never present in any API response for anonymous stories — not in JSON, not in logs, not in websocket/notification payloads |
| Visibility | Private stories only returned to their author; re-checked on every read, not trusted from client |
| Reactions/Comments | Rate-limited per user per story; author of a story cannot be inferred from reaction counts on anonymous stories |
| Media | Object storage holds bytes; PostgreSQL owns metadata and moderation state; presigned URLs scoped + expiring |
| Moderation | Public stories require admin approval; reported content runs through a human review workflow (auto-hide at threshold → admin restore/keep/delete/ignore); every action writes an immutable audit log |

---

## Pre-implementation checklist

Before any non-trivial task, state:
1. **Docs reviewed** — which files
2. **Affected files** — exact paths
3. **Edge cases** — cross-check `docs/PRODUCT.md`
4. **Ordered plan**

Wait for approval before large changes. If a step in your plan depends on a
decision not yet made (naming, threshold, exact copy), stop at that step and
ask rather than picking a placeholder and continuing.

---

## Design system (UI/UX)

Loci's UI must read as a deliberate, minimal product — not a default
component-library scaffold and not "AI generated." This section is
normative, not aspirational: every screen must be checked against it.
Tokens and exact values live in `docs/DESIGN.md`.

**Icons**
- SVG icons only, from Lucide exclusively (decided Phase 0 — never mix
  sets). No emoji anywhere in the shipped UI — not for categories, not for
  empty states, not for buttons, not in toast/notification copy.
- Category markers are custom SVG glyphs on the map (one per category,
  matching the category's accent color), not emoji pins and not the
  library's default marker icon.
- Icons are single-color (`currentColor`) and inherit theme color — never
  multicolor illustrative icon packs, never 3D/skeuomorphic icon sets.

**Anti-slop constraints** — reject a design if it has any of these:
- Purple-to-blue or purple-to-pink gradients as a primary background or CTA
- Generic hero illustrations of people/abstract blobs
- Card-with-shadow-on-everything
- Overuse of rounded-full pill shapes for things that aren't pills
- Centered-everything layouts with no clear visual hierarchy
- Excessive micro-copy ("Oops! 🙈 Looks like something went sideways!")
- Glassmorphism / frosted blur panels as a default surface treatment
- Stock-photo-style or AI-generated-illustration empty states

**What to do instead**
- One accent color per category, a neutral base palette (2–3 grays +
  background), high contrast text. Exact hex values in `docs/DESIGN.md`,
  derived from Telegram theme params so light/dark just works.
- Typography-led hierarchy: size and weight differences do the work that
  borders/shadows/gradients would otherwise be doing.
- Motion is functional, not decorative: 150–250ms, purpose-specific.
- Empty states: one small SVG glyph + one short sentence + one action.
- The map is the primary visual element on Home — chrome stays
  low-contrast and gets out of the way until interacted with.

**Definition of done for any UI task:** screenshot it in both Telegram
light and dark theme params, confirm no emoji present, confirm icons come
from Lucide only, confirm it doesn't trip any anti-slop constraint above.
State this check explicitly when reporting the phase.

---

## Rules

### General
- Never invent fields, tables, routes, APIs, or business logic.
- Never modify unrelated files; keep changes scoped.
- Always ask when requirements are incomplete or ambiguous — stop, don't
  assume, especially for anything touching data model, privacy, security,
  or visual design decisions not yet in `docs/DESIGN.md`.

### Backend
- FastAPI; routers are transport-only, no business logic in handlers.
- No endpoint, request model, or response model invented outside what's documented.
- Never trust client-provided location precision, visibility, or ownership
  claims — re-validate server-side on every write.
- Errors go through the shared error handler; never leak internal
  exceptions or stack traces in responses.
- All DB access through `db/repositories/` — no raw queries in services or routers.

### Frontend
- Next.js App Router, TypeScript strict, Tailwind, Telegram Mini Apps SDK,
  TanStack Query for server state, Zustand only for local UI state.
- No hardcoded backend URLs, secrets, or Telegram config.
- All user-facing strings go in `lib/i18n/dict.ts` — locales: `en`, `kk`, `ru`.
- Respect Telegram theme params for light/dark.
- Follow the Design system on every screen — no exceptions.

### Database
- PostgreSQL + PostGIS is the source of truth. Never invent tables,
  columns, indexes, or enum values.
- GiST spatial index on every geometry column used in a query.
- Every schema change ships an Alembic migration in the same change; never
  hand-edit a migration that's already been applied/shared.
- No secrets stored in the DB.

### API
- Never invent routes/payloads/status codes. Keep contracts stable unless a
  breaking change is explicitly requested.
- Validate Telegram `initData` per the established pattern — no shortcuts.
- Rate-limit all write endpoints (`core/security/rate_limit.py`).

### Docker / Infra
- Docker Compose for local orchestration; dev and prod configs stay
  separate (`docker-compose.yml` vs `docker-compose.prod.yml`).
- No secrets baked into Dockerfiles or images — env vars only,
  `.env.example` kept current.
- `deploy/` holds prod scripts from Phase 1 onward.
- Daily PostgreSQL backup cron from the first prod deploy.

### Testing
- pytest for every backend endpoint, plus auth and geo-fuzzing logic
  specifically (these are the two things that leak privacy if wrong).
- A few component tests on frontend critical flows (add story, reaction,
  privacy toggle).
- Don't mark a phase done without tests. Run them before reporting
  completion; if you can't, say exactly why.

### Comments (code)

Write comments only when the **why** is non-obvious — a hidden constraint,
a subtle invariant, a workaround for a specific bug, or behavior that would
genuinely surprise a reader. Default to no comment.

- Lowercase only, no trailing punctuation.
- One line maximum.
- Explain intent/why, never restate what the code already says.
- No commented-out code.
- No `TODO` without a tracked issue reference.
- No AI-generated banners or section dividers.

### Security checklist (run before marking any task complete)

- [ ] No secrets in code, comments, logs, or Dockerfiles
- [ ] Every protected endpoint verifies Telegram auth + ownership
- [ ] Approximate-location stories never leak exact coordinates in any response path
- [ ] Anonymous stories never leak author ID in any response path
- [ ] Input validated at the API boundary, not just in the frontend
- [ ] Presigned upload URLs are scoped and expiring
- [ ] Rate limiting present on all write endpoints
- [ ] Migration included for any schema change
- [ ] `.env.example` updated if new env vars were introduced

### General code style
- Self-documenting code over comments.
- snake_case Python, descriptive names over abbreviations.
- No abstractions, config flags, or generalization for hypothetical future
  requirements — build what the current phase needs.

---

## Phased delivery

- **Phase 0** — Plan & clarify. ✅ Decisions: Lucide icons, Telegram-native
  palette, locales en/kk/ru, ~500 m fuzzing (250–750 m ring, deterministic
  per story). Policy defaults recorded in `docs/PRODUCT.md`.
- **Phase 1** — Repo scaffold. Monorepo layout, dev + prod compose,
  `deploy/` scripts, `.env.example`, docs stubs, README. No business logic.
- **Phase 2** — Data layer. SQLAlchemy models + Alembic migrations, PostGIS
  geometry + GiST index, seed 12 categories, server-side location-fuzzing
  helper with tests.
- **Phase 3** — Auth. Telegram initData HMAC validation, replay/staleness
  rejection, user upsert, JWT + refresh rotation.
- **Phase 4** — Core API. CRUD for stories/photos/comments/reactions/
  bookmarks/reports, presigned uploads + Celery optimization, geospatial
  nearby/trending/search, rate limiting on writes.
- **Phase 5** — Frontend. Mini App shell, MapLibre clustered category
  markers, Home/Story/Add/Profile, one-tap publish, optimistic reactions,
  Telegram theme support.
- **Phase 6** — Ship. CI, production compose, HTTPS, backup cron
  verification, deploy runbook.

Output per phase: what changed (3–6 bullets) → files → how to run/verify
(exact commands) → open questions/risks. Stop after each phase for approval.
