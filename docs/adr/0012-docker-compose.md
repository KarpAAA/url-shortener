# 0012 — Docker image and Compose override files

Date: 2026-10-01 Status: accepted

## Context

A reviewer must get the service running by following the README as written, on a machine
that may have nothing but Docker. The same stack is also what the schema fuzzer must run
against, and local development needs the database reachable from the host. Three uses of one
stack invite three copies of it.

## Options considered

- **One Compose file per use** (`docker-compose.yml`, `docker-compose.test.yml`, …), each
  declaring the database and the app. Copies drift: the fuzzer ends up testing a stack that
  is not the one a user runs.
- **Compose profiles** in a single file. Keeps one file, but every optional service and every
  per-use tweak of `app` (the fuzzer needs a higher rate limit) lives in it, behind flags.
- **A base file plus override files**, merged with `-f base -f override`. An override states
  only what differs.
- **Migrations**: in the app's entrypoint (simple, but replicas starting together race for
  the migration lock, and a failed migration looks like a crashing app), or as a separate
  one-off step.

## Decision

**Image** — one multi-stage `Dockerfile`:

| Stage       | Contents                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- |
| `deps`      | all dependencies; generates the Prisma client                                            |
| `migrate`   | `deps` + the migrations; runs `prisma migrate deploy`                                    |
| `build`     | compiles TypeScript                                                                      |
| `prod-deps` | production dependencies only                                                             |
| `runtime`   | `node:24-slim`, `dist/` + production `node_modules`, user `node`, liveness `HEALTHCHECK` |

No `.env` is copied in; configuration comes from the environment. `.pnpmfile.cjs` removes the
Prisma CLI peer dependency of `@prisma/client`, which pnpm would otherwise install even with
`--prod` (it pulled Prisma Studio and React, about 250 MB, into the runtime image).

**Base `docker-compose.yml`** — `postgres` (health check) → `migrate` (runs once, must
complete successfully) → `app` (health check on readiness), wired with `depends_on`
conditions. Every variable has a default, so no `.env` is needed. Postgres is not published
on the host: nothing on the host needs it, and a published 5432 collides with a local
PostgreSQL.

**Overrides**, merged over the base:

- `docker-compose.dev.yml` publishes Postgres on `127.0.0.1` for `pnpm dev`.
- `docker-compose.schemathesis.yml` adds the fuzzer, which waits for `app` to be healthy and
  reads `/docs-json`, and raises the rate limit of `app`.

The fuzzer is started with `docker compose … run --rm --build schemathesis`: Compose brings
up the dependencies, and the command exits with the fuzzer's exit code. (`up
--exit-code-from` implies `--abort-on-container-exit`, which tears the stack down the moment
the one-off `migrate` container finishes.)

## Consequences

- `docker compose up --build` is the whole setup, and it is the stack every other use runs.
- The fuzzer tests the production image, started the production way, including migrations.
- Migrations are an explicit step that can fail on its own, visibly, before any app starts —
  the same shape a deployment pipeline needs.
- Running a combination means naming two files; the README and `pnpm test:contract` spell
  the commands out.
- The runtime image is about 550 MB, of which the `node:24-slim` base is most. An Alpine or
  distroless base would be smaller; `slim` is the conventions' default (glibc, fewer
  surprises with native modules).
