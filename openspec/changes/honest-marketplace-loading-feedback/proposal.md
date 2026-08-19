# Make marketplace loading feedback honest

## Why

`REQ-AGRITECH-EXPERIENCE-026` already requires controls to expose a loading
state and requires purchase-request views to carry an explicit loading state
"rather than a blank region". The shipped renderer satisfies the letter of that
and not its intent, in three specific ways.

- **One skeleton for everything.** `MarketplaceSkeleton` rendered N boxes of
  `.dh-skeleton`, a 3:4-aspect card in an auto-fill grid. It was the placeholder
  for product grids, cart lines, offers, purchase requests, publication receipts,
  promotion details, sample lists, notifications, reviews and verification. A
  cart row is 4.35 rem tall and a review is a 1 rem-radius white card; loading
  either as a ~20 rem tall tile means the page visibly jumps when the data lands.
  The requirement said "not blank"; it did not say "the right shape", so the
  wrong shape was compliant.
- **No spinner, and mostly no action feedback.** There was no spinner primitive
  anywhere in the product. Around thirty controls guarded on `pendingAction`, and
  three of them rendered any affordance; the rest only set `disabled`, so a slow
  publish, promotion, sample transition, review or add-to-cart read as a dead
  button.
- **A partial reduced-motion story.** The `prefers-reduced-motion` block stopped
  `.dh-skeleton`'s animation, which leaves its travelling gradient frozen
  mid-sweep — a rendering artefact rather than a treatment — and did not cover the
  AI panel's typing dots at all, because it only overrode `transition-duration`.

Nothing above is a bug against the current requirement text. Fixing it therefore
means changing the requirement, not only the renderer.

## What Changes

- **A small loading kit** in a new `marketplace-loading.tsx`: content-shaped
  skeleton primitives (text line with width and size variants, media plate, list
  row, definition-list row, catalog card, stat tile), the container that carries
  `aria-busy`, a spinner, a busy-control wrapper, the screen-reader status for a
  region, and the anti-flicker hook. Every primitive's geometry is copied from the
  rule of the real element it stands in for, and the stylesheet names that source
  rule beside each number.
- **One shimmer, shared.** The shimmer moves off `.dh-skeleton` onto a `.dh-sk`
  base that both the legacy plate and every new primitive use, so the loading
  language stays one material. Its gradient stops move from
  surface-muted/surface — which is invisible inside a white card — to
  cream-deep/surface-muted.
- **Content-shaped regions** for the catalog grid, the seller route, favourites,
  the product route (frame, thumbnail strip and grouped specifications), the AI
  panel's pending reply, and every management list, receipt, promotion detail and
  sample list.
- **Action feedback** on every in-flight control in the renderer files this
  change owns: a spinner in a slot the control reserves in both states, so the
  box never changes; `aria-busy`; an unchanged accessible name; and the disabled
  state kept so the action cannot be submitted twice.
- **An explicit anti-flicker policy.** A placeholder appears only after 120 ms
  (the rounded 0.1 s instantaneous-response threshold plus a frame at 60 Hz) and,
  once shown, stays at least 320 ms (twice the product's own 160 ms transition).
  Under reduced motion the minimum becomes 480 ms, because the reduced
  placeholder does not move and needs longer to be read at all.
- **A complete reduced-motion treatment**: a flat fill for the shimmer, an
  opacity substitution for the spinner's rotation, and the typing dots keeping
  their phase while losing their travel.
- **Modify `REQ-AGRITECH-EXPERIENCE-026`** in place, keeping its stable
  identifier: one behaviour paragraph, two invariants, one failure-behaviour
  bullet, and one scenario.

## Impact

- Affected requirement: `REQ-AGRITECH-EXPERIENCE-026`.
- Affected projects: `user-app`.
- No new translation keys. The announcements reuse
  `agritech.marketplace.loading` and the existing generic
  `user.state.ready` (`"Ready: {{subject}}"`), and each region's name reuses the
  heading key it already renders. The `TranslationKey` union is untouched.
- No API, contract, persistence or authorization surface changes.
- `MarketplaceSkeleton` keeps its name, its `count` prop and its default, because
  other renderers import it; it gains an optional `shape` prop so a caller can ask
  for rows, definition-list rows or stat tiles instead of catalog cards.
