# Rebuild the account route as a personal cabinet

## Why

The product owner reviewed `/account` and rejected it: "The profile page looks
terrible. It should be a personal cabinet with statistics: my active orders and
the orders I am fulfilling; sales and spending statistics for the month as a
chart; publication status and so on. Let each of these categories sit on the
LEFT, and on the RIGHT a large panel with the current content. Design it like an
admin panel. Also in the cabinet the padding under titles was not rechecked —
the descriptions under titles look cramped."

Three separate defects sit behind that.

1. **No structure.** The account view was one vertical stack: a hero, a
   two-number stat grid, a contracts panel, a samples panel, and the whole
   publishing/promotion/sample/activity workspace appended underneath. A buyer's
   purchase requests, a seller's fulfilment work and the moderation queue were
   interleaved with no way to address, compare or navigate between them. The
   route had exactly one address, `/account`, so a reviewer could not be sent to
   a section — only to the top of the pile.

2. **The dashboard's own aggregates were unused.** `/marketplace/dashboard`
   already returns a six-month `monthlyActivity` window
   (`completedPurchases`, `completedSales`, `purchaseSpendUzs`,
   `salesRevenueUzs` per month), `recentDeals` with the side the account is on,
   and the full buyer/seller metric blocks. The screen rendered two numbers from
   all of it: one order count and one contract count, the latter a client-side
   sum of `activeDeals + completedDeals` that no endpoint reports. The owner's
   "statistics for the month as a chart" needed no new data — only for the data
   already served to be shown.

3. **Cramped heads.** `.dh-page-heading > div`, `.dh-panel__head > div` and
   `.dh-request-card__head > div` were given a 0.5rem grid rhythm; the account
   hero was not, so its eyebrow, `h1` and role line still collapsed onto the
   eyebrow's own margin.

A fourth problem is about the demo data rather than the code: the database held
one draft contract, so a six-month chart would have been one point and five
zeroes. That is an honest rendering of a useless fixture, and a commission
cannot judge the aggregation from it.

## What Changes

- Replace the account view with a two-column cabinet: a left navigation rail of
  six sections and one large right content panel. Sections are **overview**,
  **my orders** (as buyer), **orders I fulfil** (as seller), **sales and
  spending**, **publications**, and **verification and account**.
- Give every section its own deep link. `/account` is the overview and
  `/account/<section>` addresses the rest, through a new
  `/account/$cabinetSection` route that shares the account page component. An
  unknown segment resolves to the overview rather than to an empty frame.
  Switching sections is a re-render driven by the router-subscribed pathname, not
  a remount, so moving between panels does not re-read the dashboard.
- Draw the month chart from `monthlyActivity` as CSS bars with quartile
  gridlines, a peak label as its scale, a legend, and a value table as its
  accessible equivalent — screen-reader-only beside the overview, visible with
  window totals in the finance section. A series is drawn only when the
  dashboard reports the matching role scope, so a buyer is never given a sales
  axis reading as six zero months, and a window that settled nothing states so
  instead of plotting a flat line.
- Split deals on the `actorParty` the contract projection already stamps, rather
  than on a client-side guess about who the account is.
- State each owned purchase request with its status, its publication and
  moderation state, its offer count, its region, deadline and budget.
- Keep every existing capability reachable: the publishing, promotion, sample
  and activity workspace moves under the publications section unchanged; the
  verification chip, role, level, identity-link state, sample history and the
  verification call to action all stay, the last outside the panels so it is
  visible from every section.
- Give the account hero and the new cabinet heads the same 0.5rem head rhythm
  the page and panel heads already have, with the eyebrow's own margin zeroed
  and the description muted.
- Extend the guarded demo seed with twelve settled deals between the demo buyer
  and the demo seller, spread across the six months the dashboard aggregates,
  with varied amounts, delivery terms and outcomes. Dates are derived from the
  seed run so the fixture keeps landing inside the rolling window; ids stay
  content-derived so a re-seed updates rather than duplicates.

## Non-Goals

- No new endpoint. Every figure comes from `/marketplace/dashboard`,
  `/marketplace/contracts`, `/marketplace/requests/mine`,
  `/marketplace/publications/mine`, `/marketplace/samples`,
  `/marketplace/public/requests` and `/marketplace/verification`.
- **A seller's own offers are still not itemisable.** The offer read
  `GET /marketplace/requests/{id}/offers` authorises the request's _buyer_ only
  (`PostgresMarketplaceRepository.listOffers` resolves the publication by
  `buyerUserId`), and no endpoint lists the offers an account made as a seller.
  The seller section therefore reports what the API does expose — `pendingOffers`,
  `offerConversionBps`, `activeListings`, the listings that sold, the contracts
  the account is fulfilling, and the open requests it can offer on — and invents
  nothing in place of the missing list. Adding `GET /marketplace/offers/mine`
  through the source-first contract pipeline is left as follow-up work.
- The shared stylesheet is not edited here. The cabinet's stylesheet is handed to
  the shared-CSS owner as one merge block with its replacements quoted.
