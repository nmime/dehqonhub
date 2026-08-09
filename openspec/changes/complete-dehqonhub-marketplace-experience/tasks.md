## 1. Contract and Baseline

- [x] 1.1 Strictly validate the complete OpenSpec artifact set and record the
      pre-change spec/test failures inherited from `origin/main`.
- [x] 1.2 Add `REQ-AGRITECH-MARKETPLACE-016` to the durable capability and
      version 3 sidecar with exact project ownership, acceptance disposition, and
      evidence inventory.
- [x] 1.3 Correct fetched executable-test markers that name requirements which
      do not own the containing Nx project.

## 2. Backend Authority and Persistence

- [x] 2.1 Expose stable `supplierId` in the product view contract and test the
      tenant-owned product mapping.
- [x] 2.2 Remove caller seller authority from cart and sample DTOs/services;
      derive it from tenant-active products and tenant-scope favorites, reviews,
      samples, carts, and AI queries.
- [x] 2.3 Enforce persisted verification, eligible roles, and approved
      buyer/supplier organizations for commercial mutations; deny self-offers
      and protect request/offer/contract ownership.
- [x] 2.4 Add contract source, frozen terms, and actor-specific consent fields
      through a forward/down-tested nullable migration.
- [x] 2.5 Make cart checkout compute authoritative terms and atomically create a
      persisted draft contract instead of a random order identifier.
- [x] 2.6 Make offer selection atomically accept one offer, decline alternatives,
      select the request, and create one idempotently sourced draft contract.
- [x] 2.7 Make signing party-specific and activate only after both consents;
      remove arbitrary public party creation and force financing unavailable.
- [x] 2.8 Use canonical RFC 9457 exceptions and dedicated success DTOs whose
      OpenAPI schemas match checkout, favorite, offer-selection, and contract state.
- [x] 2.9 Add focused service, policy, repository, transaction, tenant-security,
      organization-authorization, AI-grounding, migration, and rollback tests.
- [x] 2.10 Commit cart-backed inventory exactly once on final consent, quarantine
      unprovable legacy contracts with audit evidence, serialize supplier stock
      edits with final consent, and prove those behaviors against real PostgreSQL
      concurrency and populated upgrades.
- [x] 2.11 Require activated/completed purchase provenance and database
      uniqueness for reviews; store verification rejection as localized semantic
      codes and normalize legacy values.
- [x] 2.12 Serialize competing verification decisions, make favorites
      concurrency-idempotent, and freeze cart/offer delivery quotes against
      unilateral revision; require a supported rejection reason only for rejected
      verification decisions at DTO, domain, and persistence boundaries.
- [x] 2.13 Bound integer UZS and delivery inputs to persistence-safe values,
      reject non-meaningful commercial strings, document conditional seller
      quotes, and prove authentication, validation, authorization, conflict,
      tenant isolation, and successful marketplace responses over Fastify.
- [x] 2.14 Validate every public UUID before persistence, bound supplier price
      and stock to their numeric database types, and align canonical delivery
      constraint metadata with the migrated PostgreSQL schema.

## 3. Generated Contracts

- [x] 3.1 Generate OpenAPI documents from the corrected source and inspect the
      marketplace paths and schemas.
- [x] 3.2 Regenerate the user TypeScript client once and update all consumers
      without casts or compatibility shims.
- [x] 3.3 Pass OpenAPI lint, contract freshness, generated client freshness,
      consumer contract, and affected backend/user API build gates.
- [x] 3.4 Move DehqonHub commerce APIs and generated consumers to the
      collision-free `/marketplace/*` namespace without aliases, while keeping
      canonical browser deep links at their existing paths.

## 4. Marketplace Application Architecture

- [x] 4.1 Replace local view state with canonical TanStack routes for home,
      catalog, product detail, favorites, carts, requests, verification, account,
      and contract detail.
- [x] 4.2 Bypass the generic mini-app shell only for marketplace routes while
      preserving providers, history, focus, and every unrelated user route.
- [x] 4.3 Build a shared marketplace model with granular catalog, verification,
      cart, favorite, sample, request, offer, contract, and AI resource states.
- [x] 4.4 Preserve signed-out entry/auth routing and authenticated unverified
      browsing without treating denied or failed resources as empty success.
