# Loci load tests

The default suite exercises the public, read-only map browsing path. It cannot
create stories, reactions, comments, reports, or uploads. Remote targets are
rejected unless explicitly enabled.

## Map workload

- 80% map pin or low-zoom cluster requests across dense cities, global views,
  and the antimeridian
- 10% trending/search discovery
- 10% story detail when `STORY_IDS` is supplied, otherwise nearby discovery
- ramp-up, steady state, and ramp-down with warm and cold Redis cases

Engineering thresholds are p95 below 150 ms for map requests, p95 below 300 ms
for other reads, under 1% failed requests, and over 99% successful checks. These
are not user-facing SLOs and do not prove the approximately 100 ms client
interaction target.

Run locally:

```sh
docker run --rm --network host \
  -e BASE_URL=http://127.0.0.1:8000 \
  -e TARGET_VUS=50 \
  -e RAMP_UP=30s -e HOLD=3m -e RAMP_DOWN=30s \
  -v "$PWD/load_tests/k6:/scripts:ro" \
  grafana/k6:2.1.0 run /scripts/map_browse.js
```

For a staging host, add `-e ALLOW_REMOTE_LOAD_TEST=true`. Never set that flag
for production without an approved change window, current backups, dashboards
open, and rollback authority.

## Dataset and test matrix

Use the documented one-million-story benchmark dataset: 85% city-clustered,
15% uniform, 744,575 discoverable stories, 2,052,712 reactions, and 551,652
comments. Run each case for at least 15 minutes after a 5-minute warm-up:

| Case | Redis | VUs | Purpose |
|---|---|---:|---|
| Cold | flushed before run | 50 | database fallback and cache fill |
| Warm | populated | 50 | normal browsing baseline |
| Ramp | populated | 50 → 250 | saturation point and pool behavior |
| Recovery | Redis stopped | 50 | graceful degradation |

Capture k6 output, API dashboard screenshots, `pg_stat_statements`, database
plans, container CPU/memory, queue depth, and Redis latency for every run.

## Authenticated writes

Create one disposable user token and one non-owned test story ID per VU. The
workload alternates reaction and bookmark state, and deletes every comment it
creates. It stays below the configured per-user write limits and uses a unique
idempotency key for comment creation.

```sh
docker run --rm --network host \
  -e BASE_URL=http://127.0.0.1:8000 -e ALLOW_WRITES=true \
  -e TARGET_VUS=2 -e DURATION=3m \
  -e ACCESS_TOKENS=token-one,token-two \
  -e STORY_IDS=story-one,story-two \
  -v "$PWD/load_tests/k6:/scripts:ro" \
  grafana/k6:2.1.0 run /scripts/authenticated_writes.js
```

## Upload memory soak

Create one empty private story owned by each disposable token. The test sends
small valid JPEGs through the API proxy path, completes each upload, and waits
for the image queue. The five-photo product limit is enforced by the script.
Use `docker stats loci-api-1 loci-worker-1` and the Grafana container panels to
verify that API memory returns to its baseline and the image queue drains.

```sh
docker run --rm --network host \
  -e BASE_URL=http://127.0.0.1:8000 -e ALLOW_WRITES=true \
  -e TARGET_VUS=1 -e UPLOADS_PER_STORY=5 \
  -e ACCESS_TOKENS=owner-token -e STORY_IDS=empty-private-story \
  -v "$PWD/load_tests/k6:/scripts:ro" \
  grafana/k6:2.1.0 run /scripts/upload_soak.js
```

Remote runs additionally require `ALLOW_REMOTE_LOAD_TEST=true`. Use only
disposable accounts and stories, remove the test stories and their R2 objects
afterward, and never target production without a change window, verified backup,
live dashboards, and rollback authority.
