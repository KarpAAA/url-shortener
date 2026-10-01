# 0002 — PostgreSQL 18 and Prisma 7

Date: 2026-10-01 Status: accepted

## Context

The brief allows any real store: Postgres, MySQL, MongoDB or SQLite. The data is one table.
The two properties the service depends on are both database guarantees: a short code must be
unique even when two requests race for it, and a visit counter must not lose updates under
concurrency.

## Options considered

- **PostgreSQL** — unique indexes, `UPDATE … RETURNING` (find, increment and read in one
  statement), `CHECK` constraints, `timestamptz`. Runs identically in Docker, in CI and in
  Testcontainers.
- **SQLite** — no server to run, which makes "get it running" trivial, but it is a single
  writer; a test of concurrent increments would prove little about a real deployment, and the
  service could never have a second instance.
- **MongoDB** — `$inc` is atomic and a unique index exists, so it would work; it brings
  nothing a relational table does not, and gives up constraints and migrations.
- **ORM: Prisma** — typed queries, migrations as reviewable SQL files, and the default of the
  conventions. **TypeORM / Drizzle / raw `pg`** would also do for one table; Prisma's
  `select`-typed results and `migrate diff` (schema drift detection) are what tip it.

## Decision

**PostgreSQL 18** and **Prisma 7.10** with the `pg` driver adapter.

- The schema changes only through migrations (`prisma migrate`). `db push` and any kind of
  schema auto-sync are not used.
- `CHECK` constraints are written by hand in the migration SQL — Prisma cannot express them.
- One Prisma client per process, exposed as two handles, `DB_WRITE` and `DB_READ`, that are the
  same object today.
- The pool size is explicit configuration (`DATABASE_POOL_SIZE`); `statement_timeout` is 30 s.
- Prisma types stay inside `infrastructure/` and `read/`; the domain and the use cases never
  see them (lint-enforced).

Prisma 8 exists only as a release candidate (npm's `latest` tag points at `8.0.0-rc`), so the
stable 7.10 line is pinned.

## Consequences

- Uniqueness and counting are correct by construction of the SQL, not by application logic
  ([0004](0004-short-code-generation.md), [0006](0006-atomic-visit-counter.md)).
- CI applies every migration to an empty database and fails on drift between the database
  and `schema.prisma`.
- Running the service needs a PostgreSQL server; Docker Compose provides it with one command.
- The Prisma client is generated code (`src/infrastructure/database/generated`, git-ignored);
  `pnpm install` and `pnpm build` generate it.
