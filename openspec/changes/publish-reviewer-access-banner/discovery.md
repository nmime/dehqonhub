## Participants and Owners

- Product/domain owner: `agritech-maintainers`, acting on the product owner's
  direct instruction that the home page must carry the MVP reviewer accounts for
  a state commission review.
- Specification author: `agritech-maintainers`.
- User-web owner: `user-app` and `@app/frontend-feature-user-i18n`.
- Deployment owner: the operator who sets the frontend runtime environment.
- Independent verification reviewer: `quality-engineering`.

## Actors and Outcomes

- A commission reviewer opens the home route on the review deployment and finds
  the three demo identities with their passwords, a copy control per identity,
  and a role purpose for each.
- The same reviewer reads that a purchase request, competing offers, and a signed
  contract are already prepared between the buyer and seller identities, and
  knows to open the purchase-request and contract routes after signing in.
- A reviewer who signs in as the farmer identity understands beforehand that the
  role is a farmer dashboard and not a party to a marketplace deal.
- Any visitor sees, in visible copy, that the identities are demo accounts from a
  guarded demo seed and that their activity is not production activity.
- An operator who must not publish credentials sets
  `REVIEWER_ACCESS_ENABLED=false`; the next container start serves a home route
  with no identity list, from the same image.
- A local developer who wants the same result without a container sets
  `VITE_REVIEWER_ACCESS_ENABLED=false` at build time.

## Rules

- Reviewer entry is published if and only if the deployment's reviewer-access
  flag resolves to enabled. Catalog provenance, catalog emptiness, and catalog
  failure do not decide it.
- The flag resolves runtime value first, then the Vite build value, then its
  shipped default of enabled. An unset or unparsable value falls through instead
  of resolving to an undefined state.
- The identities stay labelled as demo accounts in visible copy wherever they are
  published.
- The banner states each role's purpose, including that the farmer identity is a
  dashboard role that cannot be a buyer or seller party.
- Prepared transactional evidence is described qualitatively. No count, amount,
  or contract identifier appears in product copy.
- Nothing in the banner claims the seeded records are real production activity.
- The passwords are demo-seed values kept in step with
  `packages/tooling/src/commands/db/seed-data.ts`. No production or personal
  credential ever enters this list.
- The copy control is an interactive target and meets the 44 px minimum.

## Examples

- The flag is unset, the catalog returns 19 live transactional listings: the home
  route publishes the identity list.
- The flag is unset and the catalog returns governed demo listings: the home route
  publishes the identity list; the demo cards keep their own labels.
- `REVIEWER_ACCESS_ENABLED=false`: the home route renders hero, quick scenarios,
  and shelves with no identity list and no demo-account label.
- `REVIEWER_ACCESS_ENABLED=maybe`: the value is unparsable, the key is omitted
  from `runtime-config.js`, the build value applies, and the shipped default keeps
  the list published.
- A reviewer copies the seller identity: the clipboard receives
  `<email> / <password>` and the control confirms the copy.

## Counterexamples and Boundaries

- Publishing the identity list while the flag is off is invalid even on a demo
  catalog.
- Hiding the list on a live catalog while the flag is on is the defect this change
  removes.
- A banner that shows the credentials without the demo label, or with copy that
  invites the visitor to "explore the demo catalog" on a live catalog, is
  dishonest even though the credentials are correct.
- Printing "3 competing offers" or the signed contract id is invalid: the public
  home route cannot read either, so the copy would be an unverifiable claim.
- Describing the farmer identity as a trading party is invalid: the database
  refuses that role as a transaction party.
- Expressing the switch as a code constant, a build-only constant, or a
  `data-*`-driven CSS rule is invalid: the deployment must be able to withdraw the
  list without a rebuild.

## Failure and Operational Modes

- An absent or unreadable `runtime-config.js` leaves the build value and the
  shipped default in force; the page still renders.
- A browser without the async clipboard API leaves the copy control inert rather
  than throwing; the credentials stay readable and selectable as text.
- An empty, loading, or failed catalog does not change reviewer entry; each
  catalog state keeps its own existing recovery copy.

## Assumptions

- The commission review is the current, owner-approved reason to publish working
  demo credentials on a public page.
- The three seeded identities and their passwords remain the reviewer set, and the
  demo seed remains the only source of them.
- The verification roles stay farmer, seller, and buyer, and the database keeps
  refusing a farmer as a transaction party.
- English, Russian, Uzbek Latin, and Uzbek Cyrillic remain the supported locales.

## Unresolved Questions

- None. Whether to withdraw the identities after the review is a deployment
  decision the flag already answers.
