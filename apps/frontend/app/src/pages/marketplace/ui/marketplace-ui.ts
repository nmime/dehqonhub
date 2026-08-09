import type { Locale } from '@app/frontend-runtime';
import type { ProductViewDto } from '@app/frontend-api-client';

export type MarketplaceView =
  'account' | 'cart' | 'catalog' | 'contract' | 'favorites' | 'home' | 'product' | 'requests' | 'verification';

export type MarketplaceSection = 'all' | 'equipment' | 'produce' | 'seeds';

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
};

export const sectionForProduct = (product: ProductViewDto): MarketplaceSection => {
  if (product.category === 'seed') {
    return 'seeds';
  }
  if (product.category === 'equipment' || product.category === 'irrigation') {
    return 'equipment';
  }
  return 'all';
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
