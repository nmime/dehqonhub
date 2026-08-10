## 1. Specification and ownership

- [ ] 1.1 Validate real Stage 1+2 domain, public-projection, provider-mock,
      cross-tenant, privacy-safe party projections, four-route persisted
      idempotency/CAS, and failure contracts.
- [ ] 1.2 Update durable requirements and version 3 evidence ownership for
      completed-only reviews, singular REQ-AGRITECH-PUBLIC-018 public discovery,
      provider operations, four locales, and local/trusted-runner assurance.
- [ ] 1.3 Synchronize Cucumber scenarios, executable-test requirement markers,
      project ownership, and exact-revision lanes before implementation.

## 2. Repository CI removal

- [ ] 2.1 Remove all GitHub Actions workflows and repository composite actions;
      retain collaboration metadata and npm/Docker Dependabot only.
- [ ] 2.2 Remove or replace workflow-coupled validators, scripts, tests, GitLab
      references, documentation, and OpenSpec mappings.
- [ ] 2.3 Add a static guard against repository workflow/action execution files
      and document lost hosted security/supply-chain/status capabilities honestly.

## 3. Uzbek script parity

- [ ] 3.1 Add canonical `uz-cyrl` parsing/types/full→script→language negotiation,
      switcher labels, persistence, and provider-safe locale mapping while retaining
      `uz` Latin.
- [ ] 3.2 Add complete Uzbek Cyrillic common, user, admin, landing, and bot
      catalog projects with semantic-key and placeholder parity.
- [ ] 3.3 Add authored Cyrillic product fields or an explicit non-translation
      fallback, plus the auth locale migration/entity constraint and rollback tests.
- [ ] 3.4 Browser-test both Uzbek scripts at desktop, 375 px, and 320 px.

## 4. Provider foundation and verification

- [ ] 4.1 Add typed per-capability `disabled | mock | live` configuration and
      production-startup/deployment rejection for mock mode.
- [ ] 4.2 Add persisted provider-operation idempotency/fingerprint/provenance and
      tenant/actor/resource uniqueness.
- [ ] 4.3 Implement real verification create/resume, mock OneID link, mock
      document evidence, submit, admin-only decision, duplicate detection, and
      sanitized user/admin DTOs with persisted keys and expected revisions.
- [ ] 4.4 Prove exact replay, changed-input conflict, different-key stale
      revision, concurrent review/link, tenant isolation, production config
      rejection, and approval-to-commerce authorization.

## 5. Public discovery and cross-organization commerce

- [ ] 5.1 Add publication/moderation state and dedicated sanitized public
      catalog/product/seller/search/request projection APIs governed by
      REQ-AGRITECH-PUBLIC-018, plus authenticated tenant-scoped publication
      status for the seller's bounded recent submissions.
- [ ] 5.2 Add explicit buyer/seller organization and tenant references for carts,
      requests, offers, contracts, reads, and audit while preserving private tenant
      isolation.
- [ ] 5.3 Complete catalog branches/attributes, seller profiles, matching,
      one-active-offer rules, seller carts, samples, and completed-only reviews.
- [ ] 5.4 Prove public allowlists, wrong-tenant/wrong-party denial, one-winner
      concurrency, publication replay/conflict, seller/request/source coherence,
      bounded cursor behavior, stock contention, request matching, sample quota,
      and review uniqueness in real PostgreSQL.

## 6. Contract artifacts, signing, payments, and completion

- [ ] 6.1 Persist immutable contract artifacts/template/checksum and implement
      generated watermarked mock-storage PDF download with authorized access.
- [ ] 6.2 Implement party-specific idempotent qualified-signature mock adapter and
      two-session signing bound to the same artifact revision.
- [ ] 6.3 Implement direct-payment and factoring records/state machines, mock bank
      events, reconciliation, timelines, notification intents, and dashboards.
- [ ] 6.4 Add fulfillment/dispute/completion, configured commission record, and
      eligibility effects with soft-delete/history retention.
