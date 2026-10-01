# 0009 — Errors as RFC 9457 problem details

Date: 2026-10-01 Status: accepted

## Context

The brief asks for correct status codes and JSON error messages. A service has many places
that can fail — body parsing, validation, the domain, the database, the router, the rate
limiter — and each has its own default shape. Clients need one. The author's conventions
already define a shape (`code`, `message`, `details`, `correlationId`) and one global filter;
the task asks for the IETF standard, RFC 9457 (`application/problem+json`).

## Options considered

- **Framework defaults** (`{"statusCode":404,"message":"…","error":"Not Found"}`): different
  per source, and the body-parser's message quotes the client's input back.
- **The conventions' shape** as plain JSON: consistent, but ad hoc.
- **RFC 9457**: a standard media type and member names that generic tooling understands, and
  an explicit extension mechanism.
- **For `type`**: a URI per problem (needs a documentation page per type to dereference) or
  `about:blank` (the problem has no semantics beyond the status code).

## Decision

Every non-2xx, non-3xx response is `application/problem+json`:

| Member                        | Value                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `type`                        | `about:blank`                                                                             |
| `title`                       | the HTTP status phrase, as the RFC requires with `about:blank`                            |
| `status`                      | the status code                                                                           |
| `detail`                      | a human-readable explanation; may change                                                  |
| `instance`                    | the request path                                                                          |
| `code` _(extension)_          | stable, machine-readable: `INVALID_URL`, `LINK_NOT_FOUND`, … — **clients branch on this** |
| `correlationId` _(extension)_ | the request id, equal to the `x-correlation-id` header                                    |
| `errors` _(extension)_        | only with `VALIDATION_FAILED`: `[{ path, code, message }]`                                |

`type` stays `about:blank` because there is no registry of problem pages to point at; the
discriminator the conventions already use, `code`, travels as an extension member. This is
the conventions' format with the standard's envelope — nothing is lost.

One mechanism produces all of it: `AppExceptionFilter`, registered globally, with a pure
`mapException` function that maps **by base class** (`NotFoundError` → 404, `ConflictError` →
409, `InvalidStateError` → 422, other `DomainError` → 400, retryable `InfrastructureError` →
503 + `Retry-After`, framework exceptions by their status, everything else → 500). Modules
throw domain classes and never import an HTTP exception.

A `500`, and any framework 5xx, has a fixed `detail` ("An unexpected error occurred"). The
real error — type, message, stack — is logged at `error` under the same `correlationId`.

## Consequences

- One shape for a wrong field, an unknown link, an unknown route, a wrong method, a too-large
  body, a rate limit and a crash; clients write one error handler.
- Adding a domain error is one class; the filter does not change.
- Support can go from a client's error report to the log line through `correlationId`.
- The mapping is unit-tested exhaustively (including "a thrown string" and "`null`"), the
  `500` path is tested over HTTP with an injected failure whose secret-looking message must
  not appear in the response, and Schemathesis checks that every error the fuzzer provokes has
  the documented status, content type and body schema.
- OpenAPI documents the error responses per endpoint (a small `@ApiProblemResponse` helper),
  with examples, because the fuzzer verifies each endpoint's statuses against the schema.
