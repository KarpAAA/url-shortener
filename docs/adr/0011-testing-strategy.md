# 0011 — Testing strategy

Date: 2026-10-01 Status: accepted

## Context

The service is small; the risk is not in the amount of logic but in its edges: what counts as
a URL, concurrent visits, colliding codes, malformed requests, and a published contract that
may not match the behaviour. Most of the code and tests were written with an AI assistant,
which sharpens an old problem — a test derived from the code it tests proves nothing, and a
green suite says little about whether the tests would notice a bug.

## Options considered

- **Mostly unit tests with mocked repositories.** Fast, and blind to everything that matters
  here: a mock cannot violate a unique index or lose an update.
- **Mostly end-to-end tests.** Real, but slow for the combinatorics of URL validation and
  unable to force a code collision on demand.
- **Layers, each answering one question**, plus tools that check the tests and the contract
  themselves.

## Decision

Tests are written from [`requirements.md`](../requirements.md) before the code, and each
carries the requirement id in its name. A script builds
[`traceability.md`](../traceability.md) from those names and fails CI when a requirement has
no test at a level it declares.

| Level        | Tool                       | Scope                                                                                      |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| unit         | Vitest                     | domain rules as tables of cases; use cases on fake adapters; error mapping; config; logger |
| property     | fast-check                 | invariants over generated input                                                            |
| architecture | ESLint API + Nest metadata | each boundary rule fires on a bad snippet; real files pass; the module graph               |
| integration  | Vitest + Testcontainers    | real PostgreSQL below HTTP: constraints, concurrency, migrations, shutdown                 |
| API          | Supertest + Testcontainers | the whole app over HTTP, every endpoint and status                                         |
| fuzz         | Schemathesis               | the running stack against its OpenAPI document                                             |
| mutation     | Stryker                    | are the unit tests able to fail? `domain/` and `application/`                              |

Decisions inside that:

- **Real PostgreSQL wherever the database is the subject.** One container per run; a template
  database is migrated and seeded once, and each test file clones it, so files run in parallel
  with full isolation. Seed rows have fixed ids (`test/seed/ids.ts`).
- **Concurrency is tested, not argued.** 250 parallel visits through one pool and through two;
  100 parallel inserts of one code; 150 parallel HTTP redirects. These are the tests a mock
  cannot pass or fail.
- **Fakes, not mocks, for the ports** — `InMemoryLinkRepository`, `FakeCodeGenerator`,
  `FixedClock` — so use cases are tested on behaviour ("after five collisions it gives up")
  rather than on call sequences. The fake repository runs through the same contract tests as
  the Prisma adapter, so it cannot drift.
- **Properties for anything with an input space**: every generated code is 7 base62
  characters and not reserved; any string either parses as a URL or raises `InvalidUrlError`;
  a string that does not match the published pattern is never accepted; shorten → resolve
  returns the normalised URL; _k_ collisions succeed iff _k_ < 5.
- **No snapshot tests**; assertions name fields and values.
- **The contract is checked three ways**: API tests assert the OpenAPI document's structure;
  CI fails when the committed `docs/openapi.json` differs from the code; Schemathesis fuzzes
  the running service with all checks on.

### What the extra tools found

Their value is what they catch that the ordinary tests did not.

**Schemathesis** (first runs, before fixes):

| Finding                                                                                   | Fix                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| an unsupported method on a known path answered `404`                                      | `405` with `Allow`, per path                                                    |
| the request schema said `format: uri`, but the API accepts international URLs (IRIs)      | removed the format; documented the real rule                                    |
| the documented prefix pattern was stricter than the code: leading whitespace was accepted | the domain now checks the raw string against the same pattern that is published |
| a redirect was reported as "valid data rejected"                                          | declared `302` as that operation's success status                               |
| an oversized invalid body was "accepted" with `413`                                       | declared `413` as a rejection                                                   |

Nothing was fixed by disabling a check. `fuzz/schemathesis.toml` narrows two checks on two
operations to this API's documented statuses, with the reason written next to each: JSON
Schema cannot express "a valid URL that does not point to this service", so a schema-valid
body can still get the documented `400 INVALID_URL`. A hook stops the fuzzer from following
redirects to fuzzed hosts. OpenAPI links were added to the `201` response so stateful tests
reach the redirect and the statistics of links they created.

**Stryker**: the first run scored 94.6 %. All eight survivors were real gaps — error codes
and messages, which are API contract, were asserted nowhere at unit level, and one length
boundary was untested. After adding those tests: **100 %** of 149 mutants (124 killed, 25
timed out — mutations that make the code generator loop forever). No threshold is enforced
yet; the conventions' targets are 85 % for `domain/` and 70 % for `application/`.

**The shutdown test** found that keep-alive connections kept the server open past the drain
deadline; the fix sweeps idle connections during shutdown.

**A domain table case** found that the WHATWG parser accepts `http:///path` with host `path`.

Stryker's Vitest runner does not attribute tests to mutants correctly under Vitest 5 (most
mutants "survive" because the wrong tests run), so Vitest is pinned to 4.1.

## Consequences

- `pnpm test` (unit, property, architecture) needs no Docker and runs in about ten seconds;
  it is the pre-push hook. `pnpm test:e2e` needs Docker and takes about twenty seconds.
- 251 fast tests and 175 database-backed tests for three endpoints. The ratio is deliberate:
  this is where the brief says quality is judged.
- The fuzzer is randomised; a nightly CI run uses a fresh seed. A failure prints the seed and
  a `curl` reproduction.
- Not tested: behaviour under sustained load. A load test on a laptop would produce numbers
  without meaning; the approach is described in [`scaling.md`](../scaling.md).
