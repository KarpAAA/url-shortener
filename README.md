# URL shortener

[![CI](https://github.com/KarpAAA/url-shortener/actions/workflows/ci.yml/badge.svg)](https://github.com/KarpAAA/url-shortener/actions/workflows/ci.yml)

A small REST API that shortens URLs, built the way a small production service would be:
NestJS 11, Prisma 7, PostgreSQL 18, Node 24.

| Method | Endpoint       | Behaviour                                                                     |
| ------ | -------------- | ----------------------------------------------------------------------------- |
| `POST` | `/shorten`     | Accepts `{ "url": "…" }`, returns a 7-character code and the short URL. `201` |
| `GET`  | `/:code`       | Redirects to the original URL and counts the visit. `302`                     |
| `GET`  | `/stats/:code` | Returns how many times the short link has been visited. `200`                 |

Plus `GET /docs` (Swagger UI), `GET /docs-json` (OpenAPI), `GET /health/live`,
`GET /health/ready`.

## Run it

Requires **Docker** with Compose v2 (Docker Desktop, or Docker Engine 24+). Nothing else.

```bash
git clone https://github.com/KarpAAA/url-shortener.git
cd url-shortener
docker compose up --build
```

This starts PostgreSQL, applies the database migrations as a separate one-off step, and then
starts the API on <http://localhost:3000>. No `.env` file is needed. When the log shows
`api listening`, try it from another terminal.

If port 3000 is taken: `APP_PORT=8080 PUBLIC_BASE_URL=http://localhost:8080 docker compose up --build`.

### Try it

Shorten a URL:

```bash
curl -i -X POST http://localhost:3000/shorten \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/some/very/long/path?utm_source=newsletter"}'
```

```http
HTTP/1.1 201 Created
Location: /stats/IxQP4Yk
Content-Type: application/json; charset=utf-8

{"code":"IxQP4Yk","shortUrl":"http://localhost:3000/IxQP4Yk","originalUrl":"https://example.com/some/very/long/path?utm_source=newsletter","createdAt":"2026-10-01T14:43:20.689Z"}
```

Your `code` will differ — it is random. Use it in the next two requests (replace `IxQP4Yk`).
Other response headers (security headers, `x-correlation-id`) are omitted here.

Follow the short link:

```bash
curl -i http://localhost:3000/IxQP4Yk
```

```http
HTTP/1.1 302 Found
Cache-Control: no-store
Location: https://example.com/some/very/long/path?utm_source=newsletter
```

Read its statistics:

```bash
curl http://localhost:3000/stats/IxQP4Yk
```

```json
{
  "code": "IxQP4Yk",
  "originalUrl": "https://example.com/some/very/long/path?utm_source=newsletter",
  "visits": 1,
  "createdAt": "2026-10-01T14:43:20.689Z",
  "lastVisitedAt": "2026-10-01T14:43:20.874Z"
}
```

Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem documents
(`Content-Type: application/problem+json`). A URL with a scheme that is not allowed:

```bash
curl -X POST http://localhost:3000/shorten \
  -H 'Content-Type: application/json' \
  -d '{"url":"ftp://example.com/file"}'
```

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "URL scheme must be http or https",
  "instance": "/shorten",
  "code": "INVALID_URL",
  "correlationId": "01a0f7eb-7f13-71f2-99f1-a6096e67b233"
}
```

A missing field:

```bash
curl -X POST http://localhost:3000/shorten -H 'Content-Type: application/json' -d '{}'
```

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed",
  "instance": "/shorten",
  "code": "VALIDATION_FAILED",
  "correlationId": "01a0f7eb-7f41-71c6-87e3-a4f6b792e149",
  "errors": [
    {
      "path": "url",
      "code": "maxLength",
      "message": "url must be shorter than or equal to 2048 characters"
    },
    { "path": "url", "code": "isNotEmpty", "message": "url should not be empty" },
    { "path": "url", "code": "isString", "message": "url must be a string" }
  ]
}
```

A code that does not exist:

```bash
curl http://localhost:3000/stats/nope123
```

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Short link not found",
  "instance": "/stats/nope123",
  "code": "LINK_NOT_FOUND",
  "correlationId": "01a0f7eb-7f72-71e0-955d-96ad06bd7c2c"
}
```

`correlationId` is different on every request. Clients branch on `code`; `detail` is for humans.

The full contract, with every status code and example, is at <http://localhost:3000/docs>.

Stop and remove everything, including the database volume:

```bash
docker compose down -v
```

## Develop locally

Requires **Node 24** (`.nvmrc`), **pnpm 10** (`corepack enable`) and Docker.

```bash
pnpm install                 # also generates the Prisma client
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
pnpm db:migrate              # apply migrations to the local database
pnpm dev                     # http://localhost:3000, restarts on change
```

`docker-compose.dev.yml` only publishes Postgres on `127.0.0.1:5432`; the base file keeps the
database private to the compose network.

| Command                                              | What it does                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | ESLint (incl. layer boundaries and import order), Prettier, `tsc` |
| `pnpm build`                                         | compile to `dist/`                                                |
| `pnpm db:migrate`                                    | apply migrations (`prisma migrate deploy`)                        |
| `pnpm db:check`                                      | fail if the database differs from `schema.prisma`                 |
| `pnpm prisma migrate dev --name <verb>_<object>`     | create a migration                                                |
| `pnpm openapi:generate` / `pnpm openapi:check`       | write / verify `docs/openapi.json` (after `pnpm build`)           |
| `pnpm trace:update` / `pnpm trace:check`             | write / verify `docs/traceability.md`                             |

Git hooks (husky): `pre-commit` formats and lints staged files, `commit-msg` enforces
Conventional Commits, `pre-push` runs typecheck and the fast tests. CI repeats all of it.

## Tests

Every test name starts with the id of the requirement it verifies
([`docs/requirements.md`](docs/requirements.md) → [`docs/traceability.md`](docs/traceability.md)).

| Command              | Level                          | Needs Docker | What it covers                                                                                                                         |
| -------------------- | ------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`          | unit + property + architecture | no           | everything below that needs no database, ~10 s                                                                                         |
| `pnpm test:unit`     | unit + property                | no           | URL and code rules (table-driven + fast-check), use cases on fake adapters, error mapping, config, logger                              |
| `pnpm test:arch`     | architecture                   | no           | each layer-boundary lint rule proven to fire; the Nest module graph                                                                    |
| `pnpm test:e2e`      | integration + API              | yes          | both suites below                                                                                                                      |
| `pnpm test:int`      | integration                    | yes          | real Postgres below HTTP: unique index, `CHECK` constraints, 250 concurrent visits, migrations from scratch + drift, graceful shutdown |
| `pnpm test:api`      | API                            | yes          | the whole app over HTTP: every endpoint, status code and header                                                                        |
| `pnpm test:contract` | schema fuzzing                 | yes          | Schemathesis against the compose stack                                                                                                 |
| `pnpm test:mutation` | mutation                       | no           | Stryker on `domain/` and `application/`                                                                                                |

