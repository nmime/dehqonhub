## 1. Specification

- [x] 1.1 Record the owner report verbatim: a filled cart, a pressed checkout, and
      "Заказ собран в этом браузере. Войдите в аккаунт, чтобы подписать договор."
- [x] 1.2 Establish that no adoption, merge, or claim path existed on either side,
      and that `guestCart.owns` is also true for a _signed-in_ actor who is not yet
      a verified buyer with an approved buyer organization.
- [x] 1.3 Verify authenticated checkout end to end against the live stand before
      designing anything, and record the produce add-to-cart HTTP 500 it exposed.
- [x] 1.4 Resolve the three-way disagreement about the selling-side verification
      role in `design.md`, naming the seeded ownership and the role copy as the
      deciding evidence, and reject the tighten-the-repository alternative in
      writing.
- [x] 1.5 Modify `REQ-AGRITECH-EXPERIENCE-026` in place, keeping the identifier:
      the preview-cart paragraph gains the adoption contract, its idempotency and
      fail-closed rules, and the boundary-at-the-control requirement.
- [x] 1.6 Modify `REQ-AGRITECH-MARKETPLACE-016` in place: a new invariant fixes the
      accepted verification roles on each side of the persisted party-coherence
      rule and states that a persisted rule stricter than the authorization layer
      is a defect.
- [x] 1.7 Keep the guest-local guarantee intact in the modified text: promotion
      begins only after the actor is authorized, and no guest mutation precedes
      authentication.
- [x] 1.8 Extend the version 3 sidecar with the new frontend and migration
      evidence under the requirements that own their projects.

## 2. Implementation

- [x] 2.1 Add `Migration20260810140000AlignMarketplaceSellerPartyRole`, replacing
      `assert_marketplace_resolved_commerce_parties` with `create or replace` so
      the selling-side role set becomes `('seller','farmer')` and every other
      party requirement, including the whole buying side, is byte-identical.
- [x] 2.2 Register it last in `agritechMigrations` and in the barrel exports.
- [x] 2.3 Expose `lines` and `release` from `useGuestCart`: the stored lines an
      authorized buyer needs to promote, carrying no local display text, and an
      idempotent single-line release.
- [x] 2.4 Add the adoption pass to `marketplace-page.tsx`, gated on signed-in,
      verified-buyer, approved-buyer-organization, running one line at a time
      through `POST /marketplace/cart/items` with a derived `Idempotency-Key`,
      releasing each accepted line, remembering attempted keys per mount, and
      keeping a rejected line local.
- [x] 2.5 Move `sharedTransactionAccess` and `transactionAccess` above `checkout`
      so the checkout path can name the one missing step instead of duplicating
      the barrier logic.
- [x] 2.6 Replace the `agritech.marketplace.demo.checkoutDone` toast: an authorized
      buyer retries adoption; anyone else reads the same sentence the control shows
      inline and is routed to that step.
- [x] 2.7 Add `withCartReturn` so sign-in reached from the cart — from the toast and
      from the inline entry alike — carries `returnUrl=/cart`.
- [x] 2.8 Add no translation key. Reuse `agritech.marketplace.access.*`,
      `agritech.marketplace.cart.addedToSellerCart`,
      `agritech.marketplace.cart.previewHint`, and
      `agritech.marketplace.action.*`, because the `TranslationKey` union is held
      by a concurrent change.
- [x] 2.9 Relabel and re-hint the preview checkout control itself for a signed-in
      actor: `agritech.marketplace.cart.previewCheckout` read "Continue to sign
      in" and `isPreview` overrode `checkoutHint`, both wrong once the actor is
      already signed in. Applied in
      `apps/frontend/app/src/pages/marketplace/ui/marketplace-commerce.tsx`: the
      hint is `checkoutHint` with the preview sentence as the only fallback, and a
      blocked preview control reads `checkoutActionLabel`.
- [ ] 2.10 Remove the orphaned `agritech.marketplace.demo.checkoutDone` from all
      four locale catalogs and from the `TranslationKey` union in one revision.
      Deferred: that union is being edited concurrently, and a key must never be
      present in some locales and absent in others.
- [x] 2.11 Bind the cart control's enabled state to the same barrier its wording
      comes from: `canCheckout` is now "no barrier at all" rather than `canBuy`
      alone, which could not see a missing buyer organization and left the preview
      control offering contract review for a step it could not clear.
- [x] 2.12 Stop reporting a check in progress as a cleared-step failure. A session
      being re-read (`auth === 'checking'`, entered by every data refresh) answered
      the sign-in barrier, so a signed-in verified actor was told to sign in for the
      length of the refresh; an unread organization list answered "an approved buyer
      organization is required" before it had been read. Both now answer
      `agritech.marketplace.access.checking` with no entry point, and an already
      loaded approved organization keeps transacting open during a refresh.

