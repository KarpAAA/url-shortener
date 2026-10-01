## Why

<!-- the problem or requirement, one paragraph; ticket link -->

## What

<!-- decisions, not files: "expired links now answer 410" -->

-

## How to verify

<!-- commands / steps a reviewer runs; for API changes an example request and response -->

## Notes

<!-- migration and its expand/contract phase · new config keys · follow-ups · known gaps -->

## Checklist

- [ ] migration SQL reviewed; destructive changes are two-phase
- [ ] new env keys in `env.schema.ts`, `.env.example` and `.env.test`
- [ ] requirement added to `docs/requirements.md`; tests written from it, not from the code
- [ ] every new endpoint has e2e tests for its success and each documented error status
- [ ] `docs/openapi.json` regenerated (`pnpm build && pnpm openapi:generate`)
- [ ] project decisions in `CLAUDE.md` respected or updated
