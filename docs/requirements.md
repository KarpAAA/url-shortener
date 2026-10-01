# Requirements

Every requirement is verifiable and has an id. Tests are written from this list, not from
the code, and carry the id in their name (`it('R-27 250 concurrent visits …')`), so coverage
can be traced in both directions. [`traceability.md`](traceability.md) is generated from the
test names (`pnpm trace:update`); CI fails when a requirement has no test, when a test names
an unknown requirement, or when that file is stale (`pnpm trace:check`).

## Test levels

| Level            | What it answers                               | Where                                                                                  | Runs with            |
| ---------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| **unit**         | does each rule hold?                          | `src/**/*.spec.ts` — domain, use cases on fake adapters, error mapping, config, logger | `pnpm test:unit`     |
| **property**     | does it hold for _every_ input?               | `src/**/*.prop.spec.ts` (fast-check)                                                   | `pnpm test:unit`     |
| **architecture** | do the boundaries still hold?                 | `test/architecture/*.spec.ts`                                                          | `pnpm test:arch`     |
| **integration**  | does the database behave as the code assumes? | `test/**/*.int-spec.ts` — real Postgres (Testcontainers), below HTTP                   | `pnpm test:int`      |
| **API**          | does the system do it end to end?             | `test/**/*.e2e-spec.ts` — the whole app over HTTP, real Postgres                       | `pnpm test:api`      |
| **fuzz**         | is the OpenAPI schema true?                   | Schemathesis against the compose stack                                                 | `pnpm test:contract` |
| **mutation**     | do the tests actually test?                   | Stryker on `domain/` and `application/`                                                | `pnpm test:mutation` |

`pnpm test` = unit + property + architecture (no Docker). `pnpm test:e2e` = integration + API.

## Shorten — `POST /shorten`

| ID   | Requirement                                                                                                                               | Levels                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| R-01 | A valid `url` creates a short link: `201` with `code`, `shortUrl`, `originalUrl`, `createdAt`; the link starts with zero visits.          | unit, integration, API, fuzz |
| R-02 | The `201` response has `Location: /stats/{code}`.                                                                                         | API                          |
| R-03 | `url` is required and must be a non-empty string; otherwise `400 VALIDATION_FAILED` naming the field. Nothing is stored.                  | unit, API, fuzz              |
| R-04 | A field the API does not know is rejected with `400 VALIDATION_FAILED`.                                                                   | API, fuzz                    |
| R-05 | Only `http` and `https` are accepted; `javascript:`, `data:`, `file:`, `ftp:` and every other scheme → `400 INVALID_URL`.                 | unit, property, API          |
| R-06 | The URL must be absolute, written as `scheme://host`; anything else → `400 INVALID_URL`.                                                  | unit, property, API          |
| R-07 | A URL longer than 2048 characters — as sent, or after normalisation — is rejected with `400`.                                             | unit, API                    |
| R-08 | A URL with credentials (`user:pass@`) → `400 INVALID_URL`.                                                                                | unit, API                    |
| R-09 | A URL pointing to the service's own host → `400 INVALID_URL` (no redirect loops).                                                         | unit, API                    |
| R-10 | International (IDN / unicode) URLs are accepted and stored in normalised ASCII form.                                                      | unit, property, API          |
| R-11 | For any input whatsoever the URL validator either returns a value or raises `InvalidUrlError` — never anything else.                      | property                     |
| R-12 | Malformed JSON, an empty body or a non-JSON content type → `400` (`415` for an undecodable charset) — never `500`.                        | unit, API, fuzz              |
| R-13 | A body larger than 10 kB → `413` problem.                                                                                                 | unit, API                    |
| R-14 | Shortening is not idempotent: the same URL shortened again gets a new code and its own statistics.                                        | unit, API                    |
| R-15 | A code is exactly 7 base62 characters (`0-9A-Za-z`).                                                                                      | unit, property               |
| R-16 | A generated code is never a reserved word (`shorten`, `stats`, `health`, `docs`, `metrics`, in any letter case).                          | unit, property               |
| R-17 | Code uniqueness is enforced by a unique index in the database; of concurrent inserts of one code exactly one succeeds.                    | unit, integration, API       |
| R-18 | A code collision is detected by the insert (never check-then-insert) and retried with a new code; non-collision failures are not retried. | unit, property               |
| R-19 | After 5 consecutive collisions the request fails with a controlled `503` + `Retry-After`; nothing is stored.                              | unit, property, API          |
| R-20 | Round trip: for any valid URL, resolving the code returned by shorten yields the same normalised URL.                                     | property, API                |

