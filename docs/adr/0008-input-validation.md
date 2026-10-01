# 0008 — Input validation and rejected URLs

Date: 2026-10-01 Status: accepted

## Context

The service stores a URL supplied by an anonymous client and later sends other people to it.
That makes the URL the whole attack surface: a redirector that accepts anything is a tool for
script injection (`javascript:`), local file access (`file:`), phishing
(`https://bank.com@evil.example`) and redirect loops (a short link pointing at a short link).
The brief requires malformed URLs and missing fields to be rejected with a clear error.

## Options considered

- **Where the rules live.** A validator decorator on the DTO (`@IsUrl()`) is the shortest
  path, but it puts a business rule into the HTTP layer, makes it unreachable for non-HTTP
  callers, and `@IsUrl`'s notion of a URL is not the one browsers use. The conventions split
  it: the DTO checks _shape_ (can be decided from the JSON alone), the domain checks _rules_.
- **How to parse.** A regular expression is either too strict or too lenient and always
  disagrees with browsers somewhere. The WHATWG URL parser (`new URL`) is the one browsers
  implement, so "valid" means "a browser will navigate to it" — but it is lenient in ways that
  are surprising for an API (`http:example.com` parses).
- **Status code.** `400` for everything, or `422` for a well-formed request with an
  unacceptable URL.
- **Unknown fields.** Ignore or reject.

## Decision

**Shape — `ShortenUrlDto` + the global `ValidationPipe`** → `400 VALIDATION_FAILED` with an
`errors[]` entry per field: `url` is required, a string, non-empty, at most 2048 characters;
any unknown field is rejected (`whitelist` + `forbidNonWhitelisted`). A silently dropped
field hides a client bug; a loud `400` surfaces it on the first request.

**Rules — `OriginalUrl.parse` in the domain** → `400 INVALID_URL`:

| Rule                                                    | Why                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| parses with the WHATWG URL parser                       | "valid" means what a browser means                                                                                        |
| scheme is `http` or `https`                             | `javascript:`, `data:`, `vbscript:` execute; `file:` reads local files; nothing else is a web link                        |
| written as `scheme://host…` (checked on the raw string) | the parser alone accepts `http:example.com`, `http:\\host`, `http:///path`, and leading whitespace                        |
| no user name or password                                | `https://bank.com@evil.example` is a phishing classic; and a password would be stored in clear text and shown by `/stats` |
| host is not this service's own host                     | a short link to a short link is a loop or a chain                                                                         |
| at most 2048 characters, before and after normalisation | bounded storage and headers; percent-encoding can triple a string                                                         |

The stored value is the parser's normalised `href`: lower-cased scheme and host, punycode for
international host names, percent-encoded path and query. So the `Location` header is always
ASCII and is exactly what the parser understood — nothing a client typed is echoed into a
header verbatim. International URLs are accepted, not rejected.

Destinations on private networks (`localhost`, `10.0.0.0/8`) are **allowed**: the service
never fetches the URL, so there is no SSRF; whether a redirect to an intranet address is
useful is the visitor's business.

**Status: `400` for both kinds**, distinguished by `code`. In the conventions' error mapping
`422` means "this action is not possible in the resource's current state"; a URL the service
will never accept is a bad request, and the brief's wording ("reject malformed URLs … with a
clear error") fits `400`.

**Short codes** in paths are validated in the domain too, and a malformed code is a `404`
([0004](0004-short-code-generation.md)).

**Transport**: bodies over 10 kB → `413`; unparseable JSON → `400 MALFORMED_JSON` with a fixed
message (the parser's own message, which quotes the input, is not echoed).

## Consequences

- The rules are plain functions, tested with a table of 60+ cases and with properties: for
  any string — and any non-string — the validator returns a value or raises `InvalidUrlError`,
  never anything else; whatever it accepts is an absolute http(s) URL without credentials.
- The published request schema carries the same prefix pattern the domain enforces, so a
  string that does not match the documented pattern is always rejected. The converse cannot
  hold — JSON Schema cannot express "a valid URL that is not ours" — and the schema says so.
- Phishing and malware destinations are not detected; that needs a reputation service
  ([`scaling.md`](../scaling.md)).
- Normalisation means the returned `originalUrl` may differ in spelling from what was sent
  (`HTTP://Example.COM` → `http://example.com/`). It is the same URL.
