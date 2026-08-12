import type { CartViewDto, FavoriteViewDto, ProductViewDto } from '@app/frontend-api-client';

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

const guestTenantId = 'guest';
const guestUserId = 'guest';
/** Fixed stamp: nothing in the UI sorts on it, and a constant keeps renders stable. */
const guestStamp = '2026-08-01T00:00:00.000Z';

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

const isProductIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export const readGuestFavoriteIds = (): string[] => {
  const stored = readJson<unknown>(favoritesKey, []);
  return isProductIdList(stored) ? stored : [];
};

const toFavorite = (productId: string): FavoriteViewDto => ({
  createdAt: guestStamp,
  productId,
  tenantId: guestTenantId,
  userId: guestUserId,
});

export const readGuestFavorites = (): FavoriteViewDto[] => readGuestFavoriteIds().map(toFavorite);

/** Flips one product's favourite state and returns the persisted list. */
export const toggleGuestFavorite = (productId: string): FavoriteViewDto[] => {
  const current = readGuestFavoriteIds();
  const next = current.includes(productId) ? current.filter((entry) => entry !== productId) : [...current, productId];
  writeJson(favoritesKey, next);
  return next.map(toFavorite);
};

interface StoredCartLine {
  productId: string;
  quantity: number;
  sellerId: string;
}

const isStoredCartLine = (value: unknown): value is StoredCartLine => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const line = value as Partial<StoredCartLine>;
  return typeof line.productId === 'string' && typeof line.sellerId === 'string' && typeof line.quantity === 'number';
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
    items: sellerLines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    sellerId,
    status: 'open',
    tenantId: guestTenantId,
    updatedAt: guestStamp,
    userId: guestUserId,
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

  return persistLines([...lines, { productId: product.id, quantity, sellerId: product.supplierId }]);
};

/** Sets an absolute quantity; a non-positive value removes the line. */
export const updateGuestCartItem = (productId: string, quantity: number): CartViewDto[] => {
  const lines = readCartLines().map((line) => (line.productId === productId ? { ...line, quantity } : line));
  return persistLines(lines);
};

/** Empties one seller's cart — the guest stand-in for placing its order. */
export const clearGuestCart = (cartId: string): CartViewDto[] =>
  persistLines(readCartLines().filter((line) => `guest-cart-${line.sellerId}` !== cartId));
