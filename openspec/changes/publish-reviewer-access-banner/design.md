# Design

## Context

`MarketplaceHome` rendered the reviewer banner behind
`products.some((product) => product.provenance === 'demo')`. That expression is a
statement about the catalog, but the question the product owner is actually
asking is "does this deployment publish reviewer credentials?" — a deployment
decision. The repository already has exactly one mechanism for browser-safe
per-deployment decisions: `window.__APP_RUNTIME_CONFIG__`, written into
`runtime-config.js` at container start and read synchronously through
`resolveFeatureFlag`.

## Goals

- Reviewer entry survives a live-only catalog.
- One switch, owned by the deployment, turns it off with no code change.
- The published identities remain unmistakably demo data.
- A reviewer learns where the prepared transactional evidence is without the page
  inventing numbers it cannot read.

## Non-goals

- No change to the guarded demo seed, the demo-catalog feature flag, or
  `REQ-AGRITECH-DEMO-024`'s projection rules.
- No authenticated-state variation: the banner is home-route furniture for the
  review build, not a session-aware widget.
- No hardcoded contract id, request count, or offer count in product copy.

## Decisions

### The flag is `reviewerAccessEnabled`, default enabled

`isReviewerAccessEnabled()` lives beside `isTelegramAuthEnabled()` in
`apps/frontend/app/src/shared/config/frontend-env.ts` and follows the same shape:

```ts
resolveFeatureFlag(
  getFrontendRuntimeConfig()['reviewerAccessEnabled'],
  getFrontendEnv()['VITE_REVIEWER_ACCESS_ENABLED'],
  true,
);
```

`docker/frontend-runtime-config.sh` emits the key from
`REVIEWER_ACCESS_ENABLED` through the existing `emit_flag` helper, which writes
a JSON boolean only for a parsable `true`/`false` and otherwise omits the key so
the build-time value keeps applying. `docker/docker-compose.prod.yml` passes
`REVIEWER_ACCESS_ENABLED` into the frontend runtime env block, and the Helm path
needs no template change because `frontendRuntimeConfig` is already a free map.

The third argument to `resolveFeatureFlag` is new. The alternative — inverting
the flag into `reviewerAccessDisabled` so the false default reads as "on" — was
rejected: it makes every deployment reason about a double negative, and an empty
or unparsable value would then silently publish credentials. With an explicit
default the fail-through direction is stated once, in the reader, next to the
comment that explains why this flag ships on.

### `MarketplaceHome` reads the flag directly

The home renderer calls `isReviewerAccessEnabled()` rather than taking a new
prop. `pages/auth` already reads its flag at the page boundary and this keeps the
already wide `SharedDiscoveryProps` unchanged. Because the reader resolves
`globalThis.__APP_RUNTIME_CONFIG__` on every call, a test proves the real
plumbing by stubbing that global instead of mocking the module.

### The copy is qualitative on purpose

The seeded evidence is three purchase requests, three offers, and one signed
contract worth 88,000,000 UZS between the buyer and seller identities. None of
that is readable from the public home page: the catalog projection carries
listings, and requests, offers, and contracts are private to their parties. So
the page states that a purchase request, competing offers, and a signed contract
are already prepared and tells the reviewer to open them after signing in.
Printing "3 offers" or the contract id would be a frontend claim about server
state that nothing on that route can verify, and it would rot on the next seed
run.

### The farmer identity is described as a dashboard role

A database trigger requires the buyer or seller verification role for a
marketplace transaction party, so the farmer account cannot trade. The role label
becomes "dashboard only" and its purpose line says the role cannot be a buyer or
seller party. This replaces the previous "purchase requests and samples" label,
which implied the opposite.

### Honesty lives in visible copy, not in an attribute

The banner renders a `dh-badge--warning` demo-accounts pill under its heading, a
notice naming the guarded demo seed and denying production activity, and one
purpose line per identity. The heading itself changes from "Explore the governed
demo catalog" — false on a live catalog — to "Demo reviewer accounts". The copy
control keeps its per-account accessible name and now meets the 44 px minimum
target.

## Alternatives considered

- **Delete the condition.** Rejected: it contradicts the durable requirement and
  leaves the deployment with no way to withdraw published credentials.
- **Keep the demo-provenance gate and re-enable the demo catalog.** Rejected: it
  would put labelled non-transactional listings back into a catalog the owner
  deliberately filled with real ones, to fix a banner.
- **Read the prepared counts from an API.** Rejected for this change: it needs a
  new public projection of private transactional state for the sake of banner
  copy.
