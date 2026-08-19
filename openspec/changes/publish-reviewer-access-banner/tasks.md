## 1. Specification

- [x] 1.1 Record the owner decision: the home page publishes the MVP reviewer accounts, and a deployment must be able to withdraw them.
- [x] 1.2 Determine which requirement owns the clause: `REQ-AGRITECH-EXPERIENCE-026`, not `REQ-AGRITECH-DEMO-024`.
- [x] 1.3 Modify `REQ-AGRITECH-EXPERIENCE-026` in place, keeping the stable identifier: the reviewer-identity clause, the account-entry invariant, and the reviewer scenario.
- [x] 1.4 Keep the version 3 evidence sidecar valid; the modified behavior stays inside already-mapped `user-app` evidence.

## 2. Implementation

- [x] 2.1 Add the `defaultValue` argument to `resolveFeatureFlag` so a flag can ship enabled without inverting its name.
- [x] 2.2 Add `isReviewerAccessEnabled()` reading `reviewerAccessEnabled` / `VITE_REVIEWER_ACCESS_ENABLED`, defaulting to enabled.
- [x] 2.3 Emit `reviewerAccessEnabled` from `REVIEWER_ACCESS_ENABLED` in `docker/frontend-runtime-config.sh` and pass it through the prod compose frontend runtime env.
- [x] 2.4 Gate `MarketplaceDemoBanner` on the flag in `MarketplaceHome` instead of on demo provenance.
- [x] 2.5 Add the visible demo-accounts label, the guarded-demo-seed notice, and per-role purpose lines including the farmer's dashboard-only limit.
- [x] 2.6 Add the qualitative prepared-evidence row pointing at purchase requests and contracts.
- [x] 2.7 Add the six new keys to all four locale catalogs and to the `TranslationKey` union; retitle the banner so it no longer invites the visitor to explore a demo catalog.
- [ ] 2.8 Merge the banner stylesheet handoff into `apps/frontend/app/src/pages/marketplace/ui/marketplace.css`. Handed to the shared-CSS owner; not applied by this change.

## 3. Evidence

- [x] 3.1 Extend the mapped component suite: labelling, notice, prepared row, per-role purpose, three copy controls, clipboard payload, sign-in navigation.
- [x] 3.2 Add flag-on (live-only catalog publishes the list) and flag-off (no list) coverage where the banner tests live.
- [x] 3.3 Replace the coverage-suite assertion that a live-only home hides the identities.
- [x] 3.4 Add the shared-library case proving the explicit default applies only when neither side states a value.
- [x] 3.5 Update the Storybook home story and the user-app browser journey to the new English heading and demo label.
- [x] 3.6 Run typecheck, lint, the user-app unit suite, the api-support unit suite, translation drift, and strict OpenSpec validation.
- [ ] 3.7 Run the user-app Playwright lane, the Storybook interaction suite, and the fullstack runtime lane. Not executed in this environment.

## 4. Documentation and rollback

- [x] 4.1 Document the flag in `docs/frontend-deployment-topology.md` beside the other runtime flags, with the compose, Helm, and local-dev switch.
- [x] 4.2 State in the durable requirement that reviewer entry is a deployment decision, so the provenance gate is not reintroduced.
- [ ] 4.3 Record the rollback rehearsal (`REVIEWER_ACCESS_ENABLED=false` on the running deployment).

## 5. Release

- [ ] 5.1 Commit and push the exact revision with repository authorship.
- [ ] 5.2 Collect exact-SHA assurance and deploy the immutable `user-app` revision.
- [ ] 5.3 Confirm on the review deployment that the identity list is present, then confirm the off switch on a deployment that must not carry it.
