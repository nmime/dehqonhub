import type { CartViewDto, MarketplaceFavoriteDto, ProductViewDto } from '@app/frontend-api-client';

/**
 * Browser-local marketplace session for a visitor without an account.
 *
 * Favourites and a cart are the two things someone wants before they are willing
 * to register, and both are writes the API only accepts from a signed-in user.
 * They persist in `localStorage` instead, and their shapes match the API DTOs
 * exactly, which lets the page render a guest basket through the same components
 * as a real one.
 */

const favoritesKey = 'dehqonhub.guest.favorites';
const cartsKey = 'dehqonhub.guest.carts';

/** Fixed stamp: nothing in the UI sorts on it, and a constant keeps renders stable. */
const guestStamp = '2026-08-01T00:00:00.000Z';

/**
 * How a catalog row is filed once it reaches a basket. Harvested goods are the
 * produce side of the marketplace; everything a supplier lists is a product.
 */
const sourceKindFor = (category: ProductViewDto['category']): 'produce' | 'product' =>
  category === 'other' ? 'produce' : 'product';

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage;
  } catch {
    // Private-mode Safari and sandboxed iframes throw on property access alone.
    return null;
  }
};

const readJson = <T>(key: string, fallback: T): T => {
  const store = storage();
  if (!store) {
    return fallback;
  }

  try {
    const raw = store.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    // Corrupted or hand-edited payload: start over rather than break the page.
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failure: the in-memory result still reaches the UI.
  }
};

/**
 * A favourite keeps the listing summary the API would have sent, not just an id:
 * the favourites view names what someone saved, and re-reading a name out of the
 * catalog fails for a listing that has since left it.
 */
interface StoredFavorite {
  id: string;
  kind: 'produce' | 'product';
  sampleAvailable: boolean;
  sellerId: string;
  sellerName: string;
  title: string;
}

const isStoredFavorite = (value: unknown): value is StoredFavorite => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const favorite = value as Partial<StoredFavorite>;
  return (
    typeof favorite.id === 'string' &&
    typeof favorite.title === 'string' &&
    typeof favorite.sellerId === 'string' &&
    typeof favorite.sellerName === 'string' &&
    typeof favorite.sampleAvailable === 'boolean' &&
    (favorite.kind === 'produce' || favorite.kind === 'product')
  );
};

const readStoredFavorites = (): StoredFavorite[] => {
  const stored = readJson<unknown>(favoritesKey, []);
  return Array.isArray(stored) ? stored.filter(isStoredFavorite) : [];
};

export const readGuestFavoriteIds = (): string[] => readStoredFavorites().map((favorite) => favorite.id);

const toFavorite = (favorite: StoredFavorite): MarketplaceFavoriteDto => ({
  createdAt: guestStamp,
  listing: {
    id: favorite.id,
    kind: favorite.kind,
    sampleAvailable: favorite.sampleAvailable,
    seller: { displayName: favorite.sellerName, id: favorite.sellerId },
    title: favorite.title,
  },
});

export const readGuestFavorites = (): MarketplaceFavoriteDto[] => readStoredFavorites().map(toFavorite);

/** Flips one product's favourite state and returns the persisted list. */
export const toggleGuestFavorite = (product: ProductViewDto): MarketplaceFavoriteDto[] => {
  const current = readStoredFavorites();
  const next = current.some((favorite) => favorite.id === product.id)
    ? current.filter((favorite) => favorite.id !== product.id)
    : [
        ...current,
        {
          id: product.id,
          kind: sourceKindFor(product.category),
          sampleAvailable: product.sampleAvailable,
          sellerId: product.supplierId,
          sellerName: product.supplierName,
          title: product.name,
        },
      ];
  writeJson(favoritesKey, next);
  return next.map(toFavorite);
};

interface StoredCartLine {
  productId: string;
  quantity: number;
  sellerId: string;
  sellerName: string;
  sellerRegion: string;
  sourceKind: 'produce' | 'product';
}

const isStoredCartLine = (value: unknown): value is StoredCartLine => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const line = value as Partial<StoredCartLine>;
  return (
    typeof line.productId === 'string' &&
    typeof line.sellerId === 'string' &&
    typeof line.sellerName === 'string' &&
    typeof line.sellerRegion === 'string' &&
    typeof line.quantity === 'number' &&
    (line.sourceKind === 'produce' || line.sourceKind === 'product')
  );
};

const readCartLines = (): StoredCartLine[] => {
  const stored = readJson<unknown>(cartsKey, []);
  return Array.isArray(stored) ? stored.filter(isStoredCartLine) : [];
};

/**
 * Groups the flat line store into one cart per seller, mirroring how the API
 * splits a basket across suppliers.
 */
const toCarts = (lines: readonly StoredCartLine[]): CartViewDto[] => {
  const bySeller = new Map<string, StoredCartLine[]>();
  for (const line of lines) {
    const existing = bySeller.get(line.sellerId);
    if (existing) {
      existing.push(line);
    } else {
      bySeller.set(line.sellerId, [line]);
    }
  }

  return [...bySeller.entries()].map(([sellerId, sellerLines]) => ({
    createdAt: guestStamp,
    id: `guest-cart-${sellerId}`,
    items: sellerLines.map((line) => ({
      listingPublicationId: line.productId,
      quantity: line.quantity,
      sourceKind: line.sourceKind,
    })),
    seller: {
      displayName: sellerLines[0]?.sellerName ?? sellerId,
      region: sellerLines[0]?.sellerRegion ?? '',
    },
    status: 'open',
    updatedAt: guestStamp,
  }));
};

export const readGuestCarts = (): CartViewDto[] => toCarts(readCartLines());

const persistLines = (lines: readonly StoredCartLine[]): CartViewDto[] => {
  const kept = lines.filter((line) => line.quantity > 0);
  writeJson(cartsKey, kept);
  return toCarts(kept);
};

/** Adds to the seller's cart, accumulating quantity when the line already exists. */
export const addGuestCartItem = (product: ProductViewDto, quantity: number): CartViewDto[] => {
  const lines = readCartLines();
  const existing = lines.find((line) => line.productId === product.id);
  if (existing) {
    existing.quantity += quantity;
    return persistLines(lines);
  }

  return persistLines([
    ...lines,
    {
      productId: product.id,
      quantity,
      sellerId: product.supplierId,
      sellerName: product.supplierName,
      sellerRegion: product.region,
      sourceKind: sourceKindFor(product.category),
    },
  ]);
};

/** Sets an absolute quantity; a non-positive value removes the line. */
export const updateGuestCartItem = (productId: string, quantity: number): CartViewDto[] => {
  const lines = readCartLines().map((line) => (line.productId === productId ? { ...line, quantity } : line));
  return persistLines(lines);
};

/** Empties one seller's cart — the guest stand-in for placing its order. */
export const clearGuestCart = (cartId: string): CartViewDto[] =>
  persistLines(readCartLines().filter((line) => `guest-cart-${line.sellerId}` !== cartId));