## Redirect — `GET /:code`

| ID   | Requirement                                                                                                                                                | Levels                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| R-21 | An existing code answers `302` with `Location` = the original URL.                                                                                         | unit, integration, API           |
| R-22 | The redirect carries `Cache-Control: no-store`.                                                                                                            | API                              |
| R-23 | An unknown code → `404 LINK_NOT_FOUND` problem; nothing is created or counted.                                                                             | unit, integration, API, fuzz     |
| R-24 | A value that is not a well-formed code → `404` without querying the database.                                                                              | unit, property, API              |
| R-25 | Service routes (`/health/*`, `/docs`, `/docs-json`, `/stats/*`, `/shorten`) are never captured by `/:code`, and a reserved word is never served as a code. | API                              |
| R-26 | Every successful redirect increases `visits` by exactly one and sets `lastVisitedAt`; other links are unaffected.                                          | unit, property, integration, API |
| R-27 | N concurrent redirects of one link (N ≥ 100), also across application instances, are all counted: no lost update.                                          | integration, API                 |

## Statistics — `GET /stats/:code`

| ID   | Requirement                                                                                                                       | Levels    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-28 | `200` with `code`, `originalUrl`, `visits` (a number), `createdAt`, `lastVisitedAt` (`null`, not absent, before the first visit). | API, fuzz |
| R-29 | Reading statistics is not a visit.                                                                                                | API       |
| R-30 | An unknown or malformed code → `404 LINK_NOT_FOUND` problem.                                                                      | API       |

## Errors and HTTP semantics

| ID   | Requirement                                                                                                                         | Levels          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| R-31 | Every error is `application/problem+json` (RFC 9457) with `type`, `title`, `status`, `detail`, `instance`, `code`, `correlationId`. | unit, API, fuzz |
| R-32 | A `500` exposes no stack trace, error type, message or other internal detail.                                                       | unit, API       |
| R-33 | An unknown route answers with a `404` problem, not a framework default.                                                             | unit, API       |
| R-34 | `POST /shorten` above the rate limit → `429` problem with `Retry-After`; other endpoints are not limited.                           | API             |
| R-35 | `x-correlation-id` is accepted from the client when well-formed, generated otherwise, and returned on every response.               | API             |
| R-49 | A known path with an unsupported method → `405` problem with `Allow`; nothing changes.                                              | unit, API, fuzz |

## Contract

| ID   | Requirement                                                                                                                 | Levels |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| R-36 | `/docs` serves Swagger UI and `/docs-json` the OpenAPI document: every operation with examples and its error responses.     | API    |
| R-37 | The running service conforms to its OpenAPI document: no `500`, no undocumented status, content type, header or body shape. | fuzz   |

## Operations

| ID   | Requirement                                                                                                    | Levels           |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| R-38 | Invalid environment configuration stops the process at boot, naming every invalid key.                         | unit             |
| R-39 | `.env.example` and `.env.test` declare exactly the keys of the configuration schema.                           | unit             |
| R-40 | `GET /health/live` → `200` while the process runs; it checks nothing external.                                 | API              |
| R-41 | `GET /health/ready` → `200` when the database answers, `503` when it does not.                                 | unit, API        |
| R-42 | Logs are JSON lines with level, time, message and the request's correlation id; sensitive fields are redacted. | unit             |
| R-43 | Responses carry baseline security headers (helmet); `X-Powered-By` is absent.                                  | API              |
| R-44 | Graceful shutdown: readiness turns `503`, in-flight requests finish, then the database is disconnected.        | integration, API |
| R-45 | All migrations apply to an empty database, and the result matches the Prisma schema (no drift).                | integration      |
| R-46 | The database rejects invalid rows on its own: `CHECK` on code format, `visits >= 0`, URL length; `NOT NULL`.   | integration      |

## Architecture

| ID   | Requirement                                                                                                                                                                 | Levels       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| R-47 | Layer boundaries hold: `domain/` imports no package, `application/` no ORM or infrastructure, a module's internals are private, controllers live only in transport modules. | architecture |
| R-48 | The `api` process graph: controllers are declared only in `*HttpModule`; the core module is inert; the entrypoint module only imports.                                      | architecture |
