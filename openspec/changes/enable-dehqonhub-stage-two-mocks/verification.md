## Assurance ownership

- Product verification owner: `quality-engineering`.
- Security verification owner: `security-maintainers`.
- Persistence/concurrency owner: `database-maintainers`.
- Operations verification owner: `platform-operations`.
- The implementation author does not provide the final exact-revision review.

## Current evidence status

- This file records required mappings and locally exercised lanes; it is not an
  exact-revision dossier for the current uncommitted workspace.
- Clean-commit `spec:verify`, authenticated multi-party Docker fullstack,
  accessibility, and reviewed visual evidence remain unverified unless a
  separate exact-source report records their execution.
- A mapped test or target is not credited as proof merely because its file
  exists or an older dossier passed.
- Locally executed direct evidence covers identifier minimization for
  authenticated cart/request/offer DTOs, the four hardened replay/CAS routes,
  authenticated bounded recent publication status, and complete user-web view
  presentation. Administrator and native-mobile presentation are not mapped or
  claimed.

## Requirement evidence plan

### REQ-AGRITECH-WEB-006

- Risk: high.
- Projects: `user-app`, `@app/frontend-api-client`, and
  `@app/frontend-feature-user-i18n`.
- Profiles: API and journey.
- Cucumber disposition: not applicable; request-state rendering and
  generated-client use are mapped to typed production builds, focused Vitest,
  and a route-mocked Playwright journey in the durable version 3 sidecar.
- Mapped evidence:
  - Focused user marketplace view Vitest for guest, buyer, seller, farmer,
    action, partial-failure, and responsive state plus the generated user-client
    build.
  - `user-app:e2e-authenticated` typechecks the browser fixture, builds the
    production user app, and exercises causal route-mocked management,
    verification, notification, dashboard, AI, offer-selection, and contract
    lifecycle presentation at 320 px, 375 px, and desktop widths. It asserts
    request issuance, explicit simulation labels, recovery, focus containment,
    artifact download, and horizontal-overflow bounds. It does not prove
    authentication, persistence, provider execution, two-party signing, or
    PostgreSQL state transitions.
  - Endpoint-to-wrapper-to-view inventory covers every distinct marketplace
    workflow. Authenticated `GET /marketplace/catalog/{id}` intentionally has no
    separate browser view: guest and signed-in product detail use the privacy-safe
    public publication projection, while seller source management uses
    `/supplier/products` plus bounded owned-publication receipts.
  - Administrator SPA and native Expo/Android/iOS marketplace journeys are
    explicitly out of scope. Multi-party Docker fullstack remains separate
    release evidence and is not claimed by these source-lane mappings alone.

### REQ-AGRITECH-I18N-012

- Risk: high.
- Projects: `@app/common-i18n-runtime`, `@app/common-i18n-keys`,
  `@app/backend-common-i18n`, `@app/frontend-runtime`,
  `@app/frontend-ui-web`, `@app/frontend-feature-user-i18n`,
  `@app/frontend-feature-admin-i18n`, `@app/backend-feature-auth-main`,
  `@app/backend-postgres-main-auth`, `auth-app-api`, every scoped `en`, `ru`,
  `uz`, and `uz-cyrl` asset project, provider adapters, `user-app`, and
  `admin-app`.
- Profiles: API, domain, persistence, journey.
- Cucumber disposition: mapped alternative; exact catalog/placeholder parity,
  BCP 47 resolution, database constraint, provider-code filtering, and rendered
  switcher behavior are more directly challenged by static, migration, unit,
  and browser tests.
- Planned evidence:
  - Runtime unit tests for `uz-Cyrl-UZ`, underscore/case input, canonical
    persistence, full→script→language order, and unsupported fallback.
  - Static key and `{{placeholder}}` parity tests across every scoped catalog.
  - Real PostgreSQL auth-locale migration up/down/up, legacy preservation, and
    `uz-cyrl -> uz` rollback proof.
  - Telegram/Discord/payment provider boundary tests for safe locale mapping.
  - Switcher/profile/fullstack tests for both Uzbek scripts and responsive
    rendering.

### REQ-AGRITECH-INTEGRATION-013

- Risk: critical.
- Projects: `@app/backend-feature-agritech-shared`,
  `@app/backend-feature-agritech-main`, `@app/backend-feature-agritech-admin`,
  `@app/backend-postgres-main-agritech`, `user-app-api`, `admin-app-api`,
  provider-owned notification/payment projects, and `@repo/tooling`.
- Profiles: API, domain, persistence, security, operations.
- Cucumber disposition: selected for provider outcome semantics, supplemented by
  config and real-database evidence for production rejection, idempotency, and
  atomicity.
