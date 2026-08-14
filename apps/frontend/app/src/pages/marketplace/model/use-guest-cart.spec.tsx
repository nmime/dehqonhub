// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MarketplaceListing } from '../ui/marketplace-ui';
import { guestCartStorageKey, useGuestCart } from './use-guest-cart';

const listing = (id: string, supplierId: string): MarketplaceListing => ({
  category: 'seed',
  description: 'Certified seed',
  id,
  images: [],
  kind: 'product',
  name: `Listing ${id}`,
  priceUzs: 1200,
  promoted: false,
  provenance: 'demo',
  region: 'Samarkand',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId,
  supplierName: `Seller ${supplierId}`,
  transactional: false,
  unit: 'kg',
});

describe('guest marketplace preview cart', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('groups bounded local lines by seller and persists a versioned payload', () => {
    const { result } = renderHook(() => useGuestCart());
    act(() => {
      result.current.add(listing('listing-1', 'seller-a'), 2);
      result.current.add(listing('listing-2', 'seller-a'));
      result.current.add(listing('listing-3', 'seller-b'), 3);
    });

    expect(result.current.carts).toHaveLength(2);
    expect(result.current.carts[0]?.items).toEqual([
      { listingPublicationId: 'listing-1', quantity: 2, sourceKind: 'product' },
      { listingPublicationId: 'listing-2', quantity: 1, sourceKind: 'product' },
    ]);
    expect(JSON.parse(globalThis.localStorage.getItem(guestCartStorageKey) ?? '{}')).toMatchObject({ version: 1 });
  });

  it('updates and removes only lines that belong to the selected local cart', () => {
    const { result } = renderHook(() => useGuestCart());
    act(() => {
      result.current.add(listing('listing-1', 'seller-a'));
      result.current.add(listing('listing-2', 'seller-b'));
      result.current.update('guest-cart:seller-a', 'listing-1', 4);
      result.current.update('guest-cart:seller-b', 'listing-2', 0);
    });

    expect(result.current.carts).toHaveLength(1);
    expect(result.current.carts[0]?.items[0]?.quantity).toBe(4);
    expect(result.current.owns(result.current.carts[0]?.id ?? '')).toBe(true);
  });

  it('fails closed for malformed stored state', () => {
    globalThis.localStorage.setItem(guestCartStorageKey, '{broken');
    const { result } = renderHook(() => useGuestCart());
    expect(result.current.carts).toEqual([]);
  });
});
