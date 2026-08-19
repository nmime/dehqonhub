# DehqonHub Marketplace Design Reference

This document records the product's visual language, marketplace structure,
responsive patterns, and UI constraints. Repository design-system ownership,
current product requirements, and implementation source remain authoritative.
Where this document and `libs/frontend/ui-web/lib/src/styles.css` disagree, the
stylesheet wins and this document is the bug.

Two pillars of the project:

1. **Visual language** — a dark-first mini-app system: a near-black canvas,
   indigo-violet gradient panels, a blue primary, a gold value accent, large
   corner radii, filled navigation glyphs, and glow-based elevation. The
   direction was informed by a supplied Telegram mini-app reference set, from
   which the project takes structure and density only — never identity,
   artwork, subject matter, or reward mechanics.
2. **Page structure, grids, and block logic** — modeled on Yandex Market
   (market.yandex.uz): marketplace patterns, not landing-page patterns.

Reference screenshots are a style input, never a target to reproduce. All text,
logos, and imagery in them are ignored.

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

The product's primary surface is a **Telegram Mini App on a phone**. The open-web
responsive site is the same system in its light theme, not a separate design.

---

## 2. Design tokens

Tokens live in `libs/frontend/ui-web/lib/src/styles.css` as the `--xr-*` scale
and are mapped onto the shadcn semantic tokens. Application code consumes the
tokens and the `xr-*` class hooks; it never restates a raw colour, radius, or
shadow value locally.

### 2.1 Colors

Dark is authored on `:root`. `:root[data-theme='dark']` re-asserts it so a
nested shell can reverse a light ancestor. `:root[data-theme='light']` carries
the derived counterpart.

```css
/* dark — the designed default */
--xr-color-background: #0b0b12; /* canvas; never pure #000 */
--xr-color-background-deep: #08080e; /* recessed areas behind the canvas */
--xr-color-surface: #1e1c3e; /* elevated panel, flat fallback */
--xr-color-surface-strong: #241d48; /* the panel gradient's bottom stop */
--xr-color-surface-gradient: linear-gradient(160deg, #1d1b3c 0%, #241d48 100%);
--xr-color-well: #141328; /* inset wells, inputs, controls */
--xr-color-border: #3a3270; /* panel edge */
--xr-color-border-soft: #2a2550; /* internal dividers */

--xr-color-text: #ffffff;
--xr-color-muted: #8e8cb0; /* secondary copy */
--xr-color-dim: #7a77a0; /* 4.64:1 on canvas — the dimmest body step */

--xr-color-primary: #2b6ef5; /* the one action colour */
--xr-color-primary-strong: #1e5bd8; /* hover/pressed, gradient dark stop */
--xr-color-accent: #f5b43c; /* settled commercial value only */
--xr-color-accent-strong: #e08a15;
--xr-color-accent-contrast: #0b0b12; /* text on a gold fill */
--xr-color-accent-text: #f5b43c; /* gold as text — dark theme */
--xr-color-success: #22c55e;
--xr-color-success-text: #22c55e; /* green as text — dark theme */
--xr-color-warning: #f59e0b;
--xr-color-destructive: #ef4444;
```

```css
/* light — derived, same hierarchy and states */
--xr-color-background: #f4f4fa;
--xr-color-surface: #ffffff;
--xr-color-well: #eeeef6;
--xr-color-border: #dcdcea;
--xr-color-text: #14132a;
--xr-color-muted: #55537a;
--xr-color-dim: #6c6a92;
--xr-color-primary: #1e5bd8;
--xr-color-primary-strong: #1747ad;
--xr-color-accent-text: #8a5600; /* gold is illegible as text here */
--xr-color-success-text: #15803d;
--xr-color-warning: #b45309;
--xr-color-destructive: #dc2626;
```

Usage rules:

- **One action colour.** Blue is the primary. Gold is not a second primary — it
  marks value that has settled (a balance, a confirmed payout, an accepted
  offer) and appears at most once per viewport.
- **Fill tokens and text tokens are different tokens.** `--xr-color-accent` and
  `--xr-color-success` are surface hues. When the same semantic is rendered as
  _text_, use `--xr-color-accent-text` / `--xr-color-success-text` — on the
  light surface the fill hues are around 1.8:1 and unreadable.
- The canvas is `#0b0b12`, not `#000000`, so an elevated panel is visible
  against it without a shadow.
