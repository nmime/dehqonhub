# DehqonHub Marketplace Design Reference

This document records the product's visual language, marketplace structure,
responsive patterns, and UI constraints. Repository design-system ownership,
current product requirements, and implementation source remain authoritative.

Two pillars of the project:

1. **Visual language** (colors, fonts, border radii, decorative elements) — taken from the
   "Agriculture / Thynk Unlimited" brand mockups (cream + green, pill shapes, scalloped badges).
2. **Page structure, grids, and block logic** — modeled on Yandex Market (market.yandex.uz):
   marketplace patterns, not landing-page patterns.

All texts from the screenshots are fully ignored — they are a style reference only.

---

## 1. About the product (context for every screen)

A B2B/B2C agro marketplace for Uzbekistan. Three roles:

- **Manufacturer / Supplier** (seeds, equipment) — sells, competes for orders.
- **Farmer** — buys from manufacturers, sells harvest to buyers (two-sided role).
- **Buyer** (market trader, wholesaler) — purchases produce, creates request orders.

Key entities: catalog (3 non-overlapping sections: **Equipment / Seeds / Produce**),
cart (multi-carts, one seller per cart — like Yandex Eda), **orders** (reverse auction:
"I need X — bring me the best offer"), role-based personal accounts, **verification**
(OneID + documents), **samples** (free test batches, limit 5–6/month, verified users only),
**contracts** (legal guarantee of every deal), delivery (pickup / by seller / by agreement),
factoring / deferred payment, AI consultant.

---

## 2. Design tokens

### 2.1 Colors

```css
:root {
  /* Backgrounds */
  --bg-cream: #faf0de; /* main page background (cream from the screenshots) */
  --bg-cream-card: #fdf6e9; /* light cards on green / inner panels */
  --surface-white: #ffffff; /* product cards, popovers, modals */

  /* Green range (brand) */
  --green-primary: #1ca24c; /* main brand green: buttons, active chips, deal prices */
  --green-primary-2: #17924b; /* hover/pressed for primary, dark edge of gradients */
  --green-accent: #7ed957; /* light green accent: secondary chips, badges, icon plates */
  --green-tint: #e4f6e3; /* hover fill, selected-filter background, status stripes */
  --green-deep: #0e7a3c; /* text on light green, silhouette illustrations */

  /* Text */
  --ink: #2b2b2b; /* headings and body text (soft black, NOT #000) */
  --ink-soft: #6b6b63; /* secondary text, captions, meta */
  --ink-on-green: #ffffff; /* text on green surfaces */

  /* Utility */
  --line: #e9dfc9; /* dividers/borders on cream */
  --line-on-white: #efefea; /* dividers on white */
  --danger: #e5484d; /* errors, "rejected" — use rarely */
  --warning: #e8a33d; /* "under review", "pending" */
  --star: #ffb800; /* ratings */

  /* Gradients (decorative panels, banners) */
  --grad-green: linear-gradient(120deg, #17924b 0%, #35c264 55%, #7ed957 100%);
}
```

Usage rules:

- The whole site background is `--bg-cream`. White (`--surface-white`) is only for cards,
  dropdowns, modals, and input fields. No gray #F5F5F5-style backgrounds anywhere.
- One primary accent — `--green-primary`. `--green-accent` is secondary only
  (the second chip in a pair, decorative badges), never for primary buttons.
- Inverted sections: a full-bleed section with `--green-primary` background and cream cards
  inside is allowed (like the "Vision & Mission" slide) — use for promo strips,
  the "How orders work" block, and the footer.
- Do not paint prices, discounts, or ratings marketplace-red — a discount/deal is
  highlighted with `--green-primary`; the old price is struck-through `--ink-soft`.

### 2.2 Typography

Single type family — **Poppins** (the geometric sans from the screenshots; Cyrillic support
is needed for ru/uz). If Poppins lacks Cyrillic in the needed weights, use the fallback pair:
**Montserrat** (headings) + **Manrope** (body). No serifs, no system fonts.

```css
--font-display: 'Poppins', 'Montserrat', sans-serif; /* 700–800 */
--font-body: 'Poppins', 'Manrope', sans-serif; /* 400–600 */
```

Scale (desktop / mobile):

| Role                     | Size         | Weight  | Notes                                    |
| ------------------------ | ------------ | ------- | ---------------------------------------- |
| H1 (hero, page title)    | 44–56 / 30px | 800     | letter-spacing −0.02em, line-height 1.05 |
| H2 (section/shelf title) | 28–32 / 22px | 700     |                                          |
| H3 (card title)          | 18–20 / 16px | 600     |                                          |
| Body                     | 15–16 / 14px | 400–500 | line-height 1.55                         |
| Price in a card          | 18–20px      | 700     |                                          |
| Chips, badges, meta      | 13–14px      | 600     |                                          |
| Caption                  | 12px         | 500     | `--ink-soft`                             |

