// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Which seller cart the buyer is currently working on. One order is one cart and
 * one cart is one seller, so the marketplace cart route keeps several sub-carts
 * side by side and exactly one of them active. The selection is stored with the
 * same versioned, fail-closed discipline as the guest cart itself
 * (`use-guest-cart.ts`): an unknown version is discarded rather than migrated,
 * because a stale pointer carries no purchasing value worth recovering.
 */
const storageKey = 'dehqonhub.marketplace.active-seller-cart.v1';
const identifierPattern = /^[A-Za-z0-9:_-]{1,160}$/u;

interface StoredActiveSellerCart {
  cartId: string;
  version: 1;
}

const parseStoredCartId = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredActiveSellerCart>;
    if (parsed.version !== 1 || typeof parsed.cartId !== 'string' || !identifierPattern.test(parsed.cartId)) {
      return undefined;
    }
    return parsed.cartId;
  } catch {
    return undefined;
  }
};

const readCartId = (): string | undefined => {
  try {
    return parseStoredCartId(globalThis.localStorage.getItem(storageKey));
  } catch {
    return undefined;
  }
};

const writeCartId = (cartId: string | undefined): void => {
  try {
    if (cartId === undefined) {
      globalThis.localStorage.removeItem(storageKey);
      return;
    }
    const value: StoredActiveSellerCart = { cartId, version: 1 };
    globalThis.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Embedded and private browsers may deny storage. Current-page state still works.
  }
};

export interface ActiveSellerCart {
  /** The resolved active cart id, always one of `cartIds` while any cart exists. */
  activeCartId: string | undefined;
  select: (cartId: string) => void;
}

/**
 * Resolves and persists the active seller cart. The resolution is deterministic:
 * the stored cart when it is still present, otherwise the first cart in server
 * order, so removing the last line of the active cart activates a neighbour
 * instead of leaving a dangling selection.
 */
export function useActiveSellerCart(cartIds: readonly string[]): ActiveSellerCart {
  const [storedCartId, setStoredCartId] = useState<string | undefined>(readCartId);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setStoredCartId(parseStoredCartId(event.newValue));
      }
    };
    globalThis.addEventListener('storage', onStorage);
    return () => {
      globalThis.removeEventListener('storage', onStorage);
    };
  }, []);

  const activeCartId = useMemo(
    () => (storedCartId !== undefined && cartIds.includes(storedCartId) ? storedCartId : cartIds[0]),
    [cartIds, storedCartId],
  );

  useEffect(() => {
    if (activeCartId !== storedCartId) {
      writeCartId(activeCartId);
      setStoredCartId(activeCartId);
    }
  }, [activeCartId, storedCartId]);

  const select = useCallback((cartId: string) => {
    if (!identifierPattern.test(cartId)) {
      return;
    }
    writeCartId(cartId);
    setStoredCartId(cartId);
  }, []);

  return { activeCartId, select };
}

export const activeSellerCartStorageKey = storageKey;
