# Publish MVP reviewer access behind a deployment flag

## Why

A state commission reviews this build and has to sign in as each product role.
The home route already had a reviewer-credentials banner
(`MarketplaceDemoBanner`, fed by `demo-accounts.ts`), but it disappeared from the
product owner's home page.

The cause is specified behavior, not a bug. `REQ-AGRITECH-EXPERIENCE-026` allowed
the identity list "only while API-governed demo listings are present", and the
home renderer implemented exactly that with
`products.some((product) => product.provenance === 'demo')`. The governed demo
flag is now off on purpose: the catalog serves real transactional listings and no
demo listings, so the gate closed and the banner vanished. Restoring it therefore
requires changing the requirement, not deleting the condition.

Two further facts make the old copy wrong rather than merely invisible:

- The banner's heading invited the visitor to "explore the governed demo
  catalog". On a live catalog that sentence is false.
- The role list implied the farmer identity trades. A database trigger requires a
  marketplace transaction party to hold the `buyer` or `seller` verification
  role, so the farmer account is a farmer-dashboard identity and can never be a
  party to a deal.

## What Changes

- Gate reviewer entry on an explicit per-deployment flag instead of catalog
  provenance. `reviewerAccessEnabled` joins the existing browser runtime-config
  mechanism (`public/runtime-config.js`, rewritten at container start by
  `docker/frontend-runtime-config.sh`) and is read through
  `resolveFeatureFlag`. It ships **enabled** for this review build; a deployment
  withdraws the identity list with `REVIEWER_ACCESS_ENABLED=false` and no code
  change.
- Give `resolveFeatureFlag` an explicit `defaultValue`, so a flag that ships on
  keeps the same runtime → build → default precedence as every other flag
  instead of being expressed as an inverted "disabled" flag.
- Make the banner say what the owner asked for: a visible demo-accounts label, an
  honesty notice naming the guarded demo seed, each role's purpose including the
  farmer account's dashboard-only limit, and a qualitative statement that a
  purchase request, competing offers, and a signed contract are already prepared
  between the buyer and seller identities. Counts and the contract id stay out of
  the copy because the public home page cannot read them.
- Modify `REQ-AGRITECH-EXPERIENCE-026`: the reviewer-identity clause, the
  account-entry invariant that bound the identities to demo provenance, and the
  scenario that asserted a live-only catalog publishes no identity list.
- Document the flag where the other runtime flags are documented and update the
  component, coverage, Storybook, and browser evidence that asserted the old
  gate or the old English copy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`

## Impact

Owned by `user-app`, `@app/frontend-feature-user-i18n` (the four locale
catalogs), and the `TranslationKey` union. `@app/frontend-api-support` gains one
optional parameter on `resolveFeatureFlag` with unchanged behavior for existing
callers. `docker/frontend-runtime-config.sh`, `docker/docker-compose.prod.yml`,
and `docs/frontend-deployment-topology.md` carry the deployment switch. No API
schema, persistence, authorization, or contract version changes.

`REQ-AGRITECH-DEMO-024` was inspected and is deliberately left unmodified: it
owns the administrator-governed demo **catalog** projection, not the frontend
identity list. The clauses that owned this behavior are all inside
`REQ-AGRITECH-EXPERIENCE-026`, which is what this change modifies.

The delta in `specs/agritech-marketplace/spec.md` carries the requirement's
complete current text so the modified wording can be read in place. Only the
reviewer-identity clause, the account-entry invariant, and the reviewer scenario
belong to this change.

## Rollout

Presentation and configuration only, one immutable `user-app` revision. The flag
defaults to enabled, so the review build needs no environment entry; a
deployment that must not carry the identities sets
`REVIEWER_ACCESS_ENABLED=false`.

## Rollback

Set `REVIEWER_ACCESS_ENABLED=false` on the running deployment — the banner
disappears at the next container start with no rebuild. Redeploying the previous
`user-app` revision also works and restores the provenance gate.

## Risk

- Disclosure risk: working credentials are published on a public page. This is
  the owner's deliberate, approved choice for a commission review. Mitigated by
  the accounts being demo-seed-only, by the copy saying so, and by the identity
  list being one deployment flag away from off.
- Honesty risk: a reviewer could read seeded activity as production activity.
  Mitigated by the visible demo label, the notice naming the guarded demo seed,
  and copy that never claims real trade.
- Drift risk: precise counts or a contract id in page copy would rot. Mitigated
  by qualitative copy — the page states that a request, competing offers, and a
  signed contract exist, and never how many or which.