Headings use Sentence case only ("Seed catalog", not "SEED CATALOG"). Never use all caps.

### 2.3 Border radii (brand signature — very soft)

```css
--r-pill: 999px; /* chips, tags, buttons, search, inputs */
--r-card: 24px; /* product cards, filter panels, account blocks */
--r-panel: 32px; /* large sections, banners, hero blocks, modals */
--r-img: 16px; /* photos inside cards */
```

- **Every button, chip, the search field, and all inputs are full pills (999px).** This is
  the primary style identifier. Rectangular buttons do not exist in this project.
- No radius smaller than 16px anywhere (except 6px checkboxes).

### 2.4 Shadows and borders

The style is flat, "print-like". Shadows are minimal:

```css
--shadow-card: 0 1px 0 rgba(43, 43, 43, 0.04); /* at rest */
--shadow-hover: 0 8px 24px rgba(28, 162, 76, 0.14); /* card hover */
--shadow-pop: 0 16px 48px rgba(43, 43, 43, 0.16); /* popovers/modals */
```

Outline elements (inactive chip, secondary button): transparent/white background,
`1.5px solid var(--ink)` or `--line` border — like the empty pill slots on screenshot 1.

### 2.5 Signature visual elements (use consistently)

1. **Paired pill chips**: `[Company] [Profile]` → for us `[Catalog] [Seeds]`,
   `[Order] [Active]` — the first chip is filled `--green-primary` with white text,
   the second is `--green-accent` with `--ink`. Use as a "section emblem" in page headers
   and as status tags.
2. **Scalloped badge** (a circle with a wavy/toothed edge, like a seal): icon container in
   feature cards, the seller's "Verified" mark, the "Sample available" stamp, the seal on a
   contract card. Implement as an SVG mask. This is the brand's signature element.
3. **Flat silhouette illustrations** (farmer, tractor, sprout) in `--green-deep`
   on green plates — corners of promo banners and empty states.
4. **Triangle raster** (a grid of small triangles, as on the dark-green card of
   screenshot 1) — a decorative pattern in banner and footer corners.
5. **Green gradient panels** `--grad-green` with vertical translucent stripes —
   for CTA banners ("Get verified", "Create an order").
6. **Brand capsule "nameplate"** (logo inside a pill outline + "Since …" on the right) —
   the pattern for the seller mini-card in the product page header.

The canonical DehqonHub emblem is the user-supplied gold-and-green tree mark stored at
`apps/frontend/app/src/assets/dehqonhub-logo.webp`. It is an optimized, margin-trimmed derivative
of the supplied artwork—not a recreated logo. Present it inside a deliberate white circular
medallion so its opaque white background remains intentional in cream and dark themes. The emblem
is decorative inside the already labelled DehqonHub home control; keep an empty `alt` value and
retain the adjacent text wordmark wherever space allows.

Product photos are real photographs inside an `--r-img` container, no filters.

---

## 3. Shell, grid, spacing (Yandex Market pattern)

- Container: max-width **1320px**, paddings 24px (desktop), 16px (mobile).
- Base spacing step: 8px; 48–64px between sections; 16–20px inside cards.
- Product grid: desktop 4–5 columns (3–4 on catalog pages with the sidebar),
  tablet 3, mobile 2. Gap 16–20px.
- Catalog page: **left filter sidebar 260–280px + content** (classic YM).
- Product page (PDP): 2 columns — gallery on the left, sticky buy panel on the right.
- Fully responsive down to 360px; filters on mobile — a bottom sheet.

### 3.1 Header (sticky, identical everywhere — like YM)

A single row on a white/cream background with a `--line` bottom border:

```
[Logo] [«Catalog» button ▦, pill, --green-primary] [——— Search (pill, full width) ——— 🔍]
       [Orders] [Favorites] [Cart •n] [Sign in / Account]
```

- The "Catalog" button opens a **mega menu** (like YM): the 3 root sections on the left
  (Equipment / Seeds / Produce), subcategory columns of the selected section on the right.
  Sections never overlap — they are full catalog branches, not filters.
- Search: pill input, white background, `1.5px --green-primary` border, a magnifier button
  inside on the right as a green circle. Suggestions in a white `--r-card` popover.