- Planned evidence:
  - Configuration matrix: disabled by default; mock development/test/staging only;
    production mock and incomplete live config reject before listen.
  - Provider port/adapter tests proving mock adapters make no network request and
    return synthetic namespaced receipts.
  - PostgreSQL component tests for same-key replay, changed-input conflict,
    concurrent operation uniqueness, callback ordering, reconciliation, and
    tenant/actor isolation.
  - The standalone provider-operation component owns migration up/down/up,
    verification/contract/promotion resource anchoring, attempt fencing,
    provider-event uniqueness, result fingerprints, flat safe receipts, and
    reconciliation-required persistence for every declared capability family.
  - User/admin HTTP tests proving raw provider subjects, storage keys, identity
    fingerprints, and unrestricted payloads never enter public/user responses.
  - Secrets/SAST/audit plus deployment validators that reject mock production
    configuration.

### REQ-AGRITECH-MARKETPLACE-016

- Risk: critical.
- Projects: `user-app`, `user-app-api`, `admin-app-api`,
  `@app/frontend-api-client`,
  `@app/backend-feature-agritech-shared`,
  `@app/backend-feature-agritech-main`,
  `@app/backend-feature-agritech-admin`,
  `@app/backend-postgres-main-agritech`, and `acceptance-e2e`.
- Profiles: acceptance, API, domain, persistence, and security.
- Cucumber disposition: selected; acceptance must exercise production domain
  behavior, while real PostgreSQL evidence proves authorization, persistence,
  and contention.
- Planned evidence:
  - Cucumber seller-partitioned cart, checkout, offer selection, organization-
    approval denial, and verification denial through the production domain
    service adapter. Obsolete signature scenario `SCN-AGRITECH-MARKETPLACE-04`
    is not mapped or replaced.
  - Private endpoint tenant/party authorization tests; public DTO allowlists and
    anonymous visibility belong to REQ-AGRITECH-PUBLIC-018.
  - User/admin HTTP and domain mapper tests asserting cart, buyer-request,
    offer, and contract payloads omit internal
    tenant/user/partner/source/provider identities while retaining opaque
    relations and actor-safe snapshots:
    `apps/backend/user/user-app-api/src/marketplace.e2e-spec.ts`,
    `apps/backend/admin/admin-app-api/src/agritech-marketplace.e2e-spec.ts`, and
    the marketplace service specifications.
  - User/admin HTTP tests plus PostgreSQL unit/component contention proving all
    four hardened routes require a safe idempotency key and expected revision,
    replay the exact first snapshot, reject changed input, reject different-key
    stale revisions, and allow only one concurrent compare-and-set winner. The
    direct owners are `marketplace-verification.service.spec.ts`,
    `marketplace.service.spec.ts`, `marketplace.repository.spec.ts`, and
    `marketplace-concurrency.component-spec.ts` under their canonical projects.
  - Migration evidence for persisted command identity and aggregate revision
    fields, including rollback compatibility, is owned by
    `marketplace-command-hardening.migration.spec.ts`.
  - Real PostgreSQL tests for explicit party tenancy, seller-cart uniqueness,
    offer/source uniqueness, and contract-freeze contention. Artifact,
    qualified-signature activation, settlement, fulfillment, disputes,
    commission, and review eligibility belong to REQ-AGRITECH-LIFECYCLE-020.
  - Client rendering belongs to REQ-AGRITECH-WEB-006. No multi-party
    browser/fullstack execution is claimed by this local evidence plan.

### REQ-AGRITECH-STAGE2-017

- Risk: critical.
- Projects: all owners named by the requirement.
- Profiles: acceptance, API, domain, persistence, and security.
- Cucumber disposition: selected for persisted verification, catalog-only
  promotion, and confirmed grounded starter-cart behavior.
- Mapped evidence:
  - Cucumber scenarios `SCN-AGRITECH-STAGE2-01` through `03`; the unrelated
    `SCN-AGRITECH-MARKETPLACE-*` scenarios are not credited here.
  - Verification, promotion, dashboard, and grounded-AI domain/API tests plus
    promotion/dashboard/provider-operation PostgreSQL component and migration
    evidence.
  - Public discovery belongs to REQ-AGRITECH-PUBLIC-018, engagement to
    REQ-AGRITECH-ENGAGEMENT-019, artifact/signature/settlement/fulfillment/
    dispute/commission/review eligibility to REQ-AGRITECH-LIFECYCLE-020, and
    notification delivery to REQ-AGRITECH-NOTIFICATION-022.
  - Fullstack/browser/accessibility/visual and clean exact-SHA proof are not
    mapped or claimed by REQ-AGRITECH-STAGE2-017 in this local stabilization.

### REQ-AGRITECH-PUBLIC-018

