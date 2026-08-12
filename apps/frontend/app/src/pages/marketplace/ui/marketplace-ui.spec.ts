// @requirements REQ-AGRITECH-MARKETPLACE-016
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductViewDto } from '@app/frontend-api-client';
import {
  formatDate,
  formatMoney,
  localizedProductName,
  querySearch,
  querySection,
  sectionForProduct,
} from './marketplace-ui';

const product = (overrides: Partial<ProductViewDto> = {}): ProductViewDto => ({
  category: 'seed',
  createdAt: '2026-08-01T00:00:00.000Z',
  description: 'Demo product',
  id: 'product-1',
  images: [],
  name: 'Wheat seed',
  priceUzs: 1_250_000,
  region: 'tashkent',
  status: 'active',
  stockQuantity: 10,
  supplierId: 'supplier-1',
  supplierName: 'Supplier',
  unit: 'kg',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

describe('marketplace presentation helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps every catalog category onto a browsable section', () => {
    expect(sectionForProduct(product({ category: 'equipment' }))).toBe('equipment');
    expect(sectionForProduct(product({ category: 'irrigation' }))).toBe('equipment');
    expect(sectionForProduct(product({ category: 'seed' }))).toBe('seeds');
    expect(sectionForProduct(product({ category: 'fertilizer' }))).toBe('seeds');
    expect(sectionForProduct(product({ category: 'pesticide' }))).toBe('seeds');
    expect(sectionForProduct(product({ category: 'other' }))).toBe('produce');
  });

  it('prefers the translated product name and falls back to the base one', () => {
    const translated = product({ nameRu: 'Семена пшеницы', nameUz: 'Bug‘doy urug‘i' });

    expect(localizedProductName(translated, 'ru')).toBe('Семена пшеницы');
    expect(localizedProductName(translated, 'uz')).toBe('Bug‘doy urug‘i');
    expect(localizedProductName(translated, 'en')).toBe('Wheat seed');
    expect(localizedProductName(product(), 'ru')).toBe('Wheat seed');
    expect(localizedProductName(product(), 'uz')).toBe('Wheat seed');
  });

  it('formats prices with a non-breaking space before the currency code', () => {
    const formatted = formatMoney(1_250_000, 'ru');

    expect(formatted).toContain(' UZS');
    // An ASCII space there would let the amount and the code wrap onto two lines.
    expect(formatted).not.toMatch(/ UZS/u);
    expect(formatMoney(1000, 'en')).toContain('UZS');
  });

  it('formats dates and keeps unusable input visible', () => {
    expect(formatDate(undefined, 'en')).toBe('—');
    expect(formatDate(new Date('2026-08-01T00:00:00.000Z'), 'en')).toContain('2026');
    expect(formatDate('2026-08-01T00:00:00.000Z', 'ru')).toContain('2026');
    expect(formatDate('not a date', 'en')).toBe('not a date');
  });

  it('reads the section and query from an explicit search string', () => {
    expect(querySection('?section=equipment')).toBe('equipment');
    expect(querySection('?section=produce')).toBe('produce');
    expect(querySection('?section=seeds')).toBe('seeds');
    expect(querySection('?section=unknown')).toBe('all');
    expect(querySearch('?q=wheat')).toBe('wheat');
    expect(querySearch('?section=seeds')).toBe('');
  });

  it('falls back to the current address when no search string is given', () => {
    vi.stubGlobal('location', { search: '?q=barley&section=seeds' });

    expect(querySection()).toBe('seeds');
    expect(querySearch()).toBe('barley');
  });

  it('stays neutral where no address exists, as during server rendering', () => {
    vi.stubGlobal('location', undefined);

    expect(querySection()).toBe('all');
    expect(querySearch()).toBe('');
  });
});
