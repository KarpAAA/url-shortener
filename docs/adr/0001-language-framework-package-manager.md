# 0001 — TypeScript, NestJS 11, Node 24, pnpm

Date: 2026-10-01 Status: accepted

## Context

The service is a small REST API that must read as a production service: validated input,
consistent errors, an OpenAPI contract, tests at several levels. The author maintains a set of
NestJS conventions (structure, layering, testing, lint rules with ready-made templates), and
the brief asks for the code to be organised "the way you would for a small production service".

## Options considered

- **NestJS** — module system, dependency injection, a single pipeline for validation and
  errors, first-class OpenAPI generation. The conventions, the ESLint boundary rules and the
  architecture-test templates are written for it.
- **Express or Fastify without a framework** — less code for three endpoints, but the frame
  (validation pipe, exception filter, OpenAPI, DI for test doubles) would be hand-built, and
  that frame is most of what the brief evaluates.
- **NestJS 12 vs 11.** NestJS 12 is the current major and is ESM-only; npm tags 11.x `legacy`.
  The conventions and their templates target the CommonJS line (Nest 11, ESLint 9 with
  `eslint-plugin-boundaries` 5).
- **pnpm vs npm.** pnpm is what the conventions prescribe: a strict `node_modules` layout
  (no phantom dependencies) and a content-addressed store that makes CI installs fast.

## Decision

TypeScript 5.9 in strict mode (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`), **NestJS 11.2** on Express 5,
**Node 24 LTS**, **pnpm 10**. Exact versions are pinned in `package.json`, the lockfile,
`.nvmrc` and `engines`.

Version choices that are not "the latest", and why:

| Package     | Pinned | Latest | Reason                                                                                                                      |
| ----------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| NestJS      | 11.2   | 12.1   | 12 is ESM-only; moving is a migration of the build, the test runner setup and the conventions templates, not a version bump |
| TypeScript  | 5.9    | 7.0    | `typescript-eslint` supports `< 6.1`; type-aware lint rules are part of the quality gate                                    |
| ESLint      | 9      | 10     | `eslint-plugin-import` supports up to 9; the boundary rules use the `boundaries` 5 API                                      |
| Vitest      | 4.1    | 5.0    | under Vitest 5, Stryker's runner attributes tests to mutants incorrectly ([0011](0011-testing-strategy.md))                 |
| `@swc/core` | 1.15   | 1.16   | 1.16 fails to load its native binding on the development machine (cache-directory ACL check on Windows)                     |

## Consequences

- The conventions' ESLint config and architecture tests are reproduced as-is; layering is
  enforced mechanically from the first commit.
- The stack is one major behind on NestJS. Dependabot is told to ignore those majors so the
  upgrade happens as a deliberate change, not a surprise pull request.
- `pnpm` installs resolved peer dependencies even with `--prod`; `.pnpmfile.cjs` drops the
  Prisma CLI peer of `@prisma/client` to keep the runtime image small ([0012](0012-docker-compose.md)).