- Risk: critical.
- Projects: `user-app-api`, `admin-app-api`, `acceptance-e2e`,
  `@app/backend-feature-agritech-main`,
  `@app/backend-feature-agritech-admin`,
  `@app/backend-feature-agritech-shared`, and
  `@app/backend-postgres-main-agritech`.
- Profiles: acceptance, API, domain, persistence, security.
- Cucumber disposition: selected for the stakeholder-visible moderation,
  anonymity, cross-organization visibility, and privacy boundary. Cucumber does
  not replace real PostgreSQL coherence/contention or injected HTTP response
  evidence.
- Planned evidence:
  - Cucumber: one approved opt-in publication is anonymously visible; pending,
    rejected, paused, suspended, revoked, inactive, exhausted, and expired
    records remain absent; Product and Produce payloads are discriminated and
    private fields remain absent; wrong-tenant and changed-input publication
    commands fail without another row; unreviewed descriptive edits remain
    hidden while the prior seller snapshot and live price/stock stay
    authoritative; moderation decides one bound seller/publication revision;
    seller-profile rejection terminates only still-pending listings pinned to
    that immutable revision while prior approved records remain visible;
    and bounded keyset pages reject malformed, noncanonical, oversized, or
    sort-mismatched cursors before persistence.
  - Domain Vitest: cursor/search/filter/limit bounds, malformed and noncanonical
    cursor rejection, explicit DTO mapping, four authored title fields,
    Product/Produce discriminator validation, and publication
    result-to-problem mapping.
  - Authenticated user API and repository evidence for
    `GET /marketplace/publications/mine?limit=1..50`: tenant-and-user-scoped
    newest-first bounded status after refresh, safe receipt allowlist,
    foreign-actor absence, and bounded query behavior. Generated-client
    consumption and refreshed browser rendering belong to REQ-AGRITECH-WEB-006.
  - Repository security Vitest: current verification and approved organization
    locks precede source access, owner/tenant/source/request binding, snapshot
    derivation, exact replay, changed-input conflict, and hidden-state equality
    predicates.
  - Real PostgreSQL component: composite coherence enforcement, concurrent first
    seller/publication creation, same-key contention, opt-in/no-backfill
    migration behavior, immutable seller-revision fan-out, independent
    listing/profile decisions, and negative corrupt-row/read tests.
  - User API injected HTTP: auth-optional reads, no session creation, DTO
    discriminator/allowlists, no tenant-selector contract, bounded query
    validation, safe hidden 404/empty results, authenticated publication
    authorization, and RFC 9457 400/401/403/404/409 outcomes.
  - Admin API injected HTTP: permission-gated moderation queues and decisions,
    tenant-scoped review, expected-revision conflict, and approved/rejected
    visibility transitions without private-field reflection.
  - Migration static: exactly-one-source checks, public snapshot/moderation
    columns, tenant-owner indexes/coherence controls, bounded numeric/date
    shapes, and dependency-safe pre-traffic rollback ordering.

### REQ-AGRITECH-ENGAGEMENT-019

- Risk: critical.
- Projects: `user-app`, `user-app-api`, `admin-app-api`, `acceptance-e2e`,
  `@app/backend-feature-agritech-main`,
  `@app/backend-feature-agritech-admin`,
  `@app/backend-feature-agritech-shared`, and
  `@app/backend-postgres-main-agritech`.
- Profiles: acceptance, API, domain, persistence, and security.
- Cucumber disposition: selected for opaque favorite replay, the stakeholder
  sample-quota and exact-party flow, and the separation between review
  reporting and moderation. Real PostgreSQL component evidence remains
  authoritative for contention, tenant coherence, quotas, aggregates, and
  legacy retention.
- Mapped evidence; any local execution is not clean exact-revision proof:
  - Cucumber: actor-operation idempotency across opaque listings, five-per-UTC-
    month sample quota with exact-party ordered delivery, and one deal-verified
    review whose report does not hide it before moderation.
  - Domain Vitest: server UTC month/season derivation, ordered sample states,
    safe review text/assets, canonical fingerprints, delivery quote bounds, and
    safe conflict mapping.
  - User/admin injected HTTP and OpenAPI: session/RBAC enforcement,
    principal-derived actor and tenant, unknown private-field rejection,
    public verified-review projection, bounded moderation/policy routes, and
    user/admin DTO denylists.
  - Real PostgreSQL component: global actor-operation idempotency across
    resources, concurrent quota and source-season enforcement, exact-party and
    parent-identity corruption rejection, atomic review-eligibility
    consumption, serialized two-buyer aggregates, moderation deltas, and
    populated legacy archive up/down/up retention.
  - Migration static: canonical index names, ordered `136000 -> 137000 ->
138000`, immutable audit/outbox/operation state, quota and coherence
    triggers, non-lossy rollback fencing, and archive restoration.
  - Frontend component interaction: catalog/favorite/account states, explicit
    sample availability and quota states, and review authoring only after
    completed purchase eligibility. Browser execution remains unverified.

