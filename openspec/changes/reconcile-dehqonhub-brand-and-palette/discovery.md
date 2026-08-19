## Participants and Owners

- Product/domain owner: `agritech-maintainers`, acting on the maintainer's direct
  instruction to ship the real logo, drop the dark theme, and delete the repeated
  per-card sign-in hint.
- Specification author: `agritech-maintainers`.
- User-web owner: `user-app` and `@app/frontend-feature-user-i18n`.
- Independent verification reviewer: `quality-engineering`.

## Actors and Outcomes

- Any visitor sees the transparent DehqonHub emblem beside the text wordmark in
  the header and footer, crisp on a high-density screen, without downloading the
  full-resolution master for a 44 px box.
- A visitor using a keyboard or a pointer can activate the brand lockup through a
  target that is at least 44 px in both dimensions.
- A screen-reader user hears one brand name for the lockup, not a name followed
  by a redundant image description.
- A signed-out visitor browsing the catalog sees no repeated eligibility
  sentence; the local preview boundary is stated by the add confirmation and by
  the cart route.
- A signed-in actor without verification, an eligible role, or an approved
  organization sees one notice above the catalog naming the reason and offering
  the recovery route, and hears the same reason when focusing a card's add
  action.
- A visitor looking at a governed demo listing still sees its visible demo label
  on the card.
- No actor can find a theme control, and no route renders a second palette.

## Rules

- The header and footer mark is transparent. Raster or vector is a free choice;
  an opaque or white plate is not, and the white-backed legacy raster mark stays
  banned.
- A small mark is served from an asset sized for its box. The 512 px master is
  offered through a source set for denser screens, never as the default download
  for a 44 px mark.
- The mark is presentational with an empty alternative text. The lockup button
  carries the localized brand name, so the image must not add a second
  accessible name.
- The product ships one light palette and exposes no theme control. Nothing
  substitutes an automatic color inversion for the removed theme.
- A restricted card announces its reason on its own action through an accessible
  description and prints no visible reason copy.
- Governed demo provenance stays visible on the card.
- A signed-in ineligible actor gets exactly one catalog-level notice with the
  reason and its recovery route. A signed-out visitor does not, because the
  header sign-in entry, the add confirmation, and the cart route already carry
  that boundary.
- The add action reads as the same plain add-to-cart call in every eligibility
  state. The device-local preview boundary is stated where the buyer will see it
  — the add confirmation, the cart route, and the catalog eligibility notice —
  and never as extra wording on the button.

## Examples

- A visitor opens the home route at desktop width: the header and footer each
  render one image carrying the brand-mark class, whose current source is the
  96 px emblem, with an empty alternative text, beside the wordmark.
- A visitor at the 320 px floor activates the lockup: its bounding box is at
  least 44 px wide and 44 px tall, and navigation goes home.
- A signed-in buyer whose verification is still in review opens the catalog: one
  notice states that marketplace verification must be completed, offers the
  verification route, every card is free of that sentence, and each card add
  action references the reason through its accessible description.
- The same buyer focuses a governed demo card's add action: the announced reason
  is the demo provenance sentence, and the visible demo chip remains on the card
  image plate.
- A guest adds a demo listing: the button reads the plain add-to-cart label, the
  confirmation says the line was added to this browser's preview cart, and the
  cart route repeats the device-local boundary.
- A visitor opens settings in Russian: there is a language control and no theme
  control, and the document does not switch to a dark palette.

## Counterexamples and Boundaries

- A mark with a white or opaque plate, or the legacy white-backed raster, does
  not satisfy the invariant even though it is the real logo.
- Serving the 512 px master into a 44 px box satisfies crispness but fails the
  asset-sizing rule; serving only the 96 px asset with no denser source fails
  crispness above 2x.
- Giving the image its own alternative text duplicates the lockup's accessible
  name and is invalid even though it reads as more descriptive.
- Shrinking the mark below 44 px and leaving the lockup at the mark's size fails
  the target minimum even if the artwork stays legible.
- Deleting the per-card hint without announcing the reason anywhere fails the
  restricted-state rule; moving the identical sentence into a banner for every
  signed-out visitor reintroduces the noise the owner rejected.
- Removing the visible demo chip along with the hint would break the demo
  honesty obligation in `REQ-AGRITECH-DEMO-024`.
- Relying on the button label alone to carry the device-local boundary is
  invalid: the label is deliberately identical in both eligibility states, so the
  add confirmation, the cart route, and the catalog notice must carry it.
- A dark palette reintroduced through a color-scheme media query or a dark
  theme attribute block contradicts the single-palette decision.

## Failure and Operational Modes

- An emblem asset that fails to load leaves the wordmark as the readable brand;
  no white box and no broken-image text enters the lockup's accessible name.
- A stored theme preference returned by the profile API is not applied as a
  second palette.
- An empty, loading, or failed catalog read renders its own recovery state and
  suppresses the eligibility notice, so a retry state is never mistaken for an
  eligibility problem.

## Assumptions

- The maintainer's transparent emblem assets under `apps/frontend/app/public` are
  the approved artwork, already alpha-clean at both sizes.
- The dark theme removal is a deliberate current product decision, not an
  unfinished migration.
- English, Russian, Uzbek Latin, and Uzbek Cyrillic remain the supported locale
  set.

## Unresolved Questions

- None.
