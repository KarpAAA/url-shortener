# 0007 — `POST /shorten` is not idempotent

Date: 2026-10-01 Status: accepted

## Context

When the same URL is shortened twice, the service can return the existing code or create a
new one. The brief does not say. There are no users: every link is anonymous, and its
statistics are readable by anyone who knows the code.

## Options considered

- **Deduplicate: same URL → same code.** Saves rows. Needs a definition of "same" (is
  `http://Example.com` the same as `http://example.com/`? with a trailing slash? with query
  parameters in another order?), a unique index on the URL — which at up to 2048 characters
  means indexing a hash column — and `INSERT … ON CONFLICT` to stay race-free. And it changes
  what a link _is_: every person who shortens a popular URL shares one counter, so nobody can
  measure their own campaign, and anyone can read a stranger's statistics by shortening the
  same URL.
- **A new code per request.** No definition of sameness needed. Each link has one creator
  and one counter.
- **Client-supplied `Idempotency-Key`.** Makes retries of _one_ request safe without merging
  different people's links. Worth having when a duplicate is harmful (payments). Here a
  duplicate is a spare row.

## Decision

Every successful `POST /shorten` creates a new link with a new code: `201`, always.
`POST` is documented as not idempotent in the OpenAPI description.

## Consequences

- A link's statistics count the visits of that link only — the property that makes them
  useful.
- A retried request (a client timeout after the server succeeded) leaves an unused extra
  link. Harmless: it costs about 150 bytes and is never visited.
- Storage grows with requests, not with distinct URLs. The rate limit bounds what one client
  can create ([0010](0010-rate-limiting.md)).
- If accounts are added, deduplication _per owner_ becomes meaningful and can be introduced
  as a unique index on `(owner_id, url_hash)` without changing existing links.
- Tests: the same URL shortened twice yields two codes (use case and API); 60 parallel
  requests for one URL yield 60 distinct codes and 60 rows.