## 3. Evidence

- [x] 3.1 Add `marketplace-seller-party-role.migration.spec.ts`: the migration runs
      last, widens only the selling-side role, keeps the buying side and every
      membership/organization/verification requirement, and rolls back without
      dropping a trigger or a function.
- [x] 3.2 Update the pre-existing "is the latest migration" assertion in
      `marketplace-command-hardening.migration.spec.ts` to an ordering assertion,
      since a new tail migration must not be blocked by a positional claim.
- [x] 3.3 Add a real-PostgreSQL component case proving a farmer-verified supplier
      organization is an accepted selling party for a cart and for its frozen
      contract, including the produce source kind, unit, and unit price.
- [x] 3.4 Add `marketplace-preview-cart-adoption.spec.tsx`: no cart mutation while
      signed out; none for a signed-in but unverified actor; every line promoted
      with the exact body once the buyer is authorized and the local store emptied;
      the derived key replayed identically after a reload with no doubling; a
      rejected line reported once and not retried across re-renders.
- [x] 3.5 Assert the messaging in the same suite: the missing step is named,
      `demo.checkoutDone` is absent, nothing is ordered, sign-in from the toast and
      from the inline entry both carry `returnUrl=/cart`, verification is named
      instead of sign-in for a signed-in unverified buyer, and the control retries
      adoption for an authorized buyer.
- [x] 3.6 Extend `use-guest-cart.spec.tsx` with the `lines` projection and the
      idempotent `release`, including releasing an already-released and an unknown
      line.
- [x] 3.7 Run the user-app unit suite, the agritech persistence unit suite, the
      Docker-backed commerce component suite, `typecheck` and `lint` for both
      projects, Prettier on every touched file, the four-locale key parity count,
      and `db:migrations:check`.
- [x] 3.8 Run strict OpenSpec validation for this change and for the whole
      repository.
- [ ] 3.9 Re-run the authenticated HTTP transcript for a produce listing on the
      live stand. Not executed: `user-app-api` stopped accepting sessions minted by
      `auth-app-api` after that service was restarted at 18:41 by a concurrent
      agent, so every authenticated read answers 401 regardless of this change. The
      fix is instead proven at the persistence boundary — the exact insert that
      raised `23514` before now succeeds, and reinstating the old predicate inside
      a rolled-back transaction reproduces the failure — plus the Docker-backed
      component case.
- [ ] 3.10 Run the user-app Playwright lane, the Storybook interaction suite, and
      the fullstack runtime lane. Not executed in this environment.
- [x] 3.11 Enumerate every barrier state as evidence, since the missing regression
      was exactly that no test read the control's own label. Page level, in
      `marketplace-preview-cart-adoption.spec.tsx`: a verified seller is offered
      verification with the buying-role sentence and never the sign-in label, a
      missing buyer organization opens the organization profile, an unread
      organization list and a session being re-read both report the access check
      with no entry point and no navigation, and an unblocked buyer keeps checkout
      open. Component level, in `marketplace-seller-carts.spec.tsx`: for each of the
      five states the control's label, its hint, its `aria-describedby`, its
      pressability and its single inline entry are asserted, plus contract review
      once nothing is missing and a disabled server cart that still states why.
- [x] 3.12 Retarget the public-cart assertion in
      `marketplace-authenticated.e2e-spec.ts`: an anonymous visitor now reads the
      named sign-in step at the control instead of the generic preview sentence.

## 4. Documentation and rollback

- [x] 4.1 Record in the durable requirement that a preview cart must not outlive
      the actor's authority to transact, so the orphaned-cart trap cannot be
      reintroduced as a "persistent" cart.
- [x] 4.2 Record in the durable requirement that the persisted party-coherence
      rule must accept exactly the authorized role set, so the 500 cannot be
      reintroduced by tightening one layer alone.
- [x] 4.3 Record the deferred translation-key removal, the `marketplace-commerce`
      patch plan, and the contradicting new reviewer-access copy in `discovery.md`
      and this task list.
- [ ] 4.4 Record the rollback rehearsal: apply `down()`, confirm the three
      constraint triggers are still bound and a `seller`-verified cart still
      inserts, then re-apply `up()`.

## 5. Release

- [ ] 5.1 Commit and push the exact revision with repository authorship.
- [ ] 5.2 Collect exact-SHA assurance for the impacted lane.
- [ ] 5.3 Confirm on the deployment that a guest-assembled cart survives sign-in
      once, that a reload does not double it, and that a produce listing reaches a
      draft contract.
