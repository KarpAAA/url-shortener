# What comes next

None of this is built. The service as delivered is one stateless process and one database,
and that is the right size for it. This document says how it would evolve — and, for each
step, the measurement that would justify it. A step without its trigger is over-engineering.

Where the load is: redirects. A link is created once and followed many times, so
`GET /:code` — one indexed `UPDATE … RETURNING` — is the path that matters, and every item
below either takes work off that path or adds a capability next to it.

## 1. Redirect cache

**When:** redirect p95 or database CPU is dominated by lookups, and the traffic is skewed —
a small share of links takes most visits (it always is).

Cache `code → originalUrl` in Redis, cache-aside: look up Redis, on a miss read PostgreSQL and
populate with a TTL. Links are immutable today, so invalidation is trivial; with expiry or
editing (§8), delete the key on change.

- **Stampede protection.** When a hot key expires, hundreds of requests miss at once. Use a
  per-key lock (`SET NX` with a short TTL) so one request rebuilds while the others wait
  briefly or serve the stale value, and add jitter to TTLs so keys do not expire together.
- **Negative caching.** Cache "no such code" for a short time, or scanning for codes becomes a
  free database load test. Malformed codes are already rejected before any lookup.
- **Failure mode.** Redis down means fall back to PostgreSQL, not an error.

The cache removes the _read_ from the hot path, not the write — which is why §2 comes with it.

## 2. Asynchronous, batched visit counting

**When:** the visit `UPDATE` shows up as lock waits or write latency on hot links, or table
bloat from row versions outpaces autovacuum. (Each visit writes a new row version, and visits
of one link serialise on its row lock — see [ADR 0006](adr/0006-atomic-visit-counter.md).)

Take the write off the request: the redirect increments a counter in Redis (`INCR`, or
`HINCRBY` per time bucket) or publishes a visit event to a queue, and a worker flushes
aggregated deltas into PostgreSQL every few seconds
(`UPDATE links SET visits = visits + $delta`). The flush must be idempotent and drain what it
read, so a crash loses at most one interval.

The price is stated up front: statistics become eventually consistent by the flush interval,
and exactness now depends on the flush job. This is also the moment the service gets a second
process (`worker`) — the conventions' `api` + `worker` split, with the consumer in its own
transport module.

## 3. Click events table

**When:** the product needs more than a total — clicks over time, by referrer, country or
device.

An append-only `click_events` table (`link_id`, `occurred_at`, `referrer`, `country`,
`user_agent` family), written by the worker from the same events as §2. Created as
`PARTITION BY RANGE (occurred_at)` in the migration that introduces it — partitioning an
empty table is free; partitioning a table with a few hundred million rows is downtime.
Retention is `DROP PARTITION`, not `DELETE`: instant, no bloat. A job creates partitions
ahead of time and fails loudly if it did not.

IP addresses and raw user agents are personal data: store derived fields (country, device
class), not the raw values, and decide retention before the first row.

## 4. Read replica and connection pooling

**When:** statistics or analytics reads compete with redirects for the primary; or the number
of application instances × pool size approaches `max_connections`.

- **Read replica** for `GET /stats` and analytics. The code already separates the handles:
  repositories use `DB_WRITE`, query services use `DB_READ`. Pointing `DB_READ` at a replica
  is a change in `infrastructure/database`. Replication lag then shows in `/stats`, and the
  body returned by `POST /shorten` must be read from the primary.
- **PgBouncer** in transaction mode from about the third instance. Nothing in the code uses
  session state (no session `SET`, no session advisory locks, no `LISTEN`), so it is
  configuration only.

## 5. Distributed rate limiting

**When:** the second application replica — the in-memory limiter then allows the quota once
per replica ([ADR 0010](adr/0010-rate-limiting.md)).

Move the limiter's storage to Redis and key by client: API key when there is authentication,
IP otherwise. Add a separate, much higher limit on redirects per IP to slow code scanning,
and consider doing all of it at the edge (CDN / API gateway) so abusive traffic never reaches
the application.

## 6. Analytics as a separate service

**When:** reporting queries (time series, top referrers, exports) are heavy enough to affect
redirect latency, or analytics gets its own team and release cadence.

A service that consumes visit events and maintains its own read model — a columnar store such
as ClickHouse, or rollup tables — and serves the reporting API. The shortener keeps doing two
things: create links, redirect. The contract between them is the event, versioned. Projections
must be rebuildable from the event log, because they will drift.

## 7. Observability

**When:** before the first production incident — in practice, with the first real deployment.
It is absent here only because the brief's scope is the API.

- **Metrics** (RED): request rate, error rate and duration per route pattern; database query
  duration; pool saturation; event-loop lag. On a separate port or behind an internal guard.
- **Traces**: OpenTelemetry with auto-instrumentation for HTTP and `pg`, one span per use
  case. The correlation id in the logs becomes the trace id.
- **An SLO on the product's one promise**: e.g. 99.9 % of redirects answered in under 50 ms
  at p95, with alerts on error-budget burn rather than on CPU.
- **Alerts on symptoms**: 5xx rate, redirect p95, readiness failing, the flush job of §2
  falling behind.
- **Load tests** (k6): a smoke test in CI and a soak test against a production-like
  environment — 90 % redirects, 10 % creates — with thresholds on p95 and error rate. Run
  where the numbers mean something, not on a laptop.

## 8. Product features

Each is a requirement first; listed here because each touches a decision already made.

- **Link expiry** — `expires_at`; an expired code answers `410 Gone`. The redirect statement
  gains `AND (expires_at IS NULL OR expires_at > now())`; a job deletes or archives expired
  rows; the cache TTL of §1 must not outlive the expiry.
- **Custom aliases** — a user-chosen code. Needs its own format rules, the reserved-word list
  (already there), profanity and trademark handling, and a `409` when taken — the unique
  index and `ShortCodeTakenError` already exist.
- **Authentication and ownership** — API keys or accounts. This is when `Actor`, policies and
  guards from the conventions come in ([ADR 0003](adr/0003-architecture.md)): statistics
  become private to the owner, deletion becomes possible, limits become per client, and
  per-owner deduplication becomes meaningful ([ADR 0007](adr/0007-shorten-idempotency.md)).
- **Phishing and malware protection** — check destinations against a reputation service
  (Google Safe Browsing or similar) at creation, asynchronously re-check popular links, and
  show an interstitial or disable a link when flagged. An open redirector without this is
  abused within days of being public.

## 9. Sharding

**When:** the `links` table and its write rate exceed what one primary can hold with
headroom — on the order of billions of rows and tens of thousands of writes per second, and
only after §1, §2 and §4 are in place. Most services never get here.

Shard by code: `hash(code) mod N` picks the shard, and since every operation is keyed by code,
no query crosses shards. Codes are random, so shards fill evenly without a directory. Code
uniqueness stays local to a shard, because a code always maps to the same one. What it costs:
resharding (use consistent hashing or a fixed number of logical shards from the start), no
cross-shard queries (analytics must come from §6), and operational weight. A distributed SQL
database is the alternative to doing it by hand.

Before any of that, the cheap moves: one more character in the code (62× the space), archive
links that were never visited, and move click history out of the primary (§3, §6).
