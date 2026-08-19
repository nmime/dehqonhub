// @requirements REQ-AGRITECH-EXPERIENCE-026
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceProductSpecs } from './marketplace-product-specs';
import { formatDate, type MarketplaceListing, type MarketplaceTranslate } from './marketplace-ui';

const t: MarketplaceTranslate = (key, params) =>
  params
    ? `${key}:${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')}`
    : key;

const baseListing: MarketplaceListing = {
  category: 'seed',
  description: 'Certified corn seed description',
  id: 'listing-1',
  images: [],
  kind: 'product',
  name: 'Certified corn seed',
  priceUzs: 1_250_000,
  promoted: false,
  provenance: 'live',
  publishedAt: '2026-08-01T09:00:00.000Z',
  rating: { average: 4.6, count: 12 },
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-a',
  supplierName: 'Seller A',
  transactional: true,
  unit: 't',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

const produceListing: MarketplaceListing = {
  ...baseListing,
  category: 'other',
  crop: 'Tomato',
  grade: 'B',
  id: 'listing-2',
  kind: 'produce',
  name: 'Greenhouse tomatoes',
  section: 'produce',
  unit: 'kg',
};

const renderSpecs = (product: MarketplaceListing, onOpenSeller = vi.fn()) => {
  render(<MarketplaceProductSpecs locale="en" onOpenSeller={onOpenSeller} product={product} t={t} />);
  return onOpenSeller;
};

/** Reads the description value that follows a rendered spec label. */
const rowValue = (label: string): string => screen.getByText(label).nextElementSibling?.textContent ?? '';

afterEach(cleanup);

describe('MarketplaceProductSpecs', () => {
  it('surfaces the produce facets the catalog filters on', () => {
    renderSpecs(produceListing);

    expect(rowValue('agritech.marketplace.filter.crop')).toBe('Tomato');
    expect(rowValue('agritech.marketplace.filter.grade')).toBe('agritech.marketplace.filter.gradeValue:grade=B');
    expect(screen.queryByText('agritech.marketplace.filter.category')).toBeNull();
  });

  it('surfaces the input category the catalog filters on', () => {
    renderSpecs(baseListing);

    expect(rowValue('agritech.marketplace.filter.category')).toBe('agritech.marketplace.category.seed');
    expect(screen.queryByText('agritech.marketplace.filter.crop')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.filter.grade')).toBeNull();
  });

  it('stays silent about a category the catalog never offers as a facet', () => {
    renderSpecs({ ...baseListing, category: 'other' });

    expect(screen.queryByText('agritech.marketplace.filter.category')).toBeNull();
  });

  it('groups the goods before the commercial terms', () => {
    renderSpecs(baseListing);

    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.textContent).toContain('agritech.marketplace.product.specs');
    expect(groups[0]?.textContent).toContain('agritech.marketplace.product.unit');
    expect(groups[1]?.textContent).toContain('agritech.marketplace.product.terms');
    expect(groups[1]?.textContent).toContain('agritech.marketplace.product.sku');
  });

  it('reports the unit, stock, publication dates and publication id', () => {
    renderSpecs(baseListing);

    expect(rowValue('agritech.marketplace.product.unit')).toBe('t');
    expect(rowValue('agritech.marketplace.product.stock')).toBe('20 t');
    expect(rowValue('agritech.marketplace.filter.region')).toBe('Samarqand');
    expect(rowValue('agritech.marketplace.product.published')).toBe(formatDate(baseListing.publishedAt, 'en'));
    expect(rowValue('agritech.marketplace.product.updated')).toBe(formatDate(baseListing.updatedAt, 'en'));
    expect(rowValue('agritech.marketplace.product.sku')).toBe('listing-1');
  });

  it('omits rows the API did not provide instead of dashing them out', () => {
    renderSpecs({ ...baseListing, region: '', unit: '', updatedAt: undefined });

    expect(screen.queryByText('agritech.marketplace.product.updated')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.filter.region')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.product.unit')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('carries the same tags as the catalog card', () => {
    renderSpecs({ ...baseListing, promoted: true, supplierVerified: true });

    expect(screen.getByText('agritech.marketplace.product.inStock')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.product.sampleBadge')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.product.promoted')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.product.sellerVerified')).toBeTruthy();
    expect(screen.getAllByText('Samarqand').length).toBeGreaterThan(0);
  });

  it('reports an exhausted listing as out of stock', () => {
    renderSpecs({ ...baseListing, promoted: false, sampleAvailable: false, status: 'out_of_stock', stockQuantity: 0 });

    expect(screen.getByText('agritech.marketplace.product.outOfStock')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.product.inStock')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.product.sampleBadge')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.product.promoted')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.product.sellerVerified')).toBeNull();
  });

  it('opens the seller profile from the seller row', () => {
    const onOpenSeller = renderSpecs(baseListing);

    fireEvent.click(screen.getByRole('button', { name: 'Seller A' }));

    expect(onOpenSeller).toHaveBeenCalledTimes(1);
  });
});
