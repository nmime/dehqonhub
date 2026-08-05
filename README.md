<a id="readme-top"></a>

<div align="center">

# AgroUz — AgriTech Platform for Uzbekistan

**B2B marketplace connecting farmers, input suppliers, and produce buyers — with field operations, fulfillment, payments, and pilot governance in one tenant-isolated platform.**

<img alt="Node.js 24" src="https://img.shields.io/badge/Node.js-24.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
<img alt="pnpm 11.15.1" src="https://img.shields.io/badge/pnpm-11.15.1-F69220?style=for-the-badge&logo=pnpm&logoColor=white" />
<img alt="Tests 340+" src="https://img.shields.io/badge/tests-340%2B%20passing-22c55e?style=for-the-badge" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
<a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/License-MIT-0EA5E9?style=for-the-badge" /></a>

[Quick start](#quick-start) · [Product](#what-it-does) · [Architecture](#architecture) · [Testing](#testing) · [Documentation](#documentation)

</div>

## The problem

Uzbekistan's agricultural input trade is 93% offline. Farmers buy fertilizer, seed, and pesticides through informal credit (*nasia*) from local dealers; produce aggregation runs through phone calls and middlemen. Existing platforms focus on state cotton/wheat clusters — smallholders in the Fergana Valley, horticulture, and private trade are underserved.

## What it does

| Actor | Journey |
| --- | --- |
| **Farmer** | Verified profile → produce listings with grade and availability → source-attributed agronomy/weather advisories → order and delivery visibility |
| **Supplier** | Organization application → approval → localized input catalog (UZ/RU/EN) → stock and price maintenance |
| **Buyer** | Organization application → approval → produce discovery → regional price statistics → atomic quantity reservation → payment handoff (Click / Payme) |
| **Field agent** | Assigned farmer list → field-visit observations with quality grading → delivery transitions with proof-of-delivery |
| **Operator** | Partner and farmer approval → agent assignment → advisory publication → delivery scheduling → pilot lifecycle → analytics and integration readiness |
| **Telegram user** | Linked-identity localized notifications and Mini App entry |

## Architecture

Nx monorepo, strict TypeScript, DDD feature slices:

```
apps/
  backend/user/user-app-api      Farmer/supplier/buyer/agent API (NestJS + Fastify)
  backend/admin/admin-app-api    Operator API with RBAC
  frontend/app                   User SPA (React + Vite)
  frontend/admin                 Operator SPA
libs/
  backend/feature/agritech/
    main                         Use cases, controllers, notification publisher
    admin                        Operator endpoints
    shared                       Domain types, repository contract, policies
  backend/postgres/main/agritech MikroORM entities, migrations, repositories
i18n/                            en, ru, uz translations
openspec/specs/agritech-marketplace  Requirements with REQ-AGRITECH-* traceability
```

**Guarantees:**

- Every mutable record carries `tenantId`; identity derives from the authenticated principal.
- Produce reservation locks the listing (pessimistic write), verifies remaining quantity, and creates the order in one PostgreSQL transaction — no overselling.
- Payment initiation is idempotent per tenant + provider + order + idempotency key; callbacks lock the transaction, verify amount and provider identifiers, and reject replays. Expired Payme transactions (12h) auto-cancel and release inventory.
- Delivery transitions are explicit, append actor/time history, and `delivered` requires a proof reference.
- Advisory entries retain provider/source attribution and observation/expiry windows; API derives a stale flag.
- Commission is configurable via `AGRITECH_COMMISSION_BASIS_POINTS` (default 800 = 8%).

## Quick start

Prerequisites: Node.js 24 (`>=24 <25`), pnpm 11.15.1, PostgreSQL 16, Redis 7.

```bash
git clone https://github.com/nmime/agri-tech.git
cd agri-tech
pnpm install
cp .env.example .env            # set POSTGRES_*, REDIS_*, TELEGRAM_BOT_TOKEN
pnpm run dev:fullstack          # API + user SPA + admin SPA
pnpm run db:migrate             # apply AgriTech migrations
```

Product routes (no extra namespace — this repo *is* the product):

- User SPA: `/` home, `/catalog`, `/dashboard`, `/farmer/register`
- User API: `/farmer`, `/catalog`, `/orders`, `/partners`, `/produce`, `/deliveries`, `/advisories`, `/payments`
- Operator SPA: `/admin`
- Operator API: `/admin/partners`, `/admin/farmers`, `/admin/orders`, `/admin/analytics`, `/admin/integrations`

## Testing

```bash
pnpm run typecheck                        # strict TS across the workspace
npx nx run-many -t test -p "@app/backend-feature-agritech-*" "@app/backend-postgres-main-agritech"
pnpm run test                             # full unit suite (Vitest)
pnpm run test:coverage                    # with v8 coverage
pnpm run spec:validate                    # requirement traceability check
```

Current state:

| Suite | Tests | Notes |
| --- | --- | --- |
| agritech-main (use cases, notifications) | 13 | 100% coverage |
| agritech-shared (domain policies) | 5 | 100% coverage |
| agritech-admin (operator controller) | 16 | all 14 endpoints |
| postgres-agritech (repositories, migrations) | 141 | reservation locking, payment state machine, idempotency |
| frontend user-app | 79 | ~98% coverage |
| frontend admin-app | 97 | incl. agritech operator page |
| acceptance (Cucumber) | 8 scenarios | partner gating, oversell protection, proof-of-delivery |

## Deployment

```bash
pnpm run docker:prod:build      # production images
pnpm run docker:prod:config:check
docker compose -f docker/docker-compose.prod.yml up
```

Also supported: Kubernetes/Helm (`.helm/`), single-server (`deploy/single-server/`), GitOps (ArgoCD/Flux manifests in `deploy/`).

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/agritech-platform.md](docs/agritech-platform.md) | Canonical product and operator guide |
| [openspec/specs/agritech-marketplace/spec.md](openspec/specs/agritech-marketplace/spec.md) | Requirements (source of truth) |
| [docs/research/report_en.html](docs/research/report_en.html) / [report_ru.html](docs/research/report_ru.html) | Uzbekistan market research (EN/RU) |
| [docs/production-deploy.md](docs/production-deploy.md) | Production deployment |
| [docs/environment-variables.md](docs/environment-variables.md) | Configuration reference |
| [AGRITECH.md](AGRITECH.md) | Pitch summary |

## License

MIT — see [LICENSE](LICENSE).