### REQ-AGRITECH-LIFECYCLE-020

- Risk: critical.
- Projects: `user-app-api`, `admin-app-api`,
  `@app/backend-feature-agritech-main`,
  `@app/backend-feature-agritech-admin`,
  `@app/backend-feature-agritech-shared`, and
  `@app/backend-postgres-main-agritech`.
- Profiles: API, domain, persistence, security, and operations.
- Cucumber disposition: not applicable; provider crash gaps, cross-key
  concurrency, multipart streaming, PDF privacy, settlement ordering, and
  transaction rollback require direct HTTP, document, state-machine, and real
  PostgreSQL evidence.
- Mapped evidence:
  - PDF and provider-config Vitest, the lifecycle controller build, and the
    injected user lifecycle HTTP suite.
  - Real PostgreSQL provider-operation and lifecycle components plus dispute-
    evidence migration static coverage.
  - These mappings do not by themselves claim the full two-party browser flow or
    a clean exact-revision release dossier.

### REQ-AGRITECH-NOTIFICATION-022

- Risk: critical.
- Projects: `@app/backend-common-i18n`, `@app/common-i18n-keys`,
  `@app/backend-feature-agritech-main`,
  `@app/backend-feature-agritech-admin`,
  `@app/backend-feature-agritech-shared`,
  `@app/backend-postgres-main-agritech`, `notification-scheduler`, and
  `@repo/tooling`.
- Profiles: API, domain, persistence, security, localization, and operations.
- Cucumber disposition: not applicable; lease contention, crash gaps, provider
  outcomes, receipt validation, and query authorization are backend invariants
  proven directly through injected controllers, state-machine tests, real
  PostgreSQL, and deployment validation.
- Mapped evidence; any local execution is not clean exact-revision proof:
  - Domain Vitest: four-catalog rendering, channel-scoped idempotency, explicit
    no-network mock Telegram/SMS, bounded retry, definite rejection, unknown
    outcome reconciliation, provider provenance/receipt validation, and
    provider-success completion persistence failure fencing.
  - User/admin injected controller tests: principal-derived tenant and locale,
    active party/permission boundaries, safe recipient DTO allowlist, and
    separate richer administrator status.
  - Repository security Vitest and real PostgreSQL component: concurrent
    skip-locked claims, locale freeze, stale-token/lease quarantine, monotonic
    attempts, deterministic critical Telegram-to-SMS fallback, terminal
    immutability, party/admin read isolation, and migration down/up before
    delivery traffic.
  - Scheduler and setup-planner Vitest: provider-neutral generated composition,
    cron ownership, disabled mode, and production mock/live fail-fast behavior.
  - Deployment tests: every marketplace provider mode and timeout appears in
    environment/Compose parity, and notification or dispute-evidence mock modes
    are rejected by production Compose and single-server validation.

## Evidence quality constraints

- Every new executable test file carries requirement markers owned by its Nx
  project; no behavior is credited to a mock-only assertion that bypasses the
  production domain service.
- Public-projection evidence asserts both the allowlist and absence of private
  fields. Serializer snapshots alone are insufficient.
- Authorization evidence uses distinct authenticated buyer, seller, and admin
  principals and approved/suspended organization fixtures.
- Idempotency evidence challenges same-key/same-input, same-key/different-input,
  concurrency, and rollback after downstream failure in real PostgreSQL.
- Mock-provider tests assert no network call, production config rejection,
  persisted provenance, visible disclosure, and no authority grant.
- Payment/factoring evidence never equates state transition with money movement.
- Visual baseline updates require per-image review; accessibility and interaction
  tests are separate proof.
- Final assurance runs from a clean committed SHA. Deleted GitHub workflows and
  skipped required gates are not evidence.

## Runner-neutral lanes

- PR/local preflight: focused Nx lint/typecheck/test/build, DTO/API tests,
  locale/static checks, migrations check, generated freshness, `ci:pr`,
  browser smoke, and dry-run spec selection.
- Main/trusted runner: real PostgreSQL component suites, migration rollback,
  user/admin applications, acceptance, authenticated Docker fullstack,
  accessibility, Storybook, reviewed visuals, security/audit, and exact-SHA
  impacted verification.
- Nightly/runtime labels remain logical OpenSpec profiles for any trusted runner;
  the repository no longer provides GitHub-hosted schedules, artifacts, status
  checks, CodeQL, Scorecard, dependency review, image signing, or automatic
  promotion.
