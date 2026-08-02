# Verification plan

All fourteen requirements use version 3 durable sidecar mappings. The
stakeholder-significant multi-actor journey uses Cucumber in `acceptance-e2e`;
domain permutations remain in Vitest, persistence semantics use PostgreSQL
component/migration tests, public surfaces use OpenAPI/client checks and app
tests, and deployment uses render/config tests. Every changed executable test
will carry exactly one `// @requirements` inventory marker.

| Requirement     | Risk     | Primary evidence                   | PR lane | Runtime boundary              |
| --------------- | -------- | ---------------------------------- | ------- | ----------------------------- |
| PROFILE-001     | high     | farmer unit/API/persistence        | yes     | assignment e2e                |
| CATALOG-002     | high     | product unit/API/persistence       | yes     | concurrent stock              |
| ORDER-003       | critical | order unit/component/Cucumber      | yes     | PostgreSQL concurrency        |
| PAYMENT-004     | critical | payment state/property/security    | yes     | provider canary               |
| TELEGRAM-005    | high     | bot and notification tests         | yes     | live Telegram canary          |
| WEB-006         | high     | user/admin/mobile tests/builds     | yes     | browser/device e2e            |
| PARTNER-007     | high     | operations/admin/API tests         | yes     | organization review           |
| OUTPUT-008      | high     | price/grade property tests         | yes     | market data quality           |
| ADVISORY-009    | high     | freshness/provider tests           | yes     | chosen provider canary        |
| FULFILLMENT-010 | high     | state/assignment/mobile tests      | yes     | field device journey          |
| ANALYTICS-011   | high     | query and UI tests                 | yes     | real pilot data               |
| I18N-012        | high     | locale parity/render tests         | yes     | native/manual language review |
| INTEGRATION-013 | critical | config/timeout/reconcile tests     | yes     | external canaries             |
| DEPLOYMENT-014  | critical | config/render/migration/DR dry run | yes     | applied staging/production    |

The independent specification-assurance review will validate intent,
requirement ownership, missing denial/failure scenarios, exact-SHA evidence,
and the separation between source proof and external runtime proof.
