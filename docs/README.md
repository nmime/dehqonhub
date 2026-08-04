# DehqonHub documentation

The website is [dehqonhub.uz](https://dehqonhub.uz). Durable product behavior
lives in [OpenSpec](../openspec/specs/agritech-marketplace/spec.md); code and
configuration remain authoritative for implementation details.

## Product and design

- [Platform](agritech-platform.md), [marketplace design](design/dehqonhub-marketplace.md), [architecture](architecture.md), [architecture deep dives](architecture/README.md)
- [Frontend FSD](frontend-fsd.md), [state](frontend-state.md), [UX](frontend-ux.md), [SSR strategy](frontend-ssr-framework-strategy.md), [deployment topology](frontend-deployment-topology.md)
- [Internationalization](i18n.md), [feature flags](feature-flags.md), [notifications](notifications.md), [NATS](nats.md)
- [Tenant/auth hardening](auth-tenant-hardening.md), [login analytics](auth-login-analytics.md), [social auth and bots](social-auth-bots.md), [live auth testing](social-auth-live-test-guide.md)

## APIs and data

- [API contracts](api-contracts.md), [conventions](api-conventions.md), [lifecycle policy](api-lifecycle-policy.md), [generated clients](api-client.md), [toast mapping](api-toast-config.md)
- [Database migrations](database-migrations.md), [dependency management](dependency-management.md), [environment variables](environment-variables.md)

## Development and verification

- [Scaffolding contract](scaffolding-and-extension.md), [first feature](first-feature-walkthrough.md), [CLI reference](setup/cli-reference.md), [setup](setup/configuration.md)
- [Presets](setup/presets-and-technologies.md), [Nx generators](setup/nx-generators.md), [generator extension](setup/extending-generators.md), [migration](setup/migration.md), [troubleshooting](setup/troubleshooting.md), [Discord setup](setup/discord-bot.md)
- [Testing](testing.md), [modern QA](testing/modern-qa.md), [test reliability](testing/test-reliability.md), [specification assurance](specification-assurance.md)
- [Local verification](local-verification.md), [command matrix](command-matrix.md), [Bun contract](bun-runtime-research.md)

## Deployment and operations

- [Deployment](deployment.md), [platforms](deployment-platforms.md), [production](production-deploy.md), [Compose](docker-compose-production.md), [single server](single-server-deployment.md)
- [Production readiness](production-readiness.md), [hardening](production-hardening.md), [release boundary](release-hardening.md), [branch policy](branch-protection.md)
- [Operations](operations.md), [monitoring](monitoring.md), [health](operations/health-checks.md), [logging](operations/logging.md), [OpenTelemetry](operations/otel.md)
- [Disaster recovery](operations/observability-dr.md), [RPO/RTO](operations/rpo-rto.md), [dependency triage](operations/dependency-triage.md), [execution policy](operations/execution-policy.md)
- [Runbooks](runbooks/README.md), [incident template](runbooks/service-incident.md), [security platforms](security-platforms.md), [supply chain](supply-chain.md)
- [Validation observability](ci-observability.md), [cache](ci-cache.md)

## Repository reference

- [Project catalog](project-catalog.md), [ports](PORTS.md), [agent skills](agent-skills.md), [ADR index](adr/README.md), [ADR template](adr/0000-template.md), [Nx ADR](adr/0001-use-nx-over-turborepo.md), [Fastify ADR](adr/0002-use-fastify-over-express.md)
- [Agent policy](ai/agent-policy.md), [repo map](ai/repo-map.md), [retrieval policy](ai/retrieval-policy.md), [workflows](ai/agent-workflows.md), [context packing](ai/context-packing.md)

`docs/project-catalog.md` is generated. Run `pnpm run docs:catalog` after
changing projects or setup ownership; `pnpm run docs:check` validates the
catalog, links, commands, and reachability of every maintained document.
