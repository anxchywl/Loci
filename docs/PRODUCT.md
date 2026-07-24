# Loci — Product Rules & Business Logic

Loci is a Telegram Mini App where people pin meaningful life moments to
real places on an interactive world map — a living, collective archive of
human memories, not a social network.

## Design principles (hard constraints)

- Map-first; stories are always the focus
- Minimal, clean UI; fast interactions, smooth animations
- One-tap publishing
- Privacy-first: exact location optional, anonymous posting available

## Categories

Twelve fixed categories, seeded in the database (Phase 2). Accent colors and
marker glyphs are defined in [DESIGN.md](DESIGN.md).

Love · Happy Moments · Dreams · Education · Career · Travel · Friendship ·
Childhood · Achievements · Beautiful Places · Memories · Urban Legends

## Story fields

category, title, short story, photos (optional), date (optional), location
(approx or exact), reactions, comments, visibility (public/private), author
or anonymous.

## Screens

- **Home** — map, search, filters, nearby, trending
- **Story** — photos, text, category, author, reactions, comments, share
- **Add Story** — location → category → title → story → photos → visibility → publish
- **Profile** — created, saved, visited, stats, achievements

## MVP scope

In: interactive map, add markers, categories, story page, photos, comments,
reactions, search, user profiles, report path.

