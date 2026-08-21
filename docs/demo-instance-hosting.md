# Hosting the DehqonHub demo instance

How to take a fresh clone of this repository to the complete demo state on a
server somebody else owns: the full catalogue, nineteen trading logins, a
populated trading history, and a deal that can be carried from a cart to a
signed, settled, reviewed contract.

The database is **not** handed over as a dump. It travels as code. Migrations
build the schema and one idempotent seed command writes every demo row, so the
demo state is reproducible from the repository alone and re-runnable without
duplicating anything. Demo rows are deliberately kept out of migrations:
migrations run once, in every environment including production, and cannot be
corrected afterwards.

Read alongside [Deployment](deployment.md),
[Single-server operations](single-server-deployment.md),
[Environment variables](environment-variables.md) and
[Database migrations](database-migrations.md). This document does not repeat
them; it states the decisions and values specific to a hosted demo.

## The one decision that shapes everything: run it as `staging`

Every commercial capability in this marketplace — identity verification,
contract artifacts, qualified signature, settlement, promotion billing,
notification delivery — is behind an external-provider port that currently has
only a **mock** implementation. `live` mode throws unconditionally; no live
adapter has been written or contracted. And mock mode is refused unless
`NODE_ENV` is `development`, `test` or `staging`:

```ts
// libs/backend/feature/agritech/main/lib/src/marketplace-provider.config.ts:94
const approvedMockEnvironments = new Set(['development', 'test', 'staging']);
// :121-123
if (mode === 'mock' && !approvedMockEnvironments.has(env.NODE_ENV ?? '')) {
  throw new Error(`${variable}=mock is allowed only when NODE_ENV is development, test, or staging.`);
}
```

So a `NODE_ENV=production` deployment can demonstrate browsing and sign-in and
nothing else: every contract, settlement and verification command answers a
typed `503 marketplace-provider-unavailable`. **The demo instance must run with
`NODE_ENV=staging`.** That is the intended configuration here, not a workaround.

