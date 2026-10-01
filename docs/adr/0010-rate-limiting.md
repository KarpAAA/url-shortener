# 0010 — In-memory rate limiting on link creation

Date: 2026-10-01 Status: accepted

## Context

`POST /shorten` is anonymous and writes a row per request. Unlimited, it is a way to fill the
database and to mass-produce redirect links for spam. The author's conventions require a rate
limiter backed by Redis, because an in-memory limiter counts per instance and is bypassed by
scaling out. This service runs as one instance and has no Redis.

## Options considered

- **No limit in the service**; leave it to an API gateway or CDN. Correct at scale, but then
  the repository as delivered has an open write endpoint.
- **In-memory limiter** (`@nestjs/throttler`, default storage). No new dependency; exact for
  one instance; counters are lost on restart and not shared between replicas.
- **Redis-backed limiter**. Correct for many replicas. Adds a second stateful service, its
  health check, its failure mode ("Redis is down — do we block or allow?") and its
  configuration, to protect one endpoint of a single-instance service. That is
  over-engineering here.
- **A PostgreSQL-backed limiter**. Shared without Redis, but puts a write on every request.

## Decision

`@nestjs/throttler` with in-memory storage, applied to **`POST /shorten` only**:

- 30 requests per 60 seconds per client IP by default (`SHORTEN_RATE_LIMIT`,
  `SHORTEN_RATE_TTL_SECONDS`).
- Over the limit → `429` problem (`code: RATE_LIMITED`) with `Retry-After`.
- The limit counts attempts, valid or not — an invalid request still costs the server work.
- Redirects and statistics are not limited: they are the product, they are reads (plus one
  atomic increment), and a shared office IP must not be locked out of following links.
- `TRUST_PROXY_HOPS` tells Express how many reverse proxies are in front, so the limiter keys
  on the real client address rather than on the load balancer's.

## Consequences

- The endpoint is protected in the deployment the repository actually ships (one instance).
- It stops being correct with a second replica: each would allow the full quota. The trigger
  and the replacement (Redis, keyed by client or API key) are in [`scaling.md`](../scaling.md);
  the change is the storage option of one module.
- An IP is a weak identity (NAT, mobile carriers). Per-client limits need authentication,
  which is out of scope.
- The schema fuzzer sends thousands of `POST /shorten` from one address, so its Compose
  override raises the limit for that run; the `429` path is covered by an API test with the
  limit set to 3.