- Right-side icons — linear (lucide), 24px, with a 12px label underneath (as in YM).
- For a non-verified user, instead of "Account" show a pill **"Verification"** button
  (outline, with a `--warning` dot); after verification it is replaced by the account icon.
- Below the header on the home page and in the catalog — a **horizontal category chip row**
  (scrolls on X): popular subcategories and quick filters.

### 3.2 Footer

Inverted: `--green-primary` background, cream text, triangle raster in the corner.
Columns: For buyers / For sellers / Company / Help; a legal info row.
Top corners of the footer are rounded `--r-panel` (the footer "floats into" the cream).

---

## 4. Pages and blocks (structure — Yandex Market, skin — ours)

### 4.1 Home page

Top to bottom (order as in YM):

1. **Hero banner carousel** `--r-panel`: a green gradient panel, large H1 on the left
   (Poppins 800), a cream pill CTA, silhouette illustration + photo on the right.
   Pagination dots are pill-shaped.
2. **Quick scenario tiles** (2–4 cards in a row, like YM's "service plates"):
   "Create an order", "Request a sample", "Become a seller", "Verification" —
   cream `--r-card` cards with a scalloped icon.
3. **"Popular in Seeds" shelf** — H2 title + "See all →" link, a horizontal product card
   strip (scroll, circular arrows at the edges like YM).
4. **"Equipment" shelf**, **"Produce" shelf** — same pattern (one shelf per section).
5. **Inverted "How orders work" section**: `--green-primary` background, 3 cream step cards
   with scalloped icons (structured like the Vision & Mission slide).
6. **"New sellers" shelf / manufacturer promo** (paid promotion — a small "Ad" caption,
   honest, like YM).
7. Verification CTA banner (gradient) → footer.

### 4.2 Section catalog (Equipment / Seeds / Produce)

YM listing structure:

- Breadcrumbs (caption, `--ink-soft`).
- Section H1 + product count as a caption; a "Sort" select (pill) on the right.
- A row of active filter chips (pill, `--green-tint`, with an inline ✕).
- **Left filter sidebar** (white `--r-card` panel): each section has its own filters.
  MVP set:
  - Common: price (range), seller region, seller rating, "Verified only" (toggle),
    "Sample available" (toggle), in stock, manufacturer.
  - Seeds: crop, certification, sowing season, packaging/volume.
  - Equipment: machinery type, condition (new/used), power, brand.
  - Produce: product category, minimum lot (tons), shelf life / harvest year.
  - Buttons: pill "Show N products" (primary) + a text "Reset" link.
- Product grid on the right, 3–4 columns; below — "Show more" pagination (pill outline).

### 4.3 Product card in the grid (Ozon/WB/YM analog)

White, `--r-card`, hover: `--shadow-hover` + 2px lift.

```
[Photo --r-img, favorite heart overlaid]
[Tags: up to 2 pill chips 12px ("Certified", "Sample") --green-tint]
[Price 700 + unit ("UZS/t", "UZS/pc"); min lot as caption]
[Title, max 2 lines]
[Manufacturer + scalloped mini ✓ mark if verified]
[★ 4.8 · 124 reviews — caption]
["Add to cart" button, pill primary, full width]
```

### 4.4 Product page (PDP)

Like YM: breadcrumbs → H1 → a "★ rating · reviews · SKU" row.
Gallery on the left (vertical thumbnails + a large `--r-img` photo).
On the right a **sticky buy panel** (white, `--r-card`):
large price, quantity/packaging selector, delivery terms (pickup / by seller / by agreement),
buttons: "Add to cart" (primary pill), "Request a sample" (outline pill, with a caption
"N samples left this month"; for non-verified users it leads to verification),
"Add to favorites".
Below the panel — the **seller capsule** (nameplate pattern: pill logo + name + ✓ +
"Since 20XX" + rating + "All seller products").
Below, full-width pill tabs: Description / Specifications / Reviews (`--star` stars,
buyer photos, like WB) / Delivery. A "Similar products" shelf at the bottom.

### 4.5 Cart (multi-carts — like Yandex Eda)

- One cart = one seller. On top — horizontal pill tabs of carts:
  `[Seller logo · N items]`.
- Item list on the left (white rows, pill quantity steppers), sticky summary on the right:
  total, delivery choice (the 3 Stage-1 radio options), "Checkout" (primary),
  "Request a sample for this cart" (outline).
- Checkout is impossible without verification: on click, show an `--r-panel` modal
  "Verification required" with a scalloped seal and a CTA.
- Before order confirmation — the **contract step**: a contract preview screen,
  a consent checkbox, and a "Sign and send to seller" button.

### 4.6 Orders (reverse auction)

- **Order feed** (for sellers/farmers): row cards `--r-card`:
  crop/product + volume, region, deadline, budget, status chips; an "Make an offer" button.
- **Order creation** (buyer/farmer): a step-by-step form in an `--r-panel` panel
  (product → volume → region → deadline → budget → requirements) with pill progress dots;
  CTA "Create request". All fields are pill inputs.
- **My order page**: request parameters on top (a chip pair "Order / Active"),
  below — a table/list of seller offers (price, timing, delivery, rating, ✓),
  a "Choose offer" button → then the standard cart → contract flow.

### 4.7 Personal account (role-based)

Shell: vertical menu on the left (cream panel, active item is a `--green-primary` pill),
content cards on the right. Menu sets:

- **Manufacturer/Supplier**: Farmer orders (participate) · Purchases (accept / in progress) ·
  My products · Sales statistics and analytics · Contracts (statuses) · Profile/verification.
- **Farmer**: Buyer orders · Buyer purchases · My orders (to manufacturers) ·
  Contracts (both sides) · Sales and purchase statistics · Profile/verification.
- **Buyer**: My orders · Contracts with farmers · Purchase statistics · Profile.

Dashboard: 3–4 stat cards (a big Poppins 800 number + caption) + a chart
(lines/bars in the green range, `--line` gridlines) + a recent deals table.
Statuses everywhere are pill chips: Active `--green-tint`/`--green-deep`,
Pending `--warning`, Completed outline, Rejected `--danger` (text only, no fill).

### 4.8 Verification

A dedicated wizard flow (a centered `--r-panel` panel):
steps OneID → role type → document upload (land / lease / cadastre / farm;
machinery and warehouse marked "optional") → "Under review" status.
File uploaders are dashed `--r-card` zones. Success — a screen with a scalloped
"Verified" seal in `--green-primary`. Afterwards the ✓ badge shows next to the name everywhere.

### 4.9 Contracts

A list of contract cards: parties (two nameplates), subject, amount, status chip,
an "Open PDF" button. Contract detail — a document panel on white with a scalloped seal
and a status timeline (dots on a vertical `--green-primary` line).
Here also the deferred payment / factoring block: a "Deferred payment via a partner bank"
card (gradient panel, honest description of the terms).

### 4.10 AI consultant

A floating round button at the bottom right (`--green-primary`, sprout icon) →
a slide-out chat panel (white, `--r-panel`): a pill input, quick-question chips
("Pick seeds for my region", "What a beginner farmer needs", "Find it cheaper").
Answers may include mini product cards (a compact version of the 4.3 card).

---

## 5. Components — consolidated rules

- **Buttons**: primary — `--green-primary`, white text, pill, 44–48px height,
  hover `--green-primary-2`; secondary — white background, 1.5px `--ink` border;
  ghost — `--green-deep` text, no background. Disabled — `--line` + `--ink-soft`.
- **Inputs/selects**: pill, white, `--line` border; focus — `--green-primary` border
  plus a `--green-tint` ring. Labels above, 13px 600.
- **Filter chips**: default — white + `--line` border; hover — `--green-tint`;
  active — `--green-primary` with white text.
- **Tabs** — the same pill chips, no underlines.
- **Rating** — `--star` stars, number at 600.
- **Toasts/alerts** — cream `--r-card` panels with a colored status dot on the left.
- **Modals** — `--r-panel`, overlay rgba(43,43,43,.4).
- **Skeletons** — `--green-tint` → `--bg-cream-card` shimmer.
- **Icons** — one linear set (lucide), 1.5–2px stroke; filled icons only inside
  scalloped badges.
- **Empty state** — a silhouette illustration + one line of text + a pill CTA.

## 6. Forbidden (anti-patterns)

- Straight corners and radii < 16px on buttons/cards; rectangular buttons.
- Pure black #000, plain gray backgrounds, blue/purple accents, red price tags.
- More than one type family beyond the defined pair; all-caps text.
- Heavy shadows, glassmorphism, neon gradients.
- Copying texts/logos from the screenshots ("Thynk Unlimited", "Benjamin Shah",
  "reallygreatsite", etc.) — they are placeholders; use the project's real content.
- Copying Yandex's brand yellow/colors — from YM we take structure and UX patterns only.
- Hiding the "Ad" label on promoted products.

## 7. Languages and currency

Interface: ru (primary) + uz (provide a switcher in the header); en optional.
Currency — UZS (som), format `12 500 000 UZS`, thousands separated by non-breaking spaces.
Volumes — t/kg, land area — ha.