- Do not paint prices, discounts, or ratings marketplace-red. A deal is marked
  with `--xr-color-success`; the struck-through old price uses
  `--xr-color-muted`. Red is failure only.
- Both themes carry the same semantics. The light theme is never generated by
  inverting the dark one.

### 2.2 Typography

A display/body pair, both variable and both with full Cyrillic coverage for
ru/uz:

```css
--font-display: 'Montserrat Variable', 'Montserrat', ui-sans-serif, sans-serif;
--font-body: 'Manrope Variable', 'Manrope', ui-sans-serif, sans-serif;
```

`h1`–`h4`, page-header titles, stat-well values, and stat-chip values render in
the display face with `letter-spacing: -0.02em`. Everything else is body.

Scale (desktop / mobile):

| Role                      | Size         | Weight  | Notes                                    |
| ------------------------- | ------------ | ------- | ---------------------------------------- |
| H1 (hero, page title)     | 40–52 / 28px | 800     | letter-spacing −0.02em, line-height 1.05 |
| H2 (section/shelf title)  | 26–30 / 21px | 700     |                                          |
| H3 (card title)           | 18–20 / 16px | 600     |                                          |
| Body                      | 15–16 / 14px | 400–500 | line-height 1.55                         |
| Numeric value (well/chip) | 22–28 / 20px | 800     | display face, tabular figures            |
| Price in a card           | 18–20px      | 700     |                                          |
| Chips, badges, meta       | 13–14px      | 600     |                                          |
| Caption                   | 12px         | 500     | `--xr-color-muted`                       |

Headings use Sentence case only ("Seed catalog", not "SEED CATALOG"). Never use
all caps.

### 2.3 Border radii

```css
--xr-radius-sm: 0.75rem; /* 12px — chips, badges, inline controls */
--xr-radius-md: 1rem; /* 16px — buttons, inputs, list rows */
--xr-radius-lg: 1.25rem; /* 20px — inner wells, media */
--xr-radius-xl: 1.5rem; /* 24px — cards, panels, the nav island */
```

Buttons are rounded rectangles at `--xr-radius-md`, not pills. Pill geometry is
reserved for genuinely circular controls: icon buttons, avatars, the stat-chip
action, and pagination dots.

### 2.4 Elevation

Panels carry **no drop shadow**. Depth comes from the top-lit gradient plus a
1px lighter border. Only three things cast a real shadow:

```css
--xr-shadow-nav: 0 -8px 32px rgb(0 0 0 / 0.55); /* the floating nav island */
--xr-glow-primary: 0 8px 24px rgb(43 110 245 / 0.35); /* raised primary action */
--xr-glow-accent: 0 8px 24px rgb(245 180 60 / 0.3); /* raised value action */
```

Popovers and modals use `--xr-shadow-lg`. A resting card that needs separation
gets a border, not a shadow.

### 2.5 Signature visual elements (use consistently)

1. **Gradient panel** — the base unit of every screen: `--xr-radius-xl`,
   `--xr-color-surface-gradient`, 1px `--xr-color-border`, no shadow. Nesting is
   panel → well, never panel → panel.
2. **Floating navigation island** — the bottom navigation is a detached
   rounded bar inset from all three screen edges, respecting
   `--tg-safe-area-inset-*`. It is the only element allowed a downward shadow.
3. **Stat chip** — a compact rounded capsule of `icon + value + label` with an
   optional circular action on the trailing edge. Used in page headers for
   balances and counts.
4. **Stat wells** — a row of inset `--xr-color-well` cells, each a large display
   number over a small muted label. Used for countdowns and dashboards.
5. **List row** — a rounded row of `plate + title/meta + trailing`, where the
   plate is a tinted square holding a category mark or status badge. This is the
   default way to present any homogeneous list.
6. **Circular status badge** — a 44px disc carrying a status glyph
   (Verified / Contract / Sample / Credit / Delivered / Pending). Hue-coded and
   glyph-coded, so the state survives greyscale.

Artwork lives in `libs/frontend/ui-web/lib/src/asset/` as source-owned React
SVG: navigation glyphs, category marks, status badges, and empty-state plates.
It themes from tokens and `currentColor`, scopes its gradient IDs with
`useId()`, and is `aria-hidden` unless given an explicit `title`.