Integration and API tests start one PostgreSQL container (Testcontainers), migrate a template
database once, and give every test file its own clone of it — files run in parallel and never
share state.

### Schema fuzzing (Schemathesis)

```bash
docker compose -f docker-compose.yml -f docker-compose.schemathesis.yml run --rm --build schemathesis
docker compose -f docker-compose.yml -f docker-compose.schemathesis.yml down -v
```

`docker-compose.schemathesis.yml` does not repeat the stack: Compose merges it over the base
file, adding the fuzzer container and raising the rate limit of `app`. The fuzzer waits for
`app` to be healthy, reads the live contract from `/docs-json`, sends ~1 900 generated
requests (valid, invalid, and stateful sequences that follow a created link to its redirect
and statistics) and checks every response against the schema with all checks enabled. The
exit code of the command is the result of the run. A clean run ends with two warnings: most
generated codes are well-formed but were never issued, so those requests answer `404`.

What it found while this service was built, and what was fixed — never by disabling a check:
unsupported methods answered `404` instead of `405` + `Allow`; the request schema claimed
`format: uri` while the API accepts international URLs; the URL prefix rule was looser in the
code than in the schema (leading whitespace was accepted). Details:
[ADR 0011](docs/adr/0011-testing-strategy.md).

### Mutation testing (Stryker)

```bash
pnpm test:mutation           # report: reports/mutation/index.html
```