- [x] 4.5 Implement typed pending, success, validation, denied, conflict,
      unavailable, offline, retry, and stale-state mutation feedback.

## 5. Complete DehqonHub Journeys

- [x] 5.1 Build the reference-informed home discovery hierarchy with real
      category shelves, scenario actions, order explanation, and honest empty data.
- [x] 5.2 Build functional catalog search, deterministic branch mapping, price,
      region and stock filters, sorting, active-filter reset, and mobile controls.
- [x] 5.3 Build product detail, safe image fallback, quantity, seller/stock facts,
      favorite, sample confirmation, delivery boundary, and add-to-cart actions.
- [x] 5.4 Build favorites and seller-partitioned cart review with quantity/remove,
      authoritative totals, delivery selection, verification gate, and checkout
      confirmation leading to contract review.
- [x] 5.5 Build purchase-request creation, seller offer form, buyer offer
      comparison/selection confirmation, stale-state recovery, and deep-linked
      selected contract review.
- [x] 5.6 Build verification status/role/document-requirement states without
      fake OneID or uploads, including pending, verified, rejected, and unavailable.
- [x] 5.7 Build role-aware account summaries, sample allowance/status, contract
      list/detail timeline, both-party consent, and disabled payment/financing state.
- [x] 5.8 Build the accessible grounded AI panel with semantic prompts, typed
      submission, pending/error/close/focus behavior, cautious disclosure, and real
      referenced product cards without autonomous mutations.

## 6. Visual System and Localization

- [x] 6.1 Keep the legacy shared AgroUz layer stable for its existing route and
      place all new DehqonHub composition in the user application without reusing
      or expanding the global product classes.
- [x] 6.2 Implement scoped warm-marketplace light/dark tokens, accessible green
      action contrast, repository-owned SVG icons, real-image fallback, focus rings,
      and reduced-motion behavior.
- [x] 6.3 Implement desktop density plus tablet/mobile reflow with 44 px controls,
      320 px no-overflow, Russian 375 px expansion, mobile navigation, and filter
      disclosure behavior.
- [x] 6.4 Synchronize English, Russian, and Uzbek semantic keys, locale-aware
      values and DehqonHub brand; remove hardcoded and unsupported legal/bank/payment
      claims and validate typed catalog parity.

## 7. Executable Evidence

- [x] 7.1 Add five independently phrased Cucumber acceptance scenarios whose
      steps invoke the production marketplace domain service through a public
      in-memory adapter for seller-derived carts, persisted checkout contracts,
      offer-contract creation, party-specific consent, and organization approval.
- [x] 7.2 Add marketplace component tests for catalog filtering and query sync,
      unavailable sample and offer recovery, closed-request controls, offer and
      delivery forms, seller-separated carts, provider absence, contract consent
      and identity recovery, and grounded AI dialog focus.
- [x] 7.3 Repair root, back/history, local-storage, Storybook, browser-e2e, and
      fullstack assertions for DehqonHub while proving unrelated routes survive.
- [x] 7.3a Add real PostgreSQL component coverage for populated migration,
      concurrent final-sign inventory conflict, and grounded search beyond the
      result limit, and map it with an authenticated marketplace fullstack path.
- [x] 7.3b Route `/marketplace/*` through both Docker and Helm same-origin
      frontend proxies and make deployment validation reject a missing rule.
- [x] 7.4 Run focused backend, frontend, i18n, API, FSD, typecheck, lint, test,
      build, Cucumber, migration, static browser and generated-artifact gates.
- [x] 7.5 Run live browser keyboard, dialog, deep-link, light/dark, 320 px,
      Russian 375 px, desktop, reduced-motion, image-failure, and horizontal-overflow
      checks with screenshots.

## 8. Assurance and Delivery

- [x] 8.1 Run strict `spec:validate`, requirement impact from the exact remote
      base, and the selected exact-revision `spec:verify` PR lane.
- [x] 8.2 Run independent `review-specification-assurance`; resolve every finding
      or record a precise external/runtime residual risk.
- [x] 8.3 Verify migration rollback text, provider fail-closed copy, clean status,
      `git diff --check`, authored commit identity, and no secret/generated drift.
- [x] 8.4 Commit with repository authorship, push the focused feature branch,
      open a pull request, and prove branch/remote parity without deploying.