The canonical DehqonHub emblem is the user-supplied gold-and-green tree mark at
`apps/frontend/app/src/assets/dehqonhub-logo.webp` — an optimized, margin-trimmed
derivative of the supplied artwork, not a recreated logo. Present it inside a
deliberate circular medallion so its opaque background reads as intentional in
both themes. The emblem is decorative inside the already labelled DehqonHub home
control; keep an empty `alt` value and retain the adjacent text wordmark
wherever space allows.

Product photos are real photographs inside a `--xr-radius-lg` container, no
filters.

### 2.6 Motion

Transitions are decorative and short (120–200ms, ease-out). Cards lift by
border-colour change plus a 1–2px translate; they do not scale, rotate, or
bounce. Every transition collapses under `prefers-reduced-motion: reduce`
without changing layout, hierarchy, or available actions.

---

## 3. Shell, grid, spacing

- Container: max-width **1320px**, paddings 24px (desktop), 16px (mobile).
- Base spacing step: 8px; 48–64px between sections; 16–20px inside cards.
- Product grid: desktop 4–5 columns (3–4 on catalog pages with the sidebar),
  tablet 3, mobile 2. Gap 16–20px.
- Catalog page: **left filter sidebar 260–280px + content** (classic YM).
- Product page (PDP): 2 columns — gallery on the left, sticky buy panel on the right.
- Fully responsive down to **320px**; filters on mobile — a bottom sheet.
- In the mini app the page reserves `calc(6rem + safe-bottom)` of bottom padding
  so the navigation island never covers the last row of content.

### 3.1 Header

**Web (desktop/responsive):** a single row on the canvas with a
`--xr-color-border-soft` bottom border:

```
[Logo] [«Catalog» button ▦, --xr-color-primary] [——— Search (full width) ——— 🔍]
       [Orders] [Favorites] [Cart •n] [Sign in / Account]
```

- The "Catalog" button opens a **mega menu** (like YM): the 3 root sections on
  the left (Equipment / Seeds / Produce), subcategory columns of the selected
  section on the right. Sections never overlap — they are full catalog branches,
  not filters.
- Search: `--xr-radius-md` input on `--xr-color-well`, `--xr-color-border`
  border, magnifier button inside on the right. Suggestions in a
  `--xr-radius-xl` popover.
- Right-side icons — lucide, 24px, 1.5–2px stroke, with a 12px label underneath.
- For a non-verified user, show a **"Verification"** button (outline, with a
  `--xr-color-warning` dot) instead of "Account"; after verification it is
  replaced by the account icon.
- Below the header on the home page and in the catalog — a **horizontal
  category chip row** (scrolls on X).

**Mini app:** the header is transparent — no coloured band competing with
Telegram's own chrome. It carries only the back control (browser environment
only; inside Telegram the host back button owns this) and the share control.
Page identity is carried by the page header primitive in the content, not by the
chrome.

### 3.2 Bottom navigation (mini app)

A floating island, max-width 30rem, centered, inset from the screen edges by
`max(0.75rem, safe-inset)`:

- Each destination is a grid of **filled glyph above a visible text label**.
  Icon-only navigation is forbidden; `sr-only` labels are not labels.
- The active destination gets a filled blue plate **and** `aria-current="page"`.
  Colour never carries the state alone.
- An optional trailing action (share) sits at the end of the same island.
- Filled glyphs from the shared asset pack are used here and only here: at 24px
  inside a filled plate, a 2px lucide stroke loses too much contrast on a
  low-DPI Android screen. Lucide owns every other icon in the product.

### 3.3 Footer (web)

Inverted onto `--xr-color-background-deep` with a `--xr-color-border-soft` top
edge and `--xr-radius-xl` top corners. Columns: For buyers / For sellers /
Company / Help; a legal info row.

---

## 4. Pages and blocks (structure — Yandex Market, skin — ours)

### 4.1 Home page

Top to bottom (order as in YM):

1. **Page header**: title, subtitle, and a stat-chip row (balance, open orders).
2. **Hero banner carousel** `--xr-radius-xl`: a gradient panel, large H1 on the
   left, a primary CTA, a source-owned illustration on the right. Pagination
   dots are circular.
3. **Quick scenario tiles** (2–4 cards in a row): "Create an order",
   "Request a sample", "Become a seller", "Verification" — panels with a
   category mark.
4. **"Popular in Seeds" shelf** — H2 title + "See all →" link, a horizontal
   product card strip (scroll, circular arrows at the edges).
