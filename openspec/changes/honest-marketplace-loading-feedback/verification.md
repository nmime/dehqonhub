# Verification

## REQ-AGRITECH-EXPERIENCE-026

- Risk: high journey and accessibility.
- Projects: `user-app`.
- Cucumber: not applicable, unchanged from the requirement's standing
  disposition. The modified clauses are renderer-owned geometry, ARIA state and
  timing: the box a placeholder occupies, `aria-busy` and `aria-hidden`
  placement, an accessible name that must not change, and two millisecond
  thresholds. Restating them in Gherhin would name CSS classes, ARIA attributes
  and timer values, which the acceptance project must not do; component evidence
  with fake timers falsifies them directly.
- Evidence:
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-loading.spec.tsx`
    (newly mapped for this requirement) proves that every primitive renders and
    carries `aria-hidden`, that no primitive leaves a control, heading or role
    behind, that every skeleton container carries `aria-busy` and is itself not
    hidden, that each container declares the content shape it stands in for, that
    the shared skeleton still honours `count` while offering row, definition-list
    and stat shapes, that the product route's placeholder carries the gallery
    frame, the thumbnail strip, both specification groups and the buy action, that
    the seller placeholder carries its hero above its catalog grid, that a settled
    region announces nothing while a busy region announces loading and then
    announces itself ready by name, that a busy control is disabled, marked
    `aria-busy`, shows the spinner in its reserved slot, keeps its accessible name
    and refuses a second click, that no placeholder is painted for work resolving
    inside 120 ms, that a shown placeholder is held to its 320 ms minimum and then
    dropped, that disabling the policy schedules no timer at all, and that a
    reduced-motion visitor's motionless placeholder is held to 480 ms instead.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-coverage.spec.tsx`
    and `marketplace-components.spec.tsx` (already mapped) continue to prove that
    the seller, favourites, verification and contract routes render a skeleton
    container for their loading statuses and settle into their real content,
    which is what keeps the reimplemented `MarketplaceSkeleton` compatible with
    its existing callers.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-management.spec.tsx`
    (already mapped) continues to prove that every management workspace renders
    its skeleton containers while loading and its localized rows once ready.

## Independent review

Review must challenge whether any region still renders a placeholder whose box
is not the box of its content; whether any in-flight control still only greys
out; whether a placeholder can reach a screen reader, or a busy control can
change its accessible name; whether a busy control can be submitted twice;
whether the announcement can fire for a region that was never busy; and whether
the reduced-motion treatment is a real substitution rather than a frozen
animation.

Review must also challenge the deliberate limit recorded below: the anti-flicker
policy is opt-in per region and is currently exercised only by the AI panel,
because the resource-driven regions are locked by synchronous assertions in three
suites this change does not own.

## Working-tree evidence

- `user-app:typecheck` passed.
- `user-app:lint` passed with no errors and no warnings.
- The user-app unit suite ran 268 tests in 30 files, all passing. The suite stood
  at 238 in 28 files when this change started and at 249 in 29 files immediately
  before the new suite was added, because concurrent work in the same worktree
  added `marketplace-cabinet.spec.tsx`; the 19 tests this change adds account for
  the whole difference between 249 and 268.
- Prettier reports no formatting issues on every touched TypeScript file.
- The four user locale catalogs hold 965 keys each, before and after, with zero
  drift. No key was added, so `libs/common/i18n/keys/lib/src/index.ts` is
  untouched by this change.
- Strict OpenSpec validation passed for this change and for the whole
  repository. `spec:validate` runs with `--skip-openspec` on this Windows host
  because its OpenSpec step cannot spawn `pnpm` with a replaced environment.
- Playwright, Storybook interaction and fullstack runtime lanes were not
  executed.
- The loading stylesheet delta was handed to the shared-CSS owner rather than
  applied, so the new placeholders currently render unstyled in a local build.

## Release boundary

This evidence belongs to a modified working tree shared with concurrent work and
is not exact-SHA release evidence. No commit, push, image publication,
deployment, canary or rollback rehearsal is claimed.
