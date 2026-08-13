import type { Locale } from '@app/frontend-runtime';
import type {
  ContractDeliveryQuoteDto,
  CreateRequestDto,
  MarketplaceFavoriteDto,
  ProductViewDto,
  RequestOfferDto,
} from '@app/frontend-api-client';

/**
 * What a form composes, versus what the API is sent. Every commerce command also
 * names the organization it is issued for, and that is the page's business rather
 * than the form's: a form collects what someone typed, and only the page knows
 * which of their organizations is acting.
 */
export type MarketplaceRequestDraft = Omit<CreateRequestDto, 'actingPartnerId'>;
export type MarketplaceOfferDraft = Omit<RequestOfferDto, 'actingPartnerId'>;

/**
 * A delivery quote without the revision it is written against. The revision comes
 * from the contract on screen, not from the form: it is how the API rejects a
 * quote composed against terms the other party has since changed.
 */
export type MarketplaceDeliveryQuoteDraft = Omit<ContractDeliveryQuoteDto, 'expectedRevision'>;

/** The listing summary every engagement record (favourite, sample, review) carries. */
export type MarketplaceListingSummary = MarketplaceFavoriteDto['listing'];

/**
 * `embedded` is the view every non-marketplace route uses: the page renders the
 * shared DehqonHub chrome around its children instead of one of its own surfaces,
 * so auth, settings and the operations consoles sit in the same site rather than
 * a second application with its own header and navigation.
 */
export type MarketplaceView =
  | 'account'
  | 'cart'
  | 'catalog'
  | 'contract'
  | 'embedded'
  | 'favorites'
  | 'home'
  | 'product'
  | 'requests'
  | 'seller'
  | 'verification';

export type MarketplaceSection = 'all' | 'equipment' | 'produce' | 'seeds';

/** The sections a product can be filed under. `all` is a filter value, never a shelf. */
export type MarketplaceProductSection = Exclude<MarketplaceSection, 'all'>;

export type MarketplaceNavigate = (to: string, options?: { replace?: boolean }) => void;
export type MarketplaceTranslate = (key: string, params?: Record<string, number | string>) => string;

export interface MarketplaceNotice {
  kind: 'error' | 'info' | 'success';
  message: string;
}

const intlLocaleByLocale: Record<Locale, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  uz: 'uz-UZ',
  'uz-cyrl': 'uz-Cyrl-UZ',
};

/**
 * Maps every catalog category onto a browsable section. The mapping is total on
 * purpose: an unmapped category fell through to `all`, which no shelf or section
 * tab renders, so those products became unreachable. Crop inputs (fertiliser,
 * crop protection) sit with seeds because that is how they are bought — as one
 * planting-season basket — and `other` is where harvested goods land, which is
 * the produce section's only data source.
 */
export const sectionForProduct = (product: ProductViewDto): MarketplaceProductSection => {
  switch (product.category) {
    case 'equipment':
    case 'irrigation': {
      return 'equipment';
    }
    case 'fertilizer':
    case 'pesticide':
    case 'seed': {
      return 'seeds';
    }
    default: {
      return 'produce';
    }
  }
};

/**
 * The title carried by an engagement listing summary — what a sample request or a
 * saved favourite refers to. Falls back through the base title so a catalog row
 * that was never translated still reads as its own name rather than an id.
 */
export const localizedListingTitle = (listing: MarketplaceListingSummary, locale: Locale): string => {
  switch (locale) {
    case 'ru': {
      return listing.titleRu ?? listing.title;
    }
    case 'uz': {
      return listing.titleUz ?? listing.title;
    }
    case 'uz-cyrl': {
      return listing.titleUzCyrl ?? listing.title;
    }
    default: {
      return listing.title;
    }
  }
};

export const localizedProductName = (product: ProductViewDto, locale: Locale): string => {
  if (locale === 'ru' && product.nameRu) {
    return product.nameRu;
  }
  if (locale === 'uz' && product.nameUz) {
    return product.nameUz;
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