5. **"Equipment" shelf**, **"Produce" shelf** — same pattern, one per section.
6. **"How orders work"** — three step panels with status badges.
7. **"New sellers" shelf / manufacturer promo** — paid promotion carries a
   visible "Ad" caption.
8. Verification CTA panel → footer.

### 4.2 Section catalog (Equipment / Seeds / Produce)

YM listing structure:

- Breadcrumbs (caption, `--xr-color-muted`).
- Section H1 + product count as a caption; a "Sort" select on the right.
- A row of active filter chips (with an inline ✕).
- **Left filter sidebar** (panel): each section has its own filters. MVP set:
  - Common: price (range), seller region, seller rating, "Verified only"
    (toggle), "Sample available" (toggle), in stock, manufacturer.
  - Seeds: crop, certification, sowing season, packaging/volume.
  - Equipment: machinery type, condition (new/used), power, brand.
  - Produce: product category, minimum lot (tons), shelf life / harvest year.
  - Buttons: "Show N products" (primary) + a text "Reset" link.
- Product grid on the right, 3–4 columns; below — "Show more" pagination
  (outline).

Empty text and price filters render localized example placeholders and never
submit those examples as values.

### 4.3 Product card in the grid

Gradient panel, `--xr-radius-xl`. Hover: border lightens and the card lifts 2px
— no shadow bloom, and both collapse under reduced motion.

```
[Photo --xr-radius-lg, favorite heart overlaid]
[Tags: up to 2 chips 12px ("Certified", "Sample")]
[Price 700 + unit ("UZS/t", "UZS/pc"); min lot as caption]
[Title, max 2 lines]
[Manufacturer + Verified status badge if verified]
[★ 4.8 · 124 reviews — caption]
["Add to cart" button, primary, full width]
```

Missing media renders the section's category mark on a tinted plate, never a
broken image or an unlabeled box.

### 4.4 Product page (PDP)

Breadcrumbs → H1 → a "★ rating · reviews · SKU" row. Gallery on the left
(vertical thumbnails + a large `--xr-radius-lg` photo). On the right a **sticky
buy panel**: large price, quantity/packaging selector, delivery terms (pickup /
by seller / by agreement), buttons: "Add to cart" (primary), "Request a sample"
(outline, with a caption "N samples left this month"; for non-verified users it
leads to verification), "Add to favorites".

Below the panel — the **seller capsule**: emblem + name + Verified badge +
"Since 20XX" + rating + "All seller products". Below that, full-width tabs:
Description / Specifications / Reviews / Delivery. A "Similar products" shelf at
the bottom.

### 4.5 Cart (multi-carts)

- One cart = one seller. On top — horizontal tabs of carts:
  `[Seller emblem · N items]`.
- Item list on the left (list rows with quantity steppers), sticky summary on
  the right: total, delivery choice (the 3 Stage-1 radio options), "Checkout"
  (accent — this is settled value), "Request a sample for this cart" (outline).
- Checkout is impossible without verification: on click, show a modal
  "Verification required" with the Verified status badge and a CTA.
- Before order confirmation — the **contract step**: a contract preview screen,
  a consent checkbox, and a "Sign and send to seller" button.
- A signed-out or unverified visitor's cart is an explicitly labelled
  device-local preview. It never calls a cart, order, contract, or payment
  mutation.

### 4.6 Orders (reverse auction)

- **Order feed** (for sellers/farmers): list rows — crop/product + volume,
  region, deadline, budget, status chips; an "Make an offer" button.
- **Order creation** (buyer/farmer): a step-by-step form in a panel
  (product → volume → region → deadline → budget → requirements) with progress
  dots; CTA "Create request".
- **My order page**: request parameters on top, below — a list of seller offers
  (price, timing, delivery, rating, Verified badge), a "Choose offer" button
  (accent) → then the standard cart → contract flow.

### 4.7 Personal account (role-based)

Shell: vertical menu on the left (panel, active item is a filled primary plate),
content panels on the right. Menu sets:

- **Manufacturer/Supplier**: Farmer orders (participate) · Purchases (accept /
  in progress) · My products · Sales statistics and analytics · Contracts
  (statuses) · Profile/verification.
- **Farmer**: Buyer orders · Buyer purchases · My orders (to manufacturers) ·
  Contracts (both sides) · Sales and purchase statistics · Profile/verification.
- **Buyer**: My orders · Contracts with farmers · Purchase statistics · Profile.

