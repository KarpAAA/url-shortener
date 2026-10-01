# url-shortener

## Conventions

Rules in `.claude/rules/shared/` are shared across my Nest projects (symlink to
`C:\Users\ikarp\WebstormProjects\nest-conventions/rules`, created by that repo's `link.ps1` /
`link.sh`, git-ignored). Do not edit them here — tell me and I change them in the conventions
repo. Project-specific deviations go in `.claude/rules/project/` only.
Full architecture reference: `C:\Users\ikarp\WebstormProjects\nest-conventions/docs/architecture-full.md`
— read it when creating a module or unsure about a level.

## Project decisions

```
role-scope: n/a              # no users, no authentication
role-source: n/a
authz: n/a
write-forbidden-status: n/a
refresh: n/a
pii-encryption: n/a
ids: uuid7                   # primary key; `code` is a unique attribute, the public identifier
cross-module-fk: n/a         # one business module
transactions: n/a            # every write is a single atomic statement
outbox: no
queue: none
processes: api               # deviation: no worker, nothing is asynchronous
dlq: n/a
cron: none
validation: class-validator
swagger-prod: on             # deviation: public docs are a requirement of the task
async-push: n/a
logs: stdout
traces: none
metrics-endpoint: none       # deviation: logs + health only, see docs/scaling.md
tracker: none
merge: merge-commit          # single author pushes straight to `master`, no PRs
hooks: husky
```

Task-specific decisions (each has an ADR in `docs/adr/`):

```
shorten-idempotency: new-code-per-request
code: base62, length 7, crypto random, unique index, max 5 insert attempts
invalid-url-status: 400      # VALIDATION_FAILED (shape) / INVALID_URL (domain rule)
url-max-length: 2048
url-credentials: rejected
url-self-reference: rejected (host of PUBLIC_BASE_URL)
redirect: 302 + Cache-Control: no-store
create-response: 201 + body + Location: /stats/{code}
rate-limit: in-memory throttler on POST /shorten only
error-format: RFC 9457 application/problem+json + code, correlationId, errors[]
visit-counter: atomic UPDATE ... SET visits = visits + 1 in Postgres
load-test: none
```

## Stack

NestJS 11, Prisma 7 (driver adapter `pg`), PostgreSQL 18, Node 24, pnpm 10, Vitest 4.
No Redis.

## Commands

```
docker compose up --build    # postgres, migrations, api — one command
pnpm dev                     # watch (api); needs .env and a running postgres
pnpm test                    # unit + property + architecture (no Docker)
pnpm test:e2e                # int + e2e (Testcontainers)
pnpm test:mutation           # Stryker on domain/ and application/
pnpm test:contract           # Schemathesis against the compose stack
pnpm trace:update            # regenerate docs/traceability.md after adding or renaming tests
pnpm build && pnpm openapi:generate   # regenerate docs/openapi.json after a contract change
pnpm prisma migrate dev --name <verb>_<object>
pnpm db:check                # schema drift: migrated database vs schema.prisma
pnpm lint && pnpm typecheck && pnpm format:check
```

## Modules and their combinations

<!-- keep in sync with the first line of each *.module.ts -->

| Module | Folders | Level | Read/write |
| ------ | ------- | ----- | ---------- |
| links  | layered | 4     | CQS        |

## Gotchas specific to this project

- Deviations from the shared conventions are listed, with reasons and the trigger that
  reverts each, in `.claude/rules/project/deviations.md`. Read it before "fixing" one.
- `GET /:code` is a catch-all at the root. Service routes (`/health/*`, `/docs`, `/docs-json`,
  `/stats/*`, `/shorten`) are safe because a code is exactly 7 base62 characters and the 7-letter
  service words are reserved (`domain/reserved-codes.ts`). A new 7-character root route must be
  added to that list.
- The Prisma client is generated into `src/infrastructure/database/generated/` (git-ignored);
  `pnpm install` and `pnpm build` run `prisma generate`.
- Requirements live in `docs/requirements.md`; every test name carries its `R-xx` id, and
  `pnpm trace:check` fails when a requirement has no test at a level it declares.
- Pinned below latest on purpose (reasons in `docs/adr/0001`): NestJS 11, TypeScript 5.9,
  ESLint 9, Vitest 4, `@swc/core` 1.15.
- A new root route needs an `@All` fallback after it (405 + `Allow`) and, if it is 7 base62
  characters long, an entry in `domain/reserved-codes.ts`.
