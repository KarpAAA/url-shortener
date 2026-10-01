# 0004 — Random base62 codes, uniqueness decided by the database

Date: 2026-10-01 Status: accepted

## Context

A short code is the public identifier of a link and, with no authentication, the only thing
protecting it: whoever knows a code can follow the link and read its statistics. Codes must be
short, URL-safe, unique, and must not collide with the service's own routes, which share the
root path with `GET /:code`.

## Options considered

1. **A counter encoded in base62** (`1`, `2`, … → `1`, `2`, …, `1C`). Shortest possible, no
   collisions by construction. But the codes are sequential: anyone can enumerate every link
   ever created, read all statistics, and see how many links exist and how fast they are
   created.
2. **Sqids / Hashids over a counter.** Looks random, still collision-free. It is an encoding,
   not encryption: the alphabet shuffle is recoverable from a handful of consecutive codes,
   after which the sequence is enumerable again. It obscures; it does not protect.
3. **A hash of the URL.** Makes shortening idempotent — which is not wanted
   ([0007](0007-shorten-idempotency.md)) — and still needs collision handling.
4. **Random codes from a CSPRNG.** Unpredictable; one code says nothing about another.
   Collisions are possible and must be handled.

For collision handling: **check-then-insert** (`SELECT` the code, insert if absent) has a
race — two requests can both see "free" and both insert. **Insert and catch the unique
violation** has none: the index is the single arbiter.

## Decision

- **Alphabet**: base62, `0-9A-Za-z`. No `-` or `_`, so a code is one unbroken token when
  double-clicked, and no service route containing a dash can look like a code.
- **Length**: 7, fixed. 62⁷ = 3 521 614 606 208 ≈ 3.5 × 10¹² codes, 41.7 bits.
- **Source**: `crypto.randomInt(62)` per character. It is uniform (it rejects and redraws
  rather than taking a modulo), so no character is favoured.
- **Uniqueness**: a `UNIQUE` index on `code`. The use case inserts; on a unique violation the
  repository raises `ShortCodeTakenError` and the use case draws a new code. **At most 5
  attempts**, then a controlled `503` with `Retry-After`. There is no check before the insert.
- **Reserved words**: `shorten`, `stats`, `health`, `docs`, `metrics`, case-insensitively.
  Only `shorten` and `metrics` are 7 characters and could actually be generated; the rest are
  listed so the rule survives a change of length. The generator redraws on a reserved word,
  and `ShortCode.parse` rejects one in a request.
- **A malformed code is `404`, not `400`**: a string that could never have been issued
  identifies no link. The format is checked in the domain, so the database is not queried.
- The database repeats the format as a `CHECK` constraint.

How rare is a collision? With _n_ links stored, one insert collides with probability
_n_ / 62⁷:

| Links stored | Collision per insert | Five in a row |
| ------------ | -------------------- | ------------- |
| 1 million    | 2.8 × 10⁻⁷           | 1.9 × 10⁻³³   |
| 1 billion    | 2.8 × 10⁻⁴           | 1.8 × 10⁻¹⁸   |
| 100 billion  | 2.8 × 10⁻²           | 1.8 × 10⁻⁸    |

By the birthday bound the first collision is expected after roughly 2.3 million links — it
_will_ happen, which is exactly why it is handled rather than assumed away. Five consecutive
collisions indicate a fault (a broken random source), not bad luck; hence a `503`, not a loop.

How hard is guessing? A random guess hits an existing link with probability _n_ / 62⁷: with
one million links, one request in 3.5 million. The rate limit does not cover redirects, so at
scale this is addressed at the edge, not by the code ([`scaling.md`](../scaling.md)).

## Consequences

- Links cannot be enumerated, and the creation rate is not observable from outside.
- One extra index lookup is not needed: the insert _is_ the uniqueness check.
- At a few percent of the code space in use, retries become measurable; the remedy is one
  more character (62× the space), which changes `CODE_LENGTH` and the `CHECK` constraint and
  leaves existing 7-character codes valid if the pattern accepts both lengths.
- Tested at every level: properties (every generated code is 7 base62 characters and never
  reserved), use-case tests with a scripted generator (1–4 collisions succeed, 5 fail,
  non-collision errors are not retried), 100 concurrent inserts of one code against real
  PostgreSQL (exactly one wins), and a `503` over HTTP.
