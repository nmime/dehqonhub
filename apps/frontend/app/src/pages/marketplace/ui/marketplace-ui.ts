import type { Locale } from '@app/frontend-runtime';
import type { MarketplacePublicListingDto, MarketplacePublicRequestDto } from '@app/frontend-api-client';

export type MarketplaceView =
  | 'account'
  | 'cart'
  | 'catalog'
  | 'contract'
  | 'favorites'
  | 'home'
  | 'product'
  | 'requests'
  | 'seller'
  | 'verification';

export type MarketplaceSection = 'all' | 'equipment' | 'produce' | 'seeds';

export type MarketplaceNavigate = (to: string, options?: { replace?: boolean }) => void;
export type MarketplaceTranslate = (key: string, params?: Record<string, number | string>) => string;

export interface MarketplaceNotice {
  kind: 'error' | 'info' | 'success';
  message: string;
}

/** Renderer-owned projection of a public listing. The id always remains the opaque publication id. */
export interface MarketplaceListing {
  category: 'equipment' | 'fertilizer' | 'irrigation' | 'other' | 'pesticide' | 'seed';
  description: string;
  id: string;
  images: string[];
  kind: 'produce' | 'product';
  name: string;
  nameRu?: string;
  nameUz?: string;
  nameUzCyrl?: string;
  priceUzs: number;
  promoted: boolean;
  region: string;
  sampleAvailable: boolean;
  section: 'equipment' | 'produce' | 'seeds';
  status: 'active' | 'out_of_stock';
  stockQuantity: number;
  supplierId: string;
  supplierName: string;
  unit: string;
}

export type MarketplaceRequestFeedItem = MarketplacePublicRequestDto & { status: 'open' };

export const toMarketplaceListing = (listing: MarketplacePublicListingDto): MarketplaceListing => ({
  category: listing.kind === 'product' ? listing.category : 'other',
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
  region: listing.region,
  sampleAvailable: listing.sampleAvailable,
  section: listing.section,
  status: listing.availableQuantity > 0 ? 'active' : 'out_of_stock',
  stockQuantity: listing.availableQuantity,
  supplierId: listing.seller.id,
  supplierName: listing.seller.displayName,
  unit: listing.unit,
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