Dashboard: a stat-well row (display-face number + caption) + a chart (lines/bars
in the primary range, `--xr-color-border-soft` gridlines) + a recent deals list.
Statuses are chips: Active `--xr-color-success-text`, Pending
`--xr-color-warning`, Completed outline, Rejected `--xr-color-destructive` (text
only, no fill).

### 4.8 Verification

A dedicated wizard flow (a centered panel): steps OneID → role type → document
upload (land / lease / cadastre / farm; machinery and warehouse marked
"optional") → "Under review" status. File uploaders are dashed
`--xr-radius-xl` zones. Success — a screen with the Verified status badge.
Afterwards the badge shows next to the name everywhere.

### 4.9 Contracts

A list of contract cards: parties (two seller capsules), subject, amount, status
chip, an "Open PDF" button. Contract detail — a document panel with the Contract
status badge and a status timeline (dots on a vertical `--xr-color-primary`
line). Here also the deferred payment / factoring block: a "Deferred payment via
a partner bank" panel with an honest description of the terms.

### 4.10 AI consultant

A floating round button at the bottom right (`--xr-color-primary`, sprout icon),
offset above the navigation island → a slide-out chat panel: an input, quick-
question chips ("Pick seeds for my region", "What a beginner farmer needs",
"Find it cheaper"). Answers may include mini product cards (a compact version of
the 4.3 card).

---

## 5. Components — consolidated rules

- **Buttons**: 44px height (`sm` 36, `lg` 48), `--xr-radius-md`, weight 700.
  Primary — blue gradient + `--xr-glow-primary`. Accent — gold gradient +
  `--xr-glow-accent`, for value-bearing confirmations only. Secondary — well
  background, `--xr-color-border` border. Ghost — primary text, no background.
  Disabled — reduced opacity with the border retained.
- **Inputs/selects**: `--xr-radius-md`, `--xr-color-well` background,
  `--xr-color-border` border; focus — `--xr-focus-ring`. Labels above, 13px 600.
- **Filter chips**: default — well + border; hover — border lightens; active —
  filled primary.
- **Tabs** — chips, no underlines.
- **Rating** — `--xr-color-accent` stars, number at 600.
- **Toasts/alerts** — panels with a coloured status dot and a distinct status
  glyph on the left.
- **Modals** — `--xr-radius-xl`, `--xr-shadow-lg`, overlay `rgb(0 0 0 / 0.6)`.
- **Skeletons** — `--xr-color-well` → `--xr-color-surface` shimmer, static under
  reduced motion.
- **Icons** — lucide, 1.5–2px stroke, everywhere except the bottom navigation.
- **Empty state** — a source-owned illustration plate + one line of text + a
  primary CTA.
- **Targets** — 44px minimum hit area. A control may be _drawn_ smaller than its
  target: extend it with a transparent `::after` rather than inflating the
  visual.
- **Transient outcomes** — announced by a polite live region. A control's
  accessible name never flips to a status message; only its glyph changes.

---

## 6. Forbidden (anti-patterns)

- Pure black `#000` as a surface; grey `#f5f5f5`-style backgrounds; radii under
  12px on buttons and cards.
- Reusing `--xr-color-accent` or `--xr-color-success` as text on light surfaces
  — use the `-text` tokens.
- Gold as a general-purpose highlight, or more than one accent element per
  viewport.
- **Any chance mechanic, streak, spinner, reward loop, loot affordance, or
  "winnings" language.** The visual system is close to a game's density; the
  behavior must never be. DehqonHub extends real agricultural credit.
- Copying the reference app's identity: its name, artwork, subject matter,
  mascots, or screen copy.
- Icon-only navigation, `sr-only` navigation labels, or an active state carried
  by colour alone.
- Drop shadows on resting panels; glassmorphism; more than one type family
  beyond the defined pair; all-caps text.
- Marketplace-red price tags.
- Copying Yandex's brand colours — from YM the project takes structure and UX
  patterns only.
- Hiding the "Ad" label on promoted products.
- Restating token values in application CSS instead of consuming `--xr-*`.

---

## 7. Languages and currency

Interface: ru (primary) + uz (provide a switcher in the header); en optional.
Currency — UZS (som), format `12 500 000 UZS`, thousands separated by
non-breaking spaces. Volumes — t/kg, land area — ha.

Russian and Uzbek expansion must not clip navigation labels, wrap a button into
three lines, or create horizontal overflow at the 320px floor.