Current score: **100 %** — 149 mutants in `domain/` and `application/`, 124 killed, 25 timed
out (a mutation that turns the code generator into an endless loop), 0 survived. The first
run scored 94.6 %; the eight survivors were missing tests (error codes and messages that are
API contract, one length boundary) and are now covered. No threshold is enforced yet; CI
publishes the report as an artifact.

## Documentation

- [`docs/requirements.md`](docs/requirements.md) — numbered, testable requirements and the test level of each
- [`docs/traceability.md`](docs/traceability.md) — requirement → tests, generated
- [`docs/architecture.md`](docs/architecture.md) — the system end to end: layers, request flows, data model, errors, operations, tests, delivery
- [`docs/adr/`](docs/adr) — architecture decision records
- [`docs/scaling.md`](docs/scaling.md) — what would come next, and when
- [`docs/openapi.json`](docs/openapi.json) — the contract; CI fails when it differs from the code

## Design decisions

- **302, never 301, with `Cache-Control: no-store`.** Browsers cache a 301 indefinitely; repeat
  visits would never reach the server and the statistics would lie. [ADR 0005](docs/adr/0005-redirect-302-no-store.md)
- **Codes are 7 random base62 characters from a CSPRNG**, not a counter or Sqids: sequential
  codes let anyone enumerate every link. Uniqueness is decided by the database's unique index —
  insert, catch the violation, retry up to 5 times. Never check-then-insert. [ADR 0004](docs/adr/0004-short-code-generation.md)
- **The visit counter is one atomic `UPDATE … SET visits = visits + 1 … RETURNING`.** No
  read-modify-write, so concurrent visits cannot be lost; a test with 250 parallel visits
  through two connection pools proves it. [ADR 0006](docs/adr/0006-atomic-visit-counter.md)
- **`POST /shorten` is not idempotent.** With no users, deduplicating by URL would merge
  strangers' statistics and let anyone read them. [ADR 0007](docs/adr/0007-shorten-idempotency.md)
- **URL validation is a domain rule**, not a regex in a DTO: only `http`/`https`, no
  credentials, no links back to this service, stored in normalised form. [ADR 0008](docs/adr/0008-input-validation.md)
- **One error format**, RFC 9457 `application/problem+json`, produced by a single global
  filter; a `500` never carries internals. [ADR 0009](docs/adr/0009-error-format-rfc9457.md)
- **A malformed code is a `404`**, decided before the database is asked; service routes can
  never be shadowed by a code. [ADR 0004](docs/adr/0004-short-code-generation.md)
- **Rate limiting is in-memory and only on `POST /shorten`.** Redis for one counter on one
  instance would be over-engineering. [ADR 0010](docs/adr/0010-rate-limiting.md)
- **Layered module with a framework-free domain**, boundaries enforced by lint and proven by
  tests. What was deliberately _not_ built — auth, queues, a worker process, metrics — and
  why: [ADR 0003](docs/adr/0003-architecture.md)
- **The OpenAPI schema is verified, not trusted**: fuzzed in CI and diffed against a committed
  copy. [ADR 0011](docs/adr/0011-testing-strategy.md)
- **Migrations run as their own step**, never in the app's entrypoint. Compose files extend one
  base file instead of duplicating it. [ADR 0012](docs/adr/0012-docker-compose.md)

All records: [stack](docs/adr/0001-language-framework-package-manager.md) ·
[database and ORM](docs/adr/0002-database-and-orm.md) · [CI](docs/adr/0013-ci.md).

## What I'd do at scale

Described, not built — each with the signal that would trigger it. Full version:
[`docs/scaling.md`](docs/scaling.md).

- **Redirect cache** (Redis, cache-aside, stampede protection) when redirect p95 or database
  CPU is driven by lookups of a few hot links.
- **Asynchronous, batched visit counting** through a queue when row contention on hot links
  shows up in the write latency.
- **A click-events table** (referrer, country, user agent), partitioned by time, with
  retention by dropping partitions, when per-click analytics is a requirement.
- **A read replica** for statistics and **PgBouncer** from the third application instance.
- **Rate limiting per client / API key in Redis** as soon as there is a second replica.
- **Analytics as a separate service** with its own read model when reporting queries start
  competing with redirects.
- **Observability**: OpenTelemetry traces, RED metrics, an SLO on redirect p95.
- **Product features**: link expiry, custom aliases, authentication, phishing protection.
- **Sharding by code** at a data volume a single primary can no longer hold.
