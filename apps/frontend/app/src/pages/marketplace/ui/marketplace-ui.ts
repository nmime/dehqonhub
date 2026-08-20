import type { Locale } from '@app/frontend-runtime';
import type { MarketplacePublicListingDto, MarketplacePublicRequestDto } from '@app/frontend-api-client';

export type MarketplaceView =
  | 'account'
  | 'cart'
  | 'catalog'
  | 'contract'
  | 'deals'
  | 'embedded'
  | 'favorites'
  | 'home'
  /** The seller's or farmer's own listing-creation screen at `/listings/new`. */
  | 'newListing'
  | 'party'
  | 'product'
  | 'requests'
  | 'seller'
  | 'verification';

export type MarketplaceSection = 'all' | 'equipment' | 'produce' | 'seeds';

export type MarketplaceNavigate = (to: string, options?: { replace?: boolean }) => void;
export type MarketplaceTranslate = (key: string, params?: Record<string, number | string>) => string;

export interface MarketplaceNotice {
  id: string;
  kind: 'error' | 'info' | 'success';
  /** Set while the toast plays its exit animation, just before it is dropped. */
  leaving?: boolean;
  message: string;
}

/**
 * A listing's published rating aggregate, exactly as the API reports it. The
 * average is already rounded to one decimal by the server, so every surface
 * quotes the same number instead of rounding a raw quotient its own way.
 */
export interface MarketplaceListingRating {
  average: number | null;
  count: number;
}

/** Renderer-owned projection of a public listing. The id always remains the opaque publication id. */
export interface MarketplaceListing {
  category: 'equipment' | 'fertilizer' | 'irrigation' | 'other' | 'pesticide' | 'seed';
  /** Produce only: the crop behind the listing, which the produce facets filter on. */
  crop?: string;
  description: string;
  /** Produce only: A, B or C, as the harvest was graded. */
  grade?: string;
  id: string;
  images: string[];
  kind: 'produce' | 'product';
  name: string;
  nameRu?: string;
  nameUz?: string;
  nameUzCyrl?: string;
  priceUzs: number;
  promoted: boolean;
  provenance: 'live' | 'demo';
  publishedAt: string;
  /**
   * The server's own rating aggregate for this listing. `average` is `null` and
   * `count` is `0` for a listing nobody has reviewed, which is a fact to state
   * rather than a number to invent: the renderer never substitutes a placeholder
   * score, and the count always travels with the average so a rounded `4.7` can
   * be checked against the reviews it came from.
   */
  rating: MarketplaceListingRating;
  region: string;
  sampleAvailable: boolean;
  section: 'equipment' | 'produce' | 'seeds';
  status: 'active' | 'out_of_stock';
  stockQuantity: number;
  supplierId: string;
  supplierName: string;
  supplierVerified?: boolean;
  transactional: boolean;
  unit: string;
  /** Last publication revision, which the detail page reports as the freshness of the offer. */
  updatedAt?: string;
}

export type MarketplaceRequestFeedItem = MarketplacePublicRequestDto & { status: 'open' };

export const toMarketplaceListing = (listing: MarketplacePublicListingDto): MarketplaceListing => ({
  category: listing.kind === 'product' ? listing.category : 'other',
  ...(listing.kind === 'produce' ? { crop: listing.crop, grade: listing.grade } : {}),
  description: listing.description ?? '',
  id: listing.id,
  images: listing.images,
  kind: listing.kind,
  name: listing.title,
  ...(listing.titleRu ? { nameRu: listing.titleRu } : {}),
  ...(listing.titleUz ? { nameUz: listing.titleUz } : {}),
  ...(listing.titleUzCyrl ? { nameUzCyrl: listing.titleUzCyrl } : {}),
  priceUzs: listing.priceUzs,
  promoted: listing.promoted,
  provenance: listing.provenance,
  publishedAt: String(listing.publishedAt),
  rating: { average: listing.rating.average, count: listing.rating.count },
  region: listing.region,
  sampleAvailable: listing.sampleAvailable,
  section: listing.section,
  status: listing.availableQuantity > 0 ? 'active' : 'out_of_stock',
  stockQuantity: listing.availableQuantity,
  supplierId: listing.seller.id,
  supplierName: listing.seller.displayName,
  supplierVerified: listing.seller.verified,
  transactional: listing.transactional,
  unit: listing.unit,
  updatedAt: String(listing.updatedAt),
});

export const toMarketplaceRequestFeedItem = (request: MarketplacePublicRequestDto): MarketplaceRequestFeedItem => ({
  ...request,
  status: 'open',
});

const intlLocaleByLocale: Record<Locale, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  uz: 'uz-UZ',
  'uz-cyrl': 'uz-Cyrl-UZ',
};

export const sectionForProduct = (product: MarketplaceListing): MarketplaceSection => product.section;

export const localizedProductName = (product: MarketplaceListing, locale: Locale): string => {
  if (locale === 'ru' && product.nameRu) {
    return product.nameRu;
  }
  if (locale === 'uz' && product.nameUz) {
    return product.nameUz;
  }
  if (locale === 'uz-cyrl') {
    return product.nameUzCyrl ?? product.nameUz ?? product.name;
  }
  return product.name;
};

