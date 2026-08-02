## Evidence Policy

Profile ownership, order pricing, stock mutation, and payment behavior are high
risk. The PR lane requires focused Vitest, API e2e, migration/config, generated
contract/client, frontend, Telegram, specification, and documentation checks.
Docker component and provider canary lanes remain distinct and cannot be
reported as source passes.

## Requirement Evidence

| Requirement                 | Risk     | Required evidence                  | Primary owners                                    |
| --------------------------- | -------- | ---------------------------------- | ------------------------------------------------- |
| `REQ-AGRITECH-PROFILE-001`  | high     | domain, API, persistence           | farmer shared/main, user API, AgriTech PostgreSQL |
| `REQ-AGRITECH-CATALOG-002`  | normal   | domain, API, frontend              | product shared/main, user API, user-app           |
| `REQ-AGRITECH-ORDER-003`    | high     | domain, API, persistence           | order shared/main, user API, AgriTech PostgreSQL  |
| `REQ-AGRITECH-PAYMENT-004`  | critical | domain, security, API, persistence | payment shared/main/PostgreSQL, user API          |
| `REQ-AGRITECH-TELEGRAM-005` | high     | domain, integration                | Telegram bot                                      |
| `REQ-AGRITECH-WEB-006`      | high     | frontend, API, journey             | user-app, frontend API client/support             |

Each new executable test will contain its owning `// @requirements` marker.
The durable version 3 sidecar will name exact projects, files, targets, lanes,
and one explicit Cucumber disposition per requirement.

## Independence Review

Quality-engineering reviews the requirement set, authorization boundaries,
failure behavior, evidence meaning, and exact source revision independently of
implementation authorship. Payment/provider readiness also requires merchant
operations and security review before callbacks or settlement are enabled.

## PR, Main, Nightly, and Runtime Lanes

- PR: spec, configs, lint/typecheck/build, unit/API e2e, migration static,
  contract/client freshness, frontend FSD/i18n, docs, security scans.
- Main: PR evidence plus broader affected project tests and contracts.
- Nightly: Docker PostgreSQL component/rollback, mutation, accessibility, and
  browser matrix where configured.
- Runtime: selected-stack fullstack journey, Telegram linked-account canary,
  and separately authorized Click/Payme sandbox canaries.

## Residual Risk

No source evidence proves merchant approval, payment settlement, field-agent
operations, supplier inventory quality, farmer adoption, agronomy accuracy,
deployment, or production readiness.

## Independent Verification Reviewer

- quality-engineering; payment runtime enablement additionally requires
  security-maintainers and merchant-operations approval.
