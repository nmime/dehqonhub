## 1. Specification

- [x] 1.1 Record the defect as specified behaviour: `REQ-AGRITECH-MARKETPLACE-016` named `buyer` as the only accepted buying role, so the database was doing exactly what the requirement said.
- [x] 1.2 Modify `REQ-AGRITECH-MARKETPLACE-016` in place: every persisted party-coherence invariant accepts the roles the role policy authorizes for its side, and the role policy is one authority that repository and trigger predicates derive from.
- [x] 1.3 Modify `REQ-AGRITECH-ONBOARDING-023` in place: a prerequisite the actor can still clear is named exactly and offered as a next action, while a capability outside the verified role states which roles hold it and offers no next action.
- [x] 1.4 Modify `REQ-AGRITECH-EXPERIENCE-026` in place: the reviewer identities state each role's real reach, including that the farmer identity buys everything and sells everything.
- [x] 1.5 Keep the version 3 sidecar valid: the migration static evidence and the commerce component evidence carry descriptions naming what they falsify.

## 2. Implementation

- [x] 2.1 Add `Migration20260811110000AlignMarketplaceBuyerPartyRole` and register it last in `migrations/index.ts`.
- [x] 2.2 Add `marketplace-role-predicates.ts` and route every repository role filter and hand-written SQL role list through it.
- [x] 2.3 Replace the inline role literals in `marketplace.repository.ts`, `marketplace-contract-lifecycle.repository.ts`, `marketplace-engagement.repository.ts`, `marketplace-promotion.repository.ts`, `marketplace-dashboard-ai.repository.ts` and `marketplace-public.repository.ts`.
- [x] 2.4 Add `marketplaceRoleCanBuy` and `marketplaceRoleCanSell` to `marketplace-ui.ts`.
- [x] 2.5 Stop withholding the sample allowance from a verified farmer in `use-marketplace-data.ts`.
- [x] 2.6 Correct the reviewer identity copy in all four locales, and the comment in `demo-accounts.ts` that justified the "dashboard only" wording with the persisted defect.
- [x] 2.7 Rewrite the role-capability access copy in all four locales so a blocked buying or selling control states an absent capability instead of a missing verification step.
- [ ] 2.8 Apply the delivered patch for `marketplace-page.tsx`, `marketplace-commerce.tsx` and their two affected suites: the role branches read the shared predicates, and a role-blocked control keeps its hint while carrying no action label, no entry point and no navigation. Those files are owned by concurrent work in this tree, so the patch is delivered and verified rather than applied.

## 3. Evidence

- [x] 3.1 Add `marketplace-buyer-party-role.migration.spec.ts`: the migration runs last, replaces exactly the four buying-side functions, drops no trigger, widens only the buying predicate, keeps the widened selling predicate, and restores the pre-migration predicate on rollback.
- [x] 3.2 Extend `marketplace-commerce.component-spec.ts`: a farmer-verified buying party reaches a cart, its contract and a resolved purchase request, and a seller-verified actor holding a buyer membership is still refused.
- [x] 3.3 Add the falsification to the same component suite: the exact resolved-cart insert succeeds under the migrated predicate, the migration's own `down()` restored inside a transaction reproduces `23514`, the rollback puts the widened predicate back, and no probe leaves a row behind.
- [x] 3.4 Prove both states over real HTTP on the local stand with the seeded farmer login, against the pre-fix build and the rebuilt one.
- [x] 3.5 Run the postgres-agritech unit and component suites, the agritech feature suite, the user-app suite, typecheck, lint, Prettier and strict OpenSpec validation.
- [ ] 3.6 Run the Playwright and fullstack runtime lanes. Not executed in this environment.

## 4. Documentation and rollback

- [x] 4.1 State in the migration and in `marketplace-role-predicates.ts` why a persisted rule stricter than the authorization layer is a defect rather than defence in depth.
- [x] 4.2 Record the rollback: `down()` restores each function separately and leaves the selling side to its own migration.
- [ ] 4.3 Rehearse the rollback against a disposable database with `db:migrations:rollback-check`.

## 5. Release

- [ ] 5.1 Commit and push the exact revision with repository authorship.
- [ ] 5.2 Collect exact-SHA assurance evidence.
- [ ] 5.3 Confirm on a deployment that the seeded farmer can buy and that a seller reads an absent capability with no next action.
