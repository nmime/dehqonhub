# AgroUz — what this is

**B2B agricultural trade platform for Uzbekistan's smallholder majority:
414,000 dehqan farms, field-agent-verified credit trade, and the operating
system for input distribution and produce aggregation.**

This file is the honest status of the product. Claims here must match the
code and tests. For competitive positioning (why this beats the "build
another UFarmer" plan) see [docs/why-us.md](docs/why-us.md) (EN) and
[docs/why-us.ru.md](docs/why-us.ru.md) (RU).

## The product thesis, in one paragraph

Uzbekistan produces $34.2B of agriculture a year. 63.1% of it comes from
dehqan farms averaging under 0.2 hectares. Existing platforms (UFarmer,
AgroHub, the state integration layer) cover the formal, large, state-visible
slice — UFarmer reaches under 3% of smallholders after years of operation.
The remaining 93% of trade is informal, credit-based (_nasia_), and
trust-enforced inside local communities. AgroUz does not compete for that
formal slice. It wraps the informal trade that already exists: a field agent
physically verifies each delivery, the obligation is recorded against a
verified farmer profile, and after settlement the platform holds the one
asset nobody else has — verified repayment data for the smallholder majority.

**Money model (in order):**

1. **Now — distribution margin.** Aggregate input demand across recorded
   farmers, buy from manufacturers/importers, sell through partner suppliers
   at 8–15% markup. This is how DeHaat's input business works;
   commission-only rural marketplaces do not survive logistics costs.
2. **After 1–2 seasons of recorded repayment history — credit origination.**
   Uzbek banks are mandated to grow agricultural lending but have zero
   underwriting data on these households. We sell verified credit histories
   and originate loans at 1–3% of disbursement. DeHaat's financial services
   reached ~30% of revenue on the same arc.
3. **Later — output aggregation.** The same agent network grades and
   aggregates produce for processors and exporters, attacking the 20–30%
   post-harvest loss documented in our research.

**Go-to-market:** one district, one crop cycle, 100 farmers, 5–10 suppliers,
2–3 field agents. Tiny on purpose — the asset being built is the verified
dataset, and the playbook must be proven before replication. DeHaat ran the
same sequence (3 districts → 12 states).

## What is built and verified (this repository)

All of the following is implemented, typechecked (81 projects), and covered
by 370+ automated tests:

| Area                 | State                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant-isolated core | Every record carries `tenantId`; identity comes from the authenticated principal                                                                                            |
| Farmer profiles      | Verified create/read/update, owned by tenant+user                                                                                                                           |
| Input catalog        | Active listings with category/region filters, UZ/RU/EN names                                                                                                                |
| Orders               | Server-priced lines, pessimistic stock locking, single PostgreSQL transaction, oversell-proof                                                                               |
| Produce listings     | Farmer-side output listings with grade, availability windows                                                                                                                |
| Produce reservation  | Atomic quantity reservation under `SELECT ... FOR UPDATE`; order created in the same transaction                                                                            |
| Price discovery      | Median/min/max across active listings per crop/region                                                                                                                       |
| Supplier partners    | Onboarding, approval workflow, product catalog management                                                                                                                   |
| Buyer partners       | Onboarding, approval, marketplace access gated by status                                                                                                                    |
| Field agents         | Assigned-farmer list, field-visit records with observed grading                                                                                                             |
| Deliveries           | Explicit state machine, proof-of-delivery required, actor/timestamped history                                                                                               |
| Advisories           | Source-attributed agronomy/weather entries with observation/expiry windows                                                                                                  |
| Payments             | Idempotent initiation (tenant+provider+order+key), Click/Payme callbacks with amount verification and replay protection, payme 12h timeout with automatic inventory release |
| Analytics            | Tenant KPIs: GMV, commission (configurable basis points), repeat-buyer rate, fulfillment rate                                                                               |
| Pilot cohorts        | Lifecycle management with actual vs target counts                                                                                                                           |
| Operator console     | Full admin UI with RBAC (read/write/approve permission separation)                                                                                                          |
| Frontend             | User SPA (registration, catalog, dashboard, operations) and operator console, EN/RU/UZ i18n                                                                                 |
| Telegram             | Bot with `/agritech` entry and localized notifications                                                                                                                      |

## What is NOT done (honestly)

- Live Click/Payme merchant accounts and production callback credentials.
- A real pilot district, real farmers, real agents — this is the next 60 days.
- The Uzbek runtime locale is implemented in code but not field-validated.
- Deployment to a production environment with observability, security review,
  and disaster recovery evidence.
- The credit-scoring layer: designed in the thesis, zero data until the pilot
  produces repayment records.

These items must not be described as production-ready until their own
requirements and runtime evidence exist.

## Verification

```bash
pnpm run typecheck                        # 81 projects
npx nx run-many -t test -p "@app/backend-feature-agritech-*" "@app/backend-postgres-main-agritech"
npx nx run user-app:test && npx nx run admin-app:test
pnpm run spec:validate                    # 536 behavior tests, 73 requirements, 0 errors
pnpm run build                            # all deployable targets
```

## Research

- [docs/why-us.md](docs/why-us.md) / [docs/why-us.ru.md](docs/why-us.ru.md) — competitive positioning report
- [docs/agritech-platform.md](docs/agritech-platform.md) — full product and operator guide