Out (keep schema extensible, don't build): collections, AI summaries,
timeline mode, memory routes, travel mode, heatmap, follow, verification,
badges, global stats.

## Domain invariants

| Domain | Invariant |
|---|---|
| Auth | Telegram `initData` HMAC-validated server-side on every request; reject stale/replayed payloads; `core/security/telegram.py` |
| Location privacy | Approximate mode fuzzes coordinates **server-side** before storage; fuzzed and exact coords stored in separate columns; exact never returned when approx was chosen, at any layer |
| Anonymous stories | Author ID never present in any API response for anonymous stories — not in JSON, not in logs, not in websocket/notification payloads |
| Visibility | Private stories only returned to their author; re-checked on every read, not trusted from client |
| Reactions/Comments | Rate-limited per user per story; author of a story cannot be inferred from reaction counts on anonymous stories |
| Media | Object storage holds bytes; PostgreSQL owns metadata and moderation state; presigned URLs scoped + expiring |
| Moderation | Every story/comment has a report path; public stories require admin approval, and reported content goes through a human review workflow (see below). Every moderation action writes an immutable audit log |

## Policy decisions (approved 2026-07-10)

### Location fuzzing

- Approximate mode: random offset within a **250–750 m ring** around the
  exact point, computed server-side before storage.
- Deterministic per (story ID, exact point): the offset is derived from
  HMAC-SHA256 keyed by `LOCATION_FUZZ_SECRET`, so the marker never drifts
  between requests **and** repeated precision toggles yield the same single
  sample — averaging re-fuzzes can't converge on the exact point.
  Implementation: `backend/app/core/security/geo.py`.
- Exact and fuzzed coordinates live in separate columns; when the author
  chose approximate, the exact column is never serialized in any response,
  log, or payload.

### Photos

- Max **5 photos per story**, max **10 MB per file** before processing.
- Accepted upload types: JPEG, PNG, WebP, HEIC.
- Async re-encode after upload (Celery): WebP, max edge 2048 px, plus a
  thumbnail; originals are not served.
- Presigned PUT URLs: scoped to a single object key, expire in **10 minutes**.
- Presigned GET URLs are cached server-side (Redis, 80% of their validity) so
  repeat story views hand the browser the same URL and images stay
  browser-cacheable; a client always receives a URL with ≥20% lifetime left.
- The completion endpoint checks the stored object size before queueing work;
  files over 10 MB are deleted and marked failed. The worker decodes the bytes
  (including HEIC) before producing served WebP variants.
- Pending or failed photo uploads older than **24 hours** are deleted from
  object storage and PostgreSQL by the daily maintenance worker. Ready photos
  are never eligible for this cleanup.

### Moderation

- Every public story is **pending** on creation and is only discoverable after an
  admin approves it. Private ("only me") stories skip review. Admins approve or
  reject from the review queue; rejection carries a private reason shown only to
  the author.
- `reports` exist for stories and comments. **One report per user per target**
  (partial unique index); duplicates are silently ignored; self-reports don't
  count.
- **Reported-content workflow** — reports inform, admins decide:

  ```text
  Visible → Reported → Auto-hidden (threshold reached) → Admin review
                                                          ↙          ↘
                                                      Restore       Delete
  ```

  At **5 distinct non-author reporters** a story is auto-hidden (`is_hidden`,
  `auto_hidden_at`) and surfaces in the admin **Reported** queue — never
  auto-deleted. An admin reviews the full report timeline (reporter, reason,
  time) and resolves it: **restore** (unhide + resolve reports + notify author),
  **keep hidden**, **delete** (remove + notify; report reasons snapshotted into
  the audit log so history survives the cascade), or **ignore** (dismiss the
  reports, leave visibility unchanged).
- Reports carry a resolution state (`pending → reviewed → resolved`) with
  `resolved_by`, `resolution_action`, and `resolved_at`. Moderation history is
  never lost — resolved reports persist, and deletes are preserved in the audit
  log.
- **Abuse protection**: one report per user per story, per-day report rate limit,
  duplicate reports ignored, and a logged brigading signal when a story draws a
  burst of reports in a short window. Reporter counting is the extension point
  for future trust/reputation weighting (today every distinct reporter counts as
  one).
- **Notifications** (best-effort Telegram): the author is told when their story is
  auto-hidden pending review, restored, or removed after review.
- **Dashboard analytics**: pending reports, auto-hidden stories, resolved reports,
  deleted/restored after review, average review time, and most-reported
  categories.

### Rate limits (per user, Redis-backed)

| Action | Limit |
|---|---|
| Auth (per IP, transport-level) | 10 / min |
| Create story | 10 / day |
| Update, resubmit, or delete story | 30 / min |
| Comment | 10 / min |
| Delete comment | 30 / min |
| Reaction | 30 / min |
| Report | 20 / day |
| Request upload URL | 20 / hour |
| Erase account | 3 / hour |

### Auth thresholds

- `initData` with `auth_date` older than **300 s** rejected (same bound the
  `wished` production config enforces).
- Replayed `initData` hashes rejected via Redis guard.
- JWT: access **15 min**, refresh **30 days** with rotation.

### Account and identity model (Phase 1 onward)

- The permanent account is the **Loci user** (`users.id`). An **authentication
  provider is not the account**: Telegram, Google, and email are separate login
  methods that unlock the same user.
- `auth_identities` holds one row per linked method. Identity keys, enforced in
  PostgreSQL: Telegram and email key on the verified subject; Google keys on
  `(issuer, sub)` — **never on email**, which is verified metadata only. A user
  holds at most one identity per provider.
- Phase 1 is additive: every existing user keeps `users.id` and all content, and
  gains one backfilled Telegram identity. `users.telegram_id` is nullable
  compatibility data for Telegram notifications and administration, not an
  account key; deleting an identity never deletes the user.
- Admin is the provider-independent `users.is_admin` flag (authoritative from
  Phase 2); the first admin is bootstrapped from `INITIAL_ADMIN_TELEGRAM_ID`.

### Account erasure (approved 2026-07-24)

- Account erasure is self-service from account settings. It is immediate and
  irreversible, requires a recently authenticated session, and requires the
  exact confirmation phrase `DELETE MY ACCOUNT`.
- Erasure removes the user's stories and photos, comments, reactions,
  bookmarks, reports, authentication identities, password credential, email
  challenges, sessions, security events, and profile/provider identifiers.
- PostgreSQL records each photo object in a durable deletion queue in the same
  transaction that removes its story metadata. Object-storage deletion is
  retried until successful; an unavailable worker cannot lose the cleanup job.
- A disabled, non-identifying user tombstone remains only where required by the
  immutable moderation/audit history. Self-erased accounts cannot be restored.

### Reactions (decided 2026-07-10)

- Single reaction kind, `heart`; tap to toggle. One reaction per user per
  story (`(story_id, user_id)` primary key).
- The `type` column exists with default `'heart'` so adding kinds later is
  a data change, not a migration.

### Text limits (decided 2026-07-10)

- Story title ≤ **120** chars, body ≤ **4000** chars — enforced at the API
  boundary (Phase 4); DB columns are `text`, so limits can change without a
  migration.

### Localization

- Locales: `en`, `kk`, `ru` (Kazakh uses ISO 639-1 code `kk`).
- Auto-selected from Telegram `language_code`, falling back to `en`.

## API contract (grows per phase; never extended without documenting here first)

### Auth (Phase 3)

| Route | Behavior |
|---|---|
| `GET /api/v1/auth/providers` | Public capability discovery. Returns which optional browser sign-in methods are enabled so unavailable providers are not rendered |
| `POST /api/v1/auth/telegram` | Body `{init_data}`. HMAC-validates, rejects stale (>300 s), future-dated, and replayed payloads; upserts the user from the Telegram payload; returns access JWT + user, sets httpOnly `refresh_token` cookie scoped to `/api/v1/auth` |
| `POST /api/v1/auth/refresh` | Requires the double-submit CSRF header/cookie pair. Rotates the refresh token from the cookie: old one revoked, new one issued. Revoked/expired/unknown tokens → 401 and cookies cleared. Replay of a rotated token revokes the whole session family |
| `POST /api/v1/auth/logout` | Requires the double-submit CSRF header/cookie pair. Revokes the cookie's refresh token, clears the auth cookies, 204 |
| `GET /api/v1/auth/google/start?redirect=<path>` | OIDC login start. Server-generated state + nonce + PKCE (S256) stored in Redis (single-use, 10 min); returns `{authorization_url}`. `redirect` must be an app-relative path (open-redirect safe). 404 when Google is not configured |
| `GET /api/v1/auth/google/callback?code&state[&error]` | Backend code exchange, id_token verified via Google JWKS (signature, `iss`, `aud`, `azp`, `exp`, `iat`, `nonce`); identity keyed on **(issuer, sub)**, never email; `email_verified` gates stored email. Resolves or creates the Loci user, sets the `refresh_token` cookie, 303-redirects to the app. Cancel/error/invalid state → redirect without a session |

Google login resolves through `auth_identities` to a `users.id`; a new Google user
is a Telegram-less account. The access token is not carried in the redirect — the
frontend restores it from the refresh cookie via `/auth/refresh`, the same path as
a restored Telegram session.

The authorization page opens in the current browser or Telegram WebView context.
Opening it in a separate system browser would place the httpOnly session cookie in
a different cookie jar and strand the Mini App. A future external-browser flow
requires a separate single-use session handoff; no token is placed in a URL as a
shortcut.

| Route | Behavior |
|---|---|
| `POST /api/v1/auth/email/register` | Body `{email, password}`. Argon2id, ≥12 chars, no composition rules; optional HIBP screen (fail-open). Creates a **pending** challenge (no user yet) and emails a keyed-HMAC 6-digit code. Always returns a generic 202 (anti-enumeration); already-registered addresses get no code |
| `POST /api/v1/auth/email/resend` | Reissues the code (invalidating the prior one) under a cooldown + hourly limit; generic 202 |
| `POST /api/v1/auth/email/verify` | Body `{email, code}`. Attempt-limited, single-use; on success creates the user + email identity + credential in one transaction and issues a session (refresh cookie + access token). Generic 401 on bad/expired code |
| `POST /api/v1/auth/email/login` | Body `{email, password}`. Generic 401 for unknown email or wrong password (identical response); rehashes on Argon2 parameter change; rate-limited by IP and normalized email |
| `POST /api/v1/auth/password/reset/request` | Body `{email}`. Always generic 202; sends a reset code only if an eligible account exists; never reveals which provider an account uses |
| `POST /api/v1/auth/password/reset/confirm` | Body `{email, code, new_password}`. Single-use code; sets the new password, **revokes all sessions**, emails a change notice, no auto-login (204) |

Email is the login identifier only for the email provider; identities are keyed on
the normalized (trim + lowercase) address. Codes are stored only as a keyed HMAC,
never plaintext, and never written to production logs. Abandoned registrations
create no permanent user.

| Route | Behavior |
|---|---|
| `GET /api/v1/auth/identities` | Authenticated. Lists linked sign-in methods (provider + optional email + timestamps); never exposes provider subjects/secrets |
| `DELETE /api/v1/auth/identities/{provider}` | Authenticated + **recent-auth**. Unlinks a method; refuses to remove the last usable one (400); audited. Email unlink also drops the password credential |
| `GET /api/v1/auth/google/link/start?redirect=<path>` | Authenticated + recent-auth. Starts a Google link (transaction carries `link_user_id`); the shared callback attaches the identity to the current account and never issues a new session. Rejects a Google identity already owned by another account |
| `POST /api/v1/auth/identities/email/start` | Authenticated + recent-auth. Body `{email, password}`; sends a `link_email` code. Rejects an address already in use |
| `POST /api/v1/auth/identities/email/verify` | Authenticated. Body `{email, code}`; attaches the email identity + password credential; audited |
| `GET /api/v1/auth/sessions` | Authenticated. Lists the account's sessions (current flagged; device metadata; no raw IP) |
| `DELETE /api/v1/auth/sessions/{session_id}` | Authenticated. Revokes one session (own only; 404 otherwise); evicts its cache; audited |
| `POST /api/v1/auth/logout-all` | Authenticated. Revokes every session, clears the cookie; audited |
| `DELETE /api/v1/auth/account` | Authenticated + **recent-auth**, rate-limited. Body `{confirmation: "DELETE MY ACCOUNT"}`. Irreversibly erases account content, interactions, provider/profile data, and sessions; queues photo-object deletion; clears auth cookies; returns 204 |

Linking only ever attaches a provider to the already-authenticated `users.id` — it
never merges accounts and never links by matching email. Link/unlink and
logout-everywhere write immutable `security_audit_events`; self-service account
erasure removes those account-scoped events under the approved erasure policy.
Sensitive actions require
a **recent authentication** (the session authenticated within
`RECENT_AUTH_WINDOW_MINUTES`), distinct from an ordinary token refresh.

Protected endpoints (Phase 4+) authenticate via `Authorization: Bearer <access>`
resolved by `app/api/deps.py:get_current_user`. Public reads accept an optional
bearer token (`get_optional_user`) — a bad token is rejected, not ignored.

### Core API (Phase 4)

Write endpoints are rate-limited per user (table above). Story/comment reads
re-check visibility on the server for every request.

| Route | Behavior |
|---|---|
| `GET /api/v1/categories` | 12 seeded categories with slug/color/icon/position |
| `POST /api/v1/stories` | Create; validates category, title ≤120, body ≤4000, lat/lon ranges; approx mode fuzzes server-side before the point is readable; enforces 10/day. An optional `Idempotency-Key` makes safe client retries return the original story. |
| `GET /api/v1/stories/{id}` | Story with author (null when anonymous), public point only, counts, viewer flags, ready photos via presigned GETs |
| `DELETE /api/v1/stories/{id}` | Author only; cascades photos/comments/reactions/bookmarks/reports |
| `GET /api/v1/stories/nearby?lat&lon&radius_meters&category_id&limit` | Geography-cast `ST_DWithin` (metric, antimeridian-safe), ordered by distance |
| `GET /api/v1/stories/bbox?min_lat&min_lon&max_lat&max_lon&category_id&limit` | Viewport query with full story payloads (used by list panels). Longitudes accept world-wrapped values; viewports crossing the antimeridian are handled |
| `GET /api/v1/stories/map?min_lat&min_lon&max_lat&max_lon&category_id&limit` | Slim marker payload for map rendering: `[{id, category_id, lat, lon}]`, discoverable stories only, `limit` ≤ 500 (default 300), antimeridian-safe (added 2026-07-12) |
| `GET /api/v1/stories/map-clusters?min_lat&min_lon&max_lat&max_lon&zoom&category_id` | Low-zoom grid aggregation: `[{lat, lon, count}]` per occupied cell (zoom 0–10). Redis-cached 60 s per quantized viewport and generation-invalidated after visibility or moderation changes (added 2026-07-12) |
| `GET /api/v1/stories/trending?limit` | Ordered by reactions+comments, then recency |
| `GET /api/v1/stories/search?q&limit` | ILIKE over title+body; respects visibility |
| `GET/POST /api/v1/stories/{id}/comments` | List (hidden excluded) / create (≤1000 chars). An optional `Idempotency-Key` makes safe client retries return the original comment. |
| `DELETE /api/v1/comments/{id}` | Comment author only |
| `POST/DELETE /api/v1/stories/{id}/reactions` | Idempotent heart toggle |
| `POST/DELETE /api/v1/stories/{id}/bookmark` | Idempotent bookmark toggle |
| `POST /api/v1/stories/{id}/report`, `POST /api/v1/comments/{id}/report` | One report per user per target; auto-hide at threshold of distinct non-author reporters |
| `POST /api/v1/stories/{id}/photos` | Author only; ≤5 photos; returns single-key presigned PUT (10 min) |
| `PUT /api/v1/stories/{id}/photos/{photo_id}/upload` | Backend proxy fallback when the direct presigned PUT can't reach storage; stores the raw bytes |
| `POST /api/v1/stories/{id}/photos/{photo_id}/complete` | Author confirms upload; API size-checks and queues Celery validation + WebP re-encode (2048 px + thumb); invalid files are marked failed and never surface; original deleted after success |
| `DELETE /api/v1/stories/{id}/photos/{photo_id}` | Author only; deletes pending or ready photo metadata, every owned storage object, and cached presigned URLs. Replacement is delete followed by a new upload, which creates a new photo ID and browser-cache identity. |
| `GET /api/v1/profile/me` · `/me/stories` · `/me/bookmarks` | Own profile; own list includes anonymous stories (only there) |

Admin-only (`is_admin`), all writing an immutable audit log:

| Route | Behavior |
|---|---|
| `GET /api/v1/admin/dashboard` | User + moderation + report analytics for a date range |
| `GET /api/v1/admin/moderation/queue` · `POST .../{id}/approve` · `.../{id}/reject` | Cursor-paginated review queue; atomic status transitions (409 on double-moderate) |
| `GET /api/v1/admin/reports` | Reported-story queue; search, filter (all/pending/hidden/visible/resolved), sort (reports/newest/auto-hidden), pagination |
| `GET /api/v1/admin/reports/{id}` | One story with its full report timeline (reporter, reason, state, resolution) |
| `POST /api/v1/admin/reports/{id}/resolve` | `{action: restore\|keep_hidden\|delete\|ignore, reason?}`; resolves reports + records outcome |
| `GET /api/v1/admin/users` · `.../{id}` · block/unblock/warn/delete/restore · `.../{id}/stories` | User management with per-user story + report history |
| `GET /api/v1/admin/audit-logs` | Immutable moderation history |

## Edge cases (grows as phases land)

- A user switches a story from exact to approximate: the exact column must
  be re-fuzzed and the previously public exact point treated as compromised
  (no re-publishing it later).
- Anonymous story by a user who later deletes their account: story remains,
  still unlinkable.
- Reports by the story's own author don't count toward auto-hide.
- Stories at the antimeridian / poles: geometry queries must not assume a
  simple bounding box.