export const formatMoney = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(intlLocaleByLocale[locale], {
    currency: 'UZS',
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
    style: 'currency',
  })
    .format(value)
    .replace(/\sUZS/u, '\u00a0UZS');

/**
 * A ratio the API reports in basis points, rendered as a percentage. The
 * cabinet's offer conversion is the only such figure on screen, and formatting
 * it by hand would put a Latin decimal point into the Russian and Uzbek
 * surfaces.
 */
export const formatPercent = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(intlLocaleByLocale[locale], {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value);

/**
 * A rating average as one decimal in the reader's locale, so Russian and Uzbek
 * surfaces get `4,7` rather than a Latin decimal point. The server already
 * rounded the value; this only spells it, and it always prints the decimal so a
 * whole `5` reads as `5,0` beside its neighbours instead of looking like a
 * different kind of number.
 */
export const formatRating = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(intlLocaleByLocale[locale], {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);

/** The short month a `YYYY-MM` activity bucket names, for a chart axis label. */
export const formatMonth = (month: string, locale: Locale): string => {
  const parsed = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return month;
  }
  return new Intl.DateTimeFormat(intlLocaleByLocale[locale], { month: 'short', timeZone: 'UTC' }).format(parsed);
};

export const formatDate = (value: Date | string | undefined, locale: Locale): string => {
  if (!value) {
    return '—';
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat(intlLocaleByLocale[locale], {
    dateStyle: 'medium',
  }).format(parsed);
};

export const querySection = (search?: string): MarketplaceSection => {
  if (search === undefined && typeof globalThis.location === 'undefined') {
    return 'all';
  }
  const section = new URLSearchParams(search ?? globalThis.location.search).get('section');
  return section === 'equipment' || section === 'produce' || section === 'seeds' ? section : 'all';
};

export const querySearch = (search?: string): string => {
  if (search === undefined && typeof globalThis.location === 'undefined') {
    return '';
  }
  return new URLSearchParams(search ?? globalThis.location.search).get('q') ?? '';
};

/**
 * The one verification role that may buy or sell, restated for the browser.
 *
 * The server's `marketplaceBuyerRoles` / `marketplaceSellerRoles` in
 * `@app/backend-feature-agritech-shared` remain the authority — a backend
 * library the browser bundle must not import — so the renderer keeps a single
 * derived copy here instead of repeating `role === 'buyer' || role === 'farmer'`
 * at each control. Every surface that decides whether a control is offered, and
 * every hint that explains why it is not, reads these two predicates, so a
 * capability can never be granted on one route and withheld on another.
 *
 * The model is the owner's, and it is not symmetric: a farmer both buys and
 * sells, a buyer only buys, and a supplier only sells. A capability that is
 * outside the actor's role is therefore not a step they can complete — it is
 * absent — which is the distinction the access copy has to make.
 */
export type MarketplaceRole = 'buyer' | 'farmer' | 'seller';

/**
 * The parameter is a plain string rather than `MarketplaceRole` because several
 * renderers receive the role as an unnarrowed prop. A predicate over a closed
 * set is exactly the place where an unrecognized value must answer `false`
 * rather than fail to compile at the call site.
 */
export const marketplaceRoleCanBuy = (role: string | undefined): boolean => role === 'buyer' || role === 'farmer';

export const marketplaceRoleCanSell = (role: string | undefined): boolean => role === 'seller' || role === 'farmer';

/** The two things a listing can be, as the publication source kinds name them. */
export type MarketplaceListingKind = 'produce' | 'product';

/**
 * Which listing a role may create — the single home of the creation rule.
 *
 * Creating is narrower than selling, so it is expressed here rather than
 * derived from {@link marketplaceRoleCanSell}. A seller lists what a supplier
 * puts out: seeds, inputs and machinery, which is the `product` source kind. A
 * farmer lists a harvest, which is the `produce` source kind. Those are not two
 * halves of one permission: each role has exactly one kind, so the kind is
 * decided here and never offered to the actor as a choice.
 *
 * A buyer gets `undefined`. That is the whole of the buyer rule: the header
 * entry, the route and the form all read this one function, so the entry cannot
 * appear on one surface while the route refuses on another.
 */
export const marketplaceListingKindForRole = (role: string | undefined): MarketplaceListingKind | undefined => {
  if (role === 'seller') {
    return 'product';
  }
  return role === 'farmer' ? 'produce' : undefined;
};

/** True for a role that may create a listing at all; see {@link marketplaceListingKindForRole}. */
export const marketplaceRoleCanCreateListing = (role: string | undefined): boolean =>
  marketplaceListingKindForRole(role) !== undefined;

/**
 * Which catalog section a created listing publishes into.
 *
 * The section is a property of the listing, not a choice: the discovery facets
 * split machinery and irrigation from the remaining inputs, and a harvest is
 * always produce. Deriving it here keeps the create screen and the cabinet's
 * publish action agreeing on one answer.
 */
export const marketplaceListingSectionFor = (
  kind: MarketplaceListingKind,
  category: string | undefined,
): 'equipment' | 'produce' | 'seeds' => {
  if (kind === 'produce') {
    return 'produce';
  }
  return category === 'equipment' || category === 'irrigation' ? 'equipment' : 'seeds';
};
