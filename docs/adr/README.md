# Architecture decision records

One file per decision: context, the options considered, the decision, its consequences.

| #                                                  | Decision                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| [0001](0001-language-framework-package-manager.md) | TypeScript, NestJS 11, Node 24, pnpm                                        |
| [0002](0002-database-and-orm.md)                   | PostgreSQL 18 and Prisma 7                                                  |
| [0003](0003-architecture.md)                       | Layered module with a framework-free domain; what was deliberately left out |
| [0004](0004-short-code-generation.md)              | Random base62 codes, uniqueness decided by the database                     |
| [0005](0005-redirect-302-no-store.md)              | Redirect with 302 and `Cache-Control: no-store`                             |
| [0006](0006-atomic-visit-counter.md)               | Atomic visit counter in PostgreSQL                                          |
| [0007](0007-shorten-idempotency.md)                | `POST /shorten` is not idempotent                                           |
| [0008](0008-input-validation.md)                   | Input validation and rejected URLs                                          |
| [0009](0009-error-format-rfc9457.md)               | Errors as RFC 9457 problem details                                          |
| [0010](0010-rate-limiting.md)                      | In-memory rate limiting on link creation                                    |
| [0011](0011-testing-strategy.md)                   | Testing strategy                                                            |
| [0012](0012-docker-compose.md)                     | Docker image and Compose override files                                     |
| [0013](0013-ci.md)                                 | Continuous integration                                                      |
