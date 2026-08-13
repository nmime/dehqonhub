# @app/frontend-api-client

## Purpose

Wraps generated admin, auth, and user clients with typed service registries,
Better Auth and Telegram helpers, and frontend toast-rule integration.

With `loadProblemPresentationOverrides`, `ApiClientProvider` refreshes the
authenticated tenant's endpoint-response presentation overrides from
`/auth/problem-presentations`. The deployable web apps enable this outside test
mode. Loading is best-effort: request failures never block application rendering
and leave the OpenAPI-generated defaults active. `apiToastRuleCatalog()` exposes
the generated admin catalog without duplicating endpoint strings in application
code.

The rule sets (`adminApiToastRules()`, `authApiToastRules()`,
`userApiToastRules()`) and the catalog are read through a call, not exported as
arrays. Each parses on first use and caches. The indirection is what lets a
bundler drop the generated config an app never reads — around 420 kB of admin
rules in the case of the user marketplace — so keep the JSON referenced only from
inside these function bodies, and keep `apiToastRuleCatalog()`, the only reader of
all three configs, in `toast-rule-catalog.ts` away from the per-app rule sets.
`docs/frontend-deployment-topology.md` records the measurements and the check.

## Commands

```bash
pnpm exec nx run @app/frontend-api-client:build
pnpm exec nx run @app/frontend-api-client:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
- [Frontend FSD](../../../../docs/frontend-fsd.md)
