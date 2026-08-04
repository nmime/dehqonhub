# DehqonHub

DehqonHub is a tenant-isolated agricultural marketplace for verified farmers,
suppliers, and buyers in Uzbekistan.

[dehqonhub.uz](https://dehqonhub.uz) · [Documentation](docs/README.md) ·
[Product requirements](openspec/specs/agritech-marketplace/spec.md)

## Status

The responsive user web application is the supported product surface. Native
mobile and complete administrator workflows are deferred.

The platform includes public discovery, organization verification, privacy-safe
commerce, contracts and settlement, fulfillment and disputes, promotions,
notifications, dashboards, and grounded AI. English, Russian, Uzbek Latin, and
Uzbek Cyrillic are supported. Provider simulations are allowed only outside
production.

## Run locally

Requires Node.js 24 and pnpm 11.

```bash
git clone https://github.com/nmime/dehqonhub.git
cd dehqonhub
corepack enable
pnpm install --frozen-lockfile
pnpm nrb setup
pnpm run dev:fullstack
```

## Validate

```bash
pnpm run tooling:static-check
pnpm run spec:validate
pnpm run test:all
pnpm run deploy:validate
```

See [architecture](docs/architecture.md), [local verification](docs/local-verification.md),
and [deployment](docs/deployment.md) for the maintained technical contracts.

[MIT](LICENSE)
