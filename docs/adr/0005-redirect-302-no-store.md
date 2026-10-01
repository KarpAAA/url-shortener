# 0005 — Redirect with 302 and `Cache-Control: no-store`

Date: 2026-10-01 Status: accepted

## Context

The brief allows `301` or `302` for `GET /:code` and also requires a visit counter. Those two
requirements interact: a redirect the browser caches never reaches the server again.

## Options considered

- **301 Moved Permanently.** Cacheable by default, and browsers cache it aggressively and
  without expiry. After the first visit, the same browser goes straight to the destination;
  the server sees one visit however many times the link is used. A cached 301 also cannot be
  taken back — a link could never be disabled or re-pointed for clients that have seen it.
- **308 Permanent Redirect.** Same caching, plus method preservation that is irrelevant here.
- **302 Found.** Not cacheable unless a response header says so.
- **307 Temporary Redirect.** Like 302 but preserves the method; only `GET` and `HEAD` reach
  this endpoint, so there is nothing to preserve, and 302 is what the brief names.
- **302 without cache headers** leaves room for heuristics in intermediaries.

## Decision

`302 Found` with `Cache-Control: no-store`. `no-store` is the default for every response of
the API (set in the correlation middleware), so the redirect, the statistics and every error
are all uncached.

## Consequences

- Every visit reaches the server and is counted; statistics mean what they say.
- A link can later be expired, disabled or re-pointed and the change takes effect at once.
- Every visit costs a request and a database write. That is the load profile the service is
  designed around ([0006](0006-atomic-visit-counter.md)); when it becomes too much, the answer
  is a cache in front of the lookup and asynchronous counting, not a cacheable redirect
  ([`scaling.md`](../scaling.md)).
- `HEAD /:code` is answered like `GET` and counts as a visit. Link-preview bots therefore
  inflate the count; telling people from bots is an analytics feature, out of scope.