- [ ] 6.5 Prove illegal/reordered/duplicate events, artifact immutability, party
      authorization, atomic completion, and reconciliation failure modes.

## 7. Promotions, dashboards, notifications, and AI

- [ ] 7.1 Implement persisted promotion plans/periods/activation and catalog-only
      ranking with visible `Ad` labels.
- [ ] 7.2 Implement supplier/farmer/buyer dashboard query models and admin
      moderation/audit queues from authorized real records.
- [ ] 7.3 Persist notification intents transactionally and expose channel status;
      mock external deliveries remain visibly simulated.
- [ ] 7.4 Implement grounded AI preview plus confirmed idempotent starter-cart
      command with stock revalidation and seller partitioning.
- [ ] 7.5 Prove promotions never influence matching/offers/AI, metrics are derived,
      notification intent atomicity, and AI cancel/replay/stale-product behavior.

## 8. DehqonHub user web frontend

- [ ] 8.1 Render real guest home/catalog/product/seller/public-request discovery
      using generated public clients and explicit sign-in gating for writes.
- [ ] 8.2 Complete verification wizard, bounded recent seller publication status,
      catalog/promotion tools, requests, offers, seller carts, samples,
      completed reviews/replies/reports, and role dashboards.
- [ ] 8.3 Complete artifact download, two-party signature status,
      direct/factoring timelines, fulfillment/dispute/completion, and
      notifications. Administrator UI is not part of this task.
- [ ] 8.4 Add AI starter-cart confirmation and authoritative 404/409 refresh that
      preserves safe form/dialog state.
- [ ] 8.5 Preserve keyboard/focus, safe areas, reduced motion, contrast, touch
      targets, and 320 px responsive behavior in all four locales.

## 9. Contracts, documentation, and cleanup

- [ ] 9.1 Regenerate and inspect user/admin OpenAPI, common contracts, generated
      clients, wrappers, locale projects, and setup closure after source stability.
- [ ] 9.2 Update API, auth, i18n, provider, migration, local verification,
      assurance, testing, command, security, deployment, and product documentation.
- [ ] 9.3 Remove only proven dead marketplace/CI boilerplate and confirm no route,
      wrapper, catalog, migration, artifact, or evidence owner is orphaned.

## 10. Verification and handoff

- [ ] 10.1 Run focused domain/API/admin/config/locale/provider tests and all
      touched project lint/typecheck/test/build targets.
- [ ] 10.2 Run real PostgreSQL migrations up/down/up, schema parity, tenant,
      idempotency, contention, artifact, payment/factoring, promotion, and AI tests.
- [ ] 10.3 Run acceptance with real domain adapters and the complete user-web
      browser journey, accessibility, Storybook interaction, 320 px responsive,
      and reviewed Darwin/pinned-Linux visuals. Keep multi-principal Docker
      fullstack as separate release evidence.
- [ ] 10.4 Run contract/client freshness, docs/tooling/static/security/audit,
      strict OpenSpec, `spec:validate`, impact selection, and exact-SHA verification.
- [ ] 10.5 Complete independent specification/security/release review, then commit
      and push with repository authorship only if every required local lane passes.

## 11. Narrowed completion gates

- [x] 11.1 Replace internal tenant/user/partner identifiers in authenticated cart,
      buyer-request, and offer responses with minimized party-safe projections.
- [x] 11.2 Add persisted `Idempotency-Key` plus expected-revision/CAS contracts to
      verification create/submit, delivery-quote update, and administrator
      verification decision, with replay, changed-input, and concurrency evidence.
- [x] 11.3 Complete every user-facing wrapper and responsive user-web view,
      including reloadable bounded recent seller publication status, and verify
      focused view behavior without claiming administrator or native-mobile
      presentation.
- [ ] 11.4 Execute authenticated multi-party fullstack, reviewed visuals, and
      clean exact-SHA assurance as separate release evidence.
