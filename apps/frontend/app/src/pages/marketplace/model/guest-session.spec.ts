// @requirements REQ-AGRITECH-MARKETPLACE-016
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductViewDto } from '@app/frontend-api-client';
import {
  addGuestCartItem,
  clearGuestCart,
  readGuestCarts,
  readGuestFavoriteIds,
  readGuestFavorites,
  toggleGuestFavorite,
  updateGuestCartItem,
} from './guest-session';

const favoritesKey = 'dehqonhub.guest.favorites';
const cartsKey = 'dehqonhub.guest.carts';

/** The seller fields every stored cart line carries alongside its quantity. */
const sellerFields = {
  sellerId: 's-1',
  sellerName: 'Seller One',
  sellerRegion: 'tashkent',
  sourceKind: 'product',
};

const product = (id: string, supplierId: string): ProductViewDto => ({
  category: 'seed',
  createdAt: '2026-08-01T00:00:00.000Z',
  description: 'Demo product',
  id,
  images: [],
  name: id,
  priceUzs: 1000,
  region: 'tashkent',
  sampleAvailable: true,
  status: 'active',
  stockQuantity: 10,
  supplierId,
  supplierName: supplierId,
  unit: 'kg',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

/** Makes property access itself throw, as private-mode Safari does. */
const blockStorageAccess = (): void => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('storage is blocked');
    },
  });
};

const memoryStorage = (initial: Record<string, string> = {}, onWrite?: () => void): Storage => {
  const entries = new Map<string, string>(Object.entries(initial));

  return {
    clear: () => {
      entries.clear();
    },
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      onWrite?.();
      entries.set(key, value);
    },
  } as Storage;
};

describe('marketplace guest session', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });
  });

  it('starts empty when the browser refuses storage access', () => {
    blockStorageAccess();

    expect(readGuestFavoriteIds()).toEqual([]);
    expect(readGuestCarts()).toEqual([]);
    // A write must stay silent as well: the caller still renders its own result.
    expect(() => toggleGuestFavorite(product('product-1', 's-1'))).not.toThrow();
  });

  it('starts empty when nothing has been stored yet', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });

    expect(readGuestFavorites()).toEqual([]);
  });

  it('ignores a corrupted or hand-edited payload', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage({ [cartsKey]: '{"not":"a list"}', [favoritesKey]: 'not json at all' }),
    });

    expect(readGuestFavoriteIds()).toEqual([]);
    expect(readGuestCarts()).toEqual([]);
  });

  it('ignores stored entries of the wrong shape', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage({
        [cartsKey]: JSON.stringify([
          null,
          'line',
          { productId: 'p-1', quantity: 'two', ...sellerFields },
          { productId: 'p-2', quantity: 2, ...sellerFields },
        ]),
        [favoritesKey]: JSON.stringify(['product-1', 7]),
      }),
    });

    expect(readGuestFavoriteIds()).toEqual([]);
    expect(readGuestCarts()).toEqual([
      expect.objectContaining({
        items: [{ listingPublicationId: 'p-2', quantity: 2, sourceKind: 'product' }],
        seller: { displayName: 'Seller One', region: 'tashkent' },
      }),
    ]);
  });

  it('keeps working when the store rejects a write', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage({}, () => {
        throw new Error('quota exceeded');
      }),
    });

    expect(toggleGuestFavorite(product('product-1', 's-1'))).toEqual([
      expect.objectContaining({ listing: expect.objectContaining({ id: 'product-1' }) }),
    ]);
  });

  it('toggles a favourite on and off', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });

    // The stored favourite carries the listing summary the API would have sent,
    // so the favourites view can name what was saved without re-reading it.
    expect(toggleGuestFavorite(product('product-1', 's-1'))).toEqual([
      {
        createdAt: '2026-08-01T00:00:00.000Z',
        listing: {
          id: 'product-1',
          kind: 'product',
          sampleAvailable: true,
          seller: { displayName: 's-1', id: 's-1' },
          title: 'product-1',
        },
      },
    ]);
    expect(readGuestFavoriteIds()).toEqual(['product-1']);

    expect(toggleGuestFavorite(product('product-1', 's-1'))).toEqual([]);
    expect(readGuestFavoriteIds()).toEqual([]);
  });

  it('accumulates quantity and splits the basket per seller', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });

    addGuestCartItem(product('p-1', 's-1'), 2);
    addGuestCartItem(product('p-1', 's-1'), 3);
    const carts = addGuestCartItem(product('p-2', 's-2'), 1);

    expect(carts).toEqual([
      expect.objectContaining({
        id: 'guest-cart-s-1',
        items: [{ listingPublicationId: 'p-1', quantity: 5, sourceKind: 'product' }],
      }),
      expect.objectContaining({
        id: 'guest-cart-s-2',
        items: [{ listingPublicationId: 'p-2', quantity: 1, sourceKind: 'product' }],
      }),
    ]);
  });

  it('sets an absolute quantity and drops the line at zero', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });

    addGuestCartItem(product('p-1', 's-1'), 2);
    addGuestCartItem(product('p-2', 's-1'), 4);

    expect(updateGuestCartItem('p-2', 1)).toEqual([
      expect.objectContaining({
        items: [
          { listingPublicationId: 'p-1', quantity: 2, sourceKind: 'product' },
          { listingPublicationId: 'p-2', quantity: 1, sourceKind: 'product' },
        ],
      }),
    ]);
    expect(updateGuestCartItem('p-1', 0)).toEqual([
      expect.objectContaining({ items: [{ listingPublicationId: 'p-2', quantity: 1, sourceKind: 'product' }] }),
    ]);
  });

  it('clears one seller cart and leaves the others alone', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });

    addGuestCartItem(product('p-1', 's-1'), 1);
    addGuestCartItem(product('p-2', 's-2'), 1);

    expect(clearGuestCart('guest-cart-s-1')).toEqual([expect.objectContaining({ id: 'guest-cart-s-2' })]);
    expect(readGuestCarts()).toEqual([expect.objectContaining({ id: 'guest-cart-s-2' })]);
  });
});