`staging` is not "production minus a little", and this is the part that is easy
to get wrong. There is exactly one environment predicate in the backend —
`const isProduction = env.NODE_ENV === 'production'`
(`libs/backend/common/bootstrap/lib/src/bootstrap-nest-api.ts:635`) — with no
"production-like" allow-list. `staging` therefore takes the **development**
branch of every guard in the codebase. On a publicly reachable URL that matters.
[Overrides for a public staging instance](#overrides-for-a-public-staging-instance)
lists the values that put the protections back; treat that section as mandatory,
not advisory.

## What travels in git, and what does not

|                                                    | Travels in git                                                       | Consequence                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Schema                                             | yes — 56 MikroORM migrations                                         | `db:migrate` builds it                                            |
| Demo rows                                          | yes — `packages/tooling/src/commands/db/`                            | `db:seed` writes them, idempotently                               |
| Catalogue photographs                              | yes — 42 WebP files in `apps/frontend/app/public/media/marketplace/` | served by whatever serves the SPA                                 |
| Uploaded photograph bytes                          | as source files, not as objects                                      | `db:seed` puts eleven of them in **your** bucket, if you have one |
| Carts, settlements, deliveries, timelines, intents | yes                                                                  | `db:seed` writes them; see below                                  |
| Sessions, login events, audit, outbox, idempotency | no, and should not                                                   | runtime state of the machine it happened on                       |

The seeded catalogue references the checked-in files **and**, when the instance
has object storage, eleven objects the seed puts there itself. The two are not
interchangeable and the fixture never guesses which it has:

- Every listing that carries uploaded photographs also names a checked-in
  fallback, and a test
  (`packages/tooling/src/commands/db/marketplace-seed-publications.test.ts`)
  refuses a listing that names only uploads.
- `db:seed` writes the objects **before** it opens its transaction, and treats
  "configured" and "reachable" as different questions: it `PUT`s all eleven or
  none. A configured bucket with nothing behind it — a stopped MinIO container is
  the usual case — is the same outcome as no bucket at all.
- Only when all eleven landed does the seed write `marketplace_media_assets` rows
  and hand listings `/marketplace/media/<id>` paths and reviews
  `public-asset:<id>` handles. Otherwise listings fall back to
  `/media/marketplace/*.webp` and reviews carry no photograph. Either way the
  command says which happened on stdout:

  ```
  [seed] Stored 11 demo photographs in object storage.
  [seed] S3_BUCKET is not configured, so no photograph was uploaded. Listings fall
         back to checked-in photographs and reviews carry none.
  ```

So a deployment with an empty bucket, or with no bucket, still cannot render a
broken image — and one with a working bucket demonstrates the upload path with
real stored objects rather than only with files the SPA serves.

The seed reads those objects out of the same checked-in library, runs them
through the upload route's own `inspectMarketplaceMedia` (so the stored bytes are
metadata-stripped exactly as a seller's upload would be), and derives each opaque
id from a fixture key so a re-seed overwrites the same object instead of orphaning
it. The ids are therefore predictable, which a real upload's are not; that is
acceptable for public demo photographs of files the repository already ships in
the open, and nowhere else.

### The settled half of a deal

Contracts alone left four surfaces empty. The fixture now also writes, for every
deal that reached them: the direct-payment settlement, the delivery record, the
fulfilment and completion timeline, one durable notification intent per party per
timeline event, the marketplace's commission on a closed deal, and one dispute.
Carts travel too — three open (two of them for one buying account from two
different sellers, so the cart switcher has something to switch between) and nine
that were checked out, which is what lets a cart-checkout contract name the cart
it came from.

Three provider-produced documents deliberately do **not** travel: the contract
artifact PDF, the two qualified signatures, and the direct-payment provider
receipts, together with the `marketplace_provider_operations` ledger rows all
three hang off by foreign key. Each is a receipt an external adapter issued, and
a seeder that minted one would be forging it. A reviewer produces them by
clicking through one of the nine seeded **draft** contracts on a running
instance.

### Identifiers change

Fixture rows get ids derived from fixture keys, not the ids any particular
database happens to hold. A listing, contract or photograph URL captured against
one instance will **not** resolve on another — including against the development
database this fixture was extracted from. Re-derive ids from the API on the
instance you are demonstrating; never paste a captured deep link into a script or
a walkthrough.

Seven seeded listings deliberately carry no photograph at all, one per section.
Those render the designed tinted category illustration (`ProductMedia`,
`apps/frontend/app/src/pages/marketplace/ui/marketplace-product-card.tsx:54-89`),
which is also the `onError` fallback for any image URL that fails — so even a
mispublished path degrades to the illustration rather than to a broken-image
icon.

## Deploy

### 1. Prerequisites

Node.js `>=24 <25` and pnpm 11.15.1 — the repository sets `engine-strict`, so an
older runtime is refused at install time rather than at run time. PostgreSQL 17,
and a reverse proxy terminating TLS. Redis is required if you enable rate
limiting, which you should.

The setup closure is committed (`.nrb/workspace.json`, `.nrb/state.json`,
`.nrb/capabilities.env`), so a fresh clone does not need `pnpm nrb setup` before
the database commands. It selects PostgreSQL, and the marketplace, s3, redis,
notifications and telegram-bot capabilities.

```bash
git clone <repo> && cd dehqonhub
corepack enable && pnpm install --frozen-lockfile
```

### 2. Configure

Start from `.env.staging.example`, which is the only template that pairs
`NODE_ENV=staging` with the nine `mock` provider modes. Do **not** start from
`.env.example`: it pairs `NODE_ENV=production` (`:27`) with nine `mock` modes
(`:63-71`) and therefore cannot boot at all.

Then apply the [required values](#environment-variables-that-must-be-set) and
the [public-instance overrides](#overrides-for-a-public-staging-instance).

### 3. Build

```bash
pnpm exec nx run-many -t build --projects=auth-app-api,user-app-api,user-app
```

The SPA's API base URLs are **baked in at build time** — `import.meta.env`, not
runtime config. Only five keys are runtime-configurable
(`docker/frontend-runtime-config.sh`), and none of them is an API URL. A
production-mode build with no explicit origins self-defaults to
`VITE_API_BASE_URL_MODE=same-origin`, which is what you want: the SPA calls
relative paths and the reverse proxy routes the API prefixes. If you instead
build with absolute origins, you must rebuild to move the instance.

### 4. Migrate, then seed

```bash
export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DBNAME'
pnpm db:migrate

# Seeding a deployment is an explicit act - see the two notes below.
export DB_ALLOW_DESTRUCTIVE=true DB_SEED_ALLOW_NON_LOCAL=true
pnpm db:seed --force --email 'you@example.org' --password-env DEMO_ADMIN_PASSWORD
```

`db:migrate` applies the Better-Auth core schema and the 56 MikroORM
migrations. `db:seed` writes the RBAC catalogue, the 22 accounts and the whole
marketplace fixture inside one transaction.

Two things about `db:seed` on a deployment:

- **A bare `db:seed` is refused, and that is deliberate.** The guard reads
  `NODE_ENV` as an allowlist - `development`, `test` and unset are a local
  checkout, everything else is a deployment - because the host-and-name heuristic
  beside it cannot tell the two apart: a deployed stack reaches Postgres at host
  `postgres` under the default database name, exactly as a laptop does. Verified:

  ```
  $ NODE_ENV=staging DATABASE_URL=postgres://appuser:pw@postgres:5432/nest_react_boilerplate       pnpm db:seed --dry-run
  Refusing destructive database operation while NODE_ENV=staging
  (postgres/nest_react_boilerplate). ... Set DB_ALLOW_DESTRUCTIVE=true only for
  an intentional, controlled operation.
  ```

  Until this was closed, that same command was **accepted** and created
  `admin@example.com` with a password published in this repository
  (`packages/tooling/src/commands/db/seed-data.ts`), because the guard excluded
  only the single name `production`.

- **Seeding a deployment is therefore an explicit act.** Ask for it and supply
  your own administrator credentials:

  ```bash
  export DB_ALLOW_DESTRUCTIVE=true
  export DB_SEED_ALLOW_NON_LOCAL=true
  pnpm db:seed --force --email 'you@example.org' --password-env DEMO_ADMIN_PASSWORD
  ```

  `--email` and `--password-env` are not decoration: without them the run is
  refused rather than falling back to the published defaults. `--force` and
  `DB_SEED_ALLOW_NON_LOCAL` are what acknowledge that the target is not a
  disposable local database, and `DB_ALLOW_DESTRUCTIVE` is what permits the
  reset the seed performs. A database named without a `dev`, `test` or
  `boilerplate` token needs the same flags for the same reason.

Re-running `db:seed` is safe and is the supported way to restore demo state a
reviewer consumed — stock a checkout drew down, an organization an admin
rejected. Every fixture row is upserted on its derived id, so a second run
reports `0` inserted for every table.

No deployment artifact in this repository runs the seed. It is a deliberate
manual step; `db:migrate` is wired into Compose and the Helm pre-install hook,
`db:seed` is not.

### 5. Start

Run `auth-app-api` and `user-app-api` behind the proxy, and serve the SPA's
`dist/apps/frontend/app` as static files. Both APIs need the **same**
`SESSION_SECRET`; see below.

## Environment variables that must be set

Grouped by what breaks without them.

### Authentication breaks silently without these

| Variable                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`                             | Signs the session cookie. Under `staging` an unset value does **not** fail the boot — it falls back to the source-committed literal `'nrb-development-session-secret'` (`bootstrap-nest-api.ts:351`), so anyone with repo access can forge a session. A value shorter than 32 characters is silently padded rather than rejected.                                                                                                                                        |
| `SESSION_SECRET`, **identical on both APIs** | `auth-app-api` signs the cookie and `user-app-api` verifies it. On a mismatch `@fastify/session` does not error — it starts a fresh empty session, the guard finds no principal and throws a bare `UnauthorizedException` with no `detail` (`persistent-session-access.guard.ts:48-53`). Every authenticated request answers 401 with nothing in the body and nothing in the logs. The `session-config` health indicator is `required: false`, so `/ready` still passes. |
| `SESSION_COOKIE_NAME`, identical on both     | Two places resolve it independently (`bootstrap-nest-api.ts:354-356` and `session-lifecycle.util.ts:19`); a mismatch means one service never sees the other's cookie and logout cannot clear it.                                                                                                                                                                                                                                                                         |
| `NODE_ENV`, identical on both                | It selects both the cookie name and the secret fallback, so a prod/staging split across the two services breaks auth two ways at once.                                                                                                                                                                                                                                                                                                                                   |
| `BETTER_AUTH_SECRET`                         | Read at `better-auth.ts:34` with **no boot validation anywhere**. Unset, it is `undefined` and Better Auth state diverges between the two services.                                                                                                                                                                                                                                                                                                                      |
| `AUTH_PERSISTENCE=postgres` + `DATABASE_URL` | Sessions live in a shared durable store. Different stores mean session ids never resolve even with a matching secret. Under `staging`, `AUTH_PERSISTENCE=memory` is _accepted_ (`auth-main.module.ts:44` only refuses it in production) and loses every user on restart.                                                                                                                                                                                                 |
| `AUTH_ALLOWED_RETURN_URLS`                   | Fail-closed: empty rejects every return URL, so post-login redirects break.                                                                                                                                                                                                                                                                                                                                                                                              |

### The database

`DATABASE_URL` (or the `POSTGRES_*` set) plus `DATABASE_ENGINE=postgres` and
`AUTH_PERSISTENCE=postgres`. Set them explicitly: PostgreSQL config has **no
required variable** — `postgres-env.schema.ts:17-21` defaults to
`postgres:postgres@localhost:5432/postgres`, so a typo does not fail the boot,
it fails at connect time with a confusing error. Under `staging` the
compiled-provider cross-check that would catch a mismatch is also skipped
(`durable-database.runtime.ts:38`).

### The marketplace — all nine, or the demo is not a demo

Every one defaults to `disabled`, and a disabled capability refuses its command.
Set all nine to `mock`:

```bash
MARKETPLACE_ONEID_PROVIDER_MODE=mock                        # identity verification
MARKETPLACE_DOCUMENT_PROVIDER_MODE=mock                     # verification documents
MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_MODE=mock    # the contract PDF
MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_MODE=mock          # signing
MARKETPLACE_DIRECT_PAYMENT_PROVIDER_MODE=mock               # settlement
MARKETPLACE_FACTORING_PROVIDER_MODE=mock                    # settlement, factoring
MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_MODE=mock     # dispute evidence
MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE=mock            # paid listing slots
MARKETPLACE_NOTIFICATION_PROVIDER_MODE=mock                 # contract notifications
```

Without the artifact and signature modes, `POST /marketplace/contracts/{id}/artifact`
and `/sign` answer 503 and no deal can be carried past agreement. Without the
payment modes, settlement answers 503. Mock adapters keep every authorization,
idempotency and ordering guard intact and watermark their output
`MOCK PROVIDER — NOT A LEGAL CONTRACT`.

Two retired names now **fail the boot** if set at all:
`MARKETPLACE_SIGNATURE_PROVIDER_MODE`, `MARKETPLACE_BANK_PROVIDER_MODE`.

### Object storage — optional, and the instance is fine without it

`S3_BUCKET` is the single switch:

```ts
// libs/backend/feature/agritech/main/lib/src/marketplace-media.storage.ts:43
const configured = Boolean(config.bucket?.trim());
```

Region has a default, an endpoint is only needed for a non-AWS server, and the
client already refuses a half-supplied credential pair — so `S3_BUCKET` alone
decides whether photograph upload is offered. The full set is `S3_BUCKET`,
`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
`S3_FORCE_PATH_STYLE`. `S3_ACCESS_KEY` and `S3_SECRET_KEY` must be set together
or the boot fails (`s3.aws-client.ts:30-32`). No deployment artifact in this
repository provisions a bucket — not Compose, not Helm — so if you want uploads
you must create one yourself.

**With no object storage at all, nothing breaks.** Verified on a fresh instance
with every `S3_*` variable unset:

```
GET  /marketplace/media -> 200 {"configured":false,"maximumByteSize":5242880,
                                "maximumListingImages":5,"maximumReviewAssets":3,
                                "mediaTypes":["image/jpeg","image/png","image/webp"]}
POST /marketplace/media -> 503
{ "type": "https://dehqonhub.uz/problems#marketplace-media-storage-unavailable",
  "title": "Marketplace Photograph Storage Unavailable",
  "status": 503,
  "detail": "This deployment cannot store photographs because its object storage
             is not configured or not reachable. Nothing was stored.",
  "retryable": false }
```

The frontend reads that `configured: false` and replaces the upload control with
an explanation rather than offering a button that fails
(`marketplace-photo-upload.tsx:168-174`). The seeded catalogue is unaffected —
it never references storage. One unrelated surface does degrade badly: the admin
notification-segment CSV export calls S3 without the `configured` check
(`notification-admin.service.ts:202`) and throws an untyped 500. Do not use it
on an instance with no bucket.

### The frontend

`VITE_API_BASE_URL_MODE=same-origin` (self-defaults on a production-mode build),
and the reverse proxy must route the API prefixes listed in
`libs/frontend/api-support/lib/src/frontend-dev-proxy.ts:73-111` — `/api/auth/`,
`/auth/`, `/profile/`, `/marketplace/`, `/partners`, `/farmer`, `/orders` and the
rest — to `user-app-api` and `auth-app-api`. If you serve the SPA with
`docker/nginx-spa.conf`, note that its CSP `connect-src` hard-codes
`*.example.com` API hosts (`:12,:41`) and will block your real API; the
same-origin `nginx-fullstack.conf` does not have this problem.

## Overrides for a public staging instance

Staging weakens each of the following. Set every one of them; prefer these
individual knobs over `NODE_ENV=production`, which would break the mock
providers and with them the whole demo.

| Set this                         | To                                                  | Because in `staging`                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                 | 32+ random bytes                                    | otherwise the committed development secret signs cookies                                                                                                                                                                            |
| `SESSION_COOKIE_SECURE`          | `true`                                              | defaults to `false` (`bootstrap-nest-api.ts:367-373`)                                                                                                                                                                               |
| `SESSION_COOKIE_NAME`            | `__Host-nrb.sid`                                    | defaults to the unprefixed `nrb.sid`, losing browser-enforced Secure and host-locking. **Set this only together with the line above** — a `__Host-` cookie without `Secure` is rejected by every browser and auth breaks completely |
| `REVIEWER_ACCESS_ENABLED`        | `false` (see below)                                 | defaults to `true` in every environment; publishes demo credentials in the UI                                                                                                                                                       |
| `CORS_ORIGINS`                   | your real origins, comma-separated, no stray commas | unset, the API allow-lists `localhost:4200-4202` **with credentials** and blocks your real frontend. A value that trims non-empty but parses to zero entries falls through to `origin: true` — reflect-any-origin with cookies      |
| `OPENAPI_ENABLED`                | `false`                                             | production needs `OPENAPI_ALLOW_PRODUCTION` as a second gate; staging needs only this one, and `.env.staging.example:274` sets it to `true`. `/docs` and `/docs/openapi.json` have no auth guard                                    |
| `RATE_LIMIT_ENABLED`             | `true`                                              | defaults to **off** (`:600-601`)                                                                                                                                                                                                    |
| `RATE_LIMIT_STORE` + `REDIS_URL` | `redis`                                             | otherwise per-process in-memory buckets, which a multi-replica or restarted instance does not enforce                                                                                                                               |
| `TRUST_PROXY`                    | `true`                                              | `.env.staging.example:57` sets `false`. Behind a proxy that collapses every client into one rate-limit bucket, so one noisy client throttles everyone                                                                               |
| `ADMIN_BOOTSTRAP_ENABLED`        | `false` once an admin exists                        | grants admin on first sign-in for any listed email, with no environment gate at all                                                                                                                                                 |
| `TELEGRAM_BOT_MODE`              | `webhook`                                           | staging defaults to long-polling and skips webhook-secret enforcement                                                                                                                                                               |
| `VITEST`                         | **unset**                                           | if it leaks into the process env it forces memory persistence and makes `/health` report OK with no database                                                                                                                        |

Unchanged between staging and production, and equally strong in both — no action
needed: helmet and HSTS (`app.use(helmet())`, unconditional), CSP (always
enforced, never report-only), RFC 9457 error bodies (no `detail`, no `stack`, no
exception message in any environment), structured JSON logging with unconditional
redaction, and the fail-closed return-URL allowlist.

Two weakenings **cannot** be reversed by configuration under `staging`:

1. Better Auth's own sign-in/sign-up throttling is hard-coded
   `enabled: process.env.NODE_ENV === 'production'` (`better-auth.ts:59-63`).
   The generic bootstrap limiter is coarse and IP-keyed; it is not per-account
   brute-force protection. Throttle the auth endpoints at the ingress.
2. The notification-provider readiness assertion returns early when `NODE_ENV`
   is not `production` (`notification-provider-readiness.service.ts:18`), so the
   instance boots with no mail provider configured and password-reset mail goes
   nowhere. The health indicator still reports `error`.

## The demo credentials

**Yes, the passwords travel in the fixture, and they are in a repository anyone
can read.** Nineteen marketplace logins are declared with plaintext passwords in
`packages/tooling/src/commands/db/marketplace-seed-roster.ts` (documented in a
table in its own header), three of them are additionally shipped to the browser
in `apps/frontend/app/src/pages/marketplace/model/demo-accounts.ts` and rendered
on the marketplace home banner, and three non-marketplace accounts
(`admin@example.com` / `Admin@Secure1!`, `bob.user@example.com`,
`charlie.dev@example.com`) are declared in `seed-data.ts`.

The convention is `Demo` + the capitalised mailbox + `2026`, enforced by a test,
so knowing one login lets you derive all nineteen.

What a holder of those credentials can do on the hosted instance: sign in; act
as a verified seller and publish listings; act as a verified buyer, open a cart,
check out into a contract, sign it, settle it and file reviews; and read the
seeded trading history of the account they signed in as. They cannot moderate
(that is `admin-app-api`, which the demo does not need to run) and they cannot
move real money, because every provider is a watermarked mock.

For a demonstration instance whose purpose is that a commission can sign in
without being handed credentials out of band, that is the intended trade-off and
it is acceptable. What is **not** acceptable is the fourth account. Decide
explicitly:

- **The nineteen marketplace logins — keep them.** They are the demo. They hold
  no privilege beyond acting as one trading party among nineteen, and every
  commercial action they take is a mock. Leave `REVIEWER_ACCESS_ENABLED=true` if
  you want the banner to publish the shortlist, or set it to `false` and hand
  the three addresses to reviewers directly — the accounts still exist and still
  work either way; the flag only controls whether the UI advertises them.
- **`admin@example.com` — do not accept the fixture password.** It carries the
  `admin` role. Always seed with `--email` and `--password-env`; see the warning
  in step 4, because the safety guard does not stop you.
- **`bob.user@example.com` and `charlie.dev@example.com`** are boilerplate
  fixtures with the plain `user` role and no marketplace verification, so they
  can browse and nothing else. Harmless, but they are also pointless on a demo
  instance — worth deleting after seeding if you would rather not explain them.

Nothing in the fixture's credentials was changed by this work. If you want the
demo passwords supplied by the host rather than published, that is a change to
the fixture and to the frontend shortlist, and it should be decided
deliberately.

## Post-deploy smoke check

Run this against the deployed host before telling anyone the instance is up. A
broken deployment should be discovered by the person deploying it.

### Automated: the remote-capable Playwright lane

Most e2e lanes in this repository manage their own Docker stack and cannot
target a remote host. One can: `playwright.extended.config.ts` drops its
global setup when external URLs are configured.

```bash
FULLSTACK_USER_APP_URL=https://demo.example.org \
FULLSTACK_USER_API_URL=https://demo.example.org \
FULLSTACK_AUTH_API_URL=https://demo.example.org \
FULLSTACK_ADMIN_APP_URL=https://admin.example.org \
FULLSTACK_ADMIN_API_URL=https://admin.example.org \
PLAYWRIGHT_MANAGE_STACK=0 \
pnpm exec playwright test -c playwright.extended.config.ts --project chromium
```

All five URL groups are required (`apps/e2e/fullstack/src/compose.ts:75-82`) or
it refuses to run. It signs Telegram init data from `composeEnv` defaults, so
the deployed host must share `TELEGRAM_BOT_TOKEN` and `ADMIN_BOOTSTRAP_EMAILS`
for the auth journeys to pass.

Also remote-capable, no Docker: `pnpm run test:a11y` (`A11Y_URLS`),
`pnpm run test:perf` (`PERF_URLS`, `PERF_API_URLS`),
`pnpm run test:security:dast` (`SECURITY_DAST_URLS`),
`pnpm run api:openapi:fuzz` (`OPENAPI_FUZZ_BASE_URL`).

Not usable here, despite the names: `pnpm run test:docker-smoke` builds and
tears down a local Compose stack, and `testing frontend-static-smoke` reads a
built `dist/` off the filesystem and makes no HTTP request at all.

### Manual: eleven checks, in order

Each one fails distinctly, so a failure tells you which layer is wrong.

1. **The catalogue answers with real rows.**
   `curl -s 'https://HOST/marketplace/public/catalog?limit=50'` returns items
   with `"provenance":"live"`. `"provenance":"demo"` means the tenant has no
   published rows and the API is serving its in-memory fallback — the seed did
   not run, or ran against another database. Page the `nextCursor` and you
   should reach **89 items**: 31 seeds, 30 equipment, 28 produce.
2. **A photograph loads.** Take an `images[0]` from that response and
   `curl -sI 'https://HOST<path>'`. Expect `200` and `Content-Type: image/webp`.
   Which component answered depends on the path: `/media/marketplace/*.webp` is
   served by whatever serves the SPA, so a 404 there means its `public/` tree is
   not being served; `/marketplace/media/<id>` is served by the user API from
   object storage, so a 404 there means the seed did not put the objects in the
   bucket — check the `[seed]` line the seed printed. On an instance with a
   bucket, `q=mist blower` returns the one listing that carries five uploaded
   photographs, which is the case worth checking.
3. **Sign-in works.**
   `curl -s -c jar -X POST https://HOST/auth/login -H 'content-type: application/json' -d '{"email":"xaridor@demo.dehqonhub.uz","password":"DemoXaridor2026"}'`
   returns the user object.
4. **The session crosses services.** With the same cookie jar,
   `curl -s -b jar https://HOST/marketplace/dashboard` returns buyer totals and
   a six-month `monthlyActivity` array. A bare 401 with no `detail` is the
   `SESSION_SECRET` mismatch described above — not a credentials problem.
5. **Providers are armed.** `curl -s -b jar https://HOST/marketplace/verification/providers/readiness`
   should report every capability `ready: true, simulation: true`. Any
   `ready: false` is a `MARKETPLACE_*_PROVIDER_MODE` still at `disabled`.
6. **A cart becomes a contract.** `GET /marketplace/cart` already answers two
   open carts for this login, from two different sellers — that is the seeded
   cart switcher. `POST /marketplace/cart/{id}/checkout` with
   `{"deliveryTerms":"pickup"}` and an `Idempotency-Key` header turns one of them
   into a `contractId` in status `draft`. (To start from nothing instead, `GET
/partners` for the buyer's `actingPartnerId` and `POST
/marketplace/cart/items` first.)

   Note that checking a seeded cart out consumes it: a re-seed restores its items
   but leaves it `ordered`, because a contract now points at it and resurrecting
   it would deny that. The other open cart is untouched.

7. **The artifact is produced.** `POST /marketplace/contracts/{id}/artifact`
   with `{"settlementKind":"direct_payment"}`. Expect `providerMode: "mock"` and
   the watermark. A 503 here is the artifact-storage mode. The nine seeded draft
   contracts (`GET /marketplace/contracts`) are the ones to use for this: the
   fixture writes no artifact and no signature, so a draft is where the
   provider-backed half of the lifecycle starts.

   A seeded **completed** deal already carries its settlement, delivery record,
   timeline and notification intents; `GET /marketplace/notifications` answers a
   non-empty list on a fresh instance, and a review with photographs is visible
   anonymously at
   `GET /marketplace/public/catalog/{listingPublicationId}/reviews` for the
   trailed sprayer and for the dark raisins.

8. **Both parties sign.** `POST .../sign` as the buyer, then as the seller
   (`jahongir@demo.dehqonhub.uz` / `DemoJahongir2026` sells the seed listing).
   The contract moves `draft → active` and `signedAt` is set.
9. **It settles.** `POST .../settlement/events` with
   `{"command":"confirm_buyer_payment"}` as the buyer, then
   `{"command":"confirm_seller_receipt"}` as the seller. A commission row
   appears.
10. **It completes.** `POST .../fulfillment` with `{"command":"start"}` then
    `{"command":"mark_delivered"}` as the seller, then
    `{"command":"accept_delivery"}` as the buyer. Contract status `completed`.
11. **A review can be filed.** `POST /marketplace/reviews` with the listing's
    publication id, a rating and `"assetReferences": []`.

Two ordering rules will otherwise cost you an afternoon, because both fail with
an undetailed `400`:

- **The artifact must exist before either party can sign**, and **both
  signatures must exist before settlement**. The sequence is fixed: artifact →
  buyer signs → seller signs → buyer confirms payment → seller confirms receipt
  → fulfillment.
- **A `POST` with no body must not declare `content-type: application/json`.**
  `/sign` and `/settlement/events` take an `Idempotency-Key` header and either
  no body or a command body; sending a JSON content-type with a zero-length body
  is rejected by Fastify's parser before the route's own validation runs, and the
  `400` says nothing about why. `Idempotency-Key` must match
  `^[A-Za-z0-9:_-]{8,100}$`.

## What cannot work in production as currently configured

Stated plainly, because the answer is "most of the product":

1. **The entire marketplace transaction pipeline.** All nine capabilities are
   mock-only; `live` throws unconditionally at
   `marketplace-provider.config.ts:125` and again in every provider factory.
   Under `NODE_ENV=production` the only legal value is `disabled`, so a
   production instance offers no identity verification, no contract artifact, no
   signing, no settlement, no promotion billing, no dispute evidence and no
   marketplace notification delivery. `scripts/compose-production.mjs:134-140`
   and `scripts/single-server-deployment.mjs:182` refuse the deploy outright if
   any of the nine is `mock`.
2. **Every shipped deployment artifact hard-codes production.**
   `docker/docker-compose.prod.yml:10` sets `NODE_ENV=production` and cannot be
   overridden without editing the file; `.helm/values.yaml:35` and
   `values-production.yaml:45` do the same, and `ecosystem.config.cjs:47` and
   the `Dockerfile` image default too. The documented lever for staging is the
   Helm value `config.nodeEnv: staging` (`values-production.yaml:13`). Compose
   has no such lever.
3. **Photograph upload**, in any environment, unless you provision a bucket
   yourself. `.helm/values-selection.yaml:21-24` declares
   `infrastructure.s3: bundled`, but no template or overlay backs that claim,
   and `.helm/` templates no `S3_BUCKET` at all.
4. **No deployment artifact seeds.** A fresh production database comes up
   schema-only, with `ADMIN_BOOTSTRAP_EMAILS` as the only way in.
5. **`.helm/values-production.yaml` cannot be applied as written** — all
   thirteen image tags are the literal `sha-REPLACE_WITH_RELEASE_GIT_SHA`.
6. **Reviewer demo credentials ship enabled in production**
   (`REVIEWER_ACCESS_ENABLED` defaults to `true`).
7. **Native/PM2 deployments cannot use** the `MONGODB_*_FILE`,
   `GRAFANA_ADMIN_PASSWORD_FILE`, `NOTIFICATION_*_PRIVATE_KEY_FILE`,
   `PAYME_SECRET_KEY_FILE`, `CLICK_SECRET_KEY_FILE` or `EDGE_TLS_*_FILE` secret
   indirections; `scripts/native-runtime-env.mjs` dereferences none of them.

None of this blocks the demo. It does mean the instance is a demonstration of a
product that is not yet production-configurable, and it should be described that
way.
