// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CartViewDto } from '@app/frontend-api-client';
import type { MarketplaceListing } from '../ui/marketplace-ui';

const storageKey = 'dehqonhub.marketplace.guest-cart.v1';
const guestCartPrefix = 'guest-cart:';
const maximumLines = 100;
const maximumQuantity = 999;
const identifierPattern = /^[A-Za-z0-9:_-]{1,160}$/u;
const guestStamp = '2026-08-01T00:00:00.000Z';

interface StoredGuestCartLine {
  listingPublicationId: string;
  quantity: number;
  seller: { displayName: string; id: string; region: string };
  sourceKind: 'produce' | 'product';
}

interface StoredGuestCart {
  lines: StoredGuestCartLine[];
  version: 1;
}

const isShortText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 160;

const isStoredLine = (value: unknown): value is StoredGuestCartLine => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const line = value as Partial<StoredGuestCartLine>;
  const seller = line.seller as Partial<StoredGuestCartLine['seller']> | undefined;
  return (
    typeof line.listingPublicationId === 'string' &&
    identifierPattern.test(line.listingPublicationId) &&
    Number.isInteger(line.quantity) &&
    Number(line.quantity) > 0 &&
    Number(line.quantity) <= maximumQuantity &&
    (line.sourceKind === 'produce' || line.sourceKind === 'product') &&
    seller !== undefined &&
    typeof seller.id === 'string' &&
    identifierPattern.test(seller.id) &&
    isShortText(seller.displayName) &&
    isShortText(seller.region)
  );
};

const parseStoredLines = (value: string | null): StoredGuestCartLine[] => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredGuestCart>;
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) {
      return [];
    }
    return parsed.lines.filter(isStoredLine).slice(0, maximumLines);
  } catch {
    return [];
  }
};

const readLines = (): StoredGuestCartLine[] => {
  try {
    return parseStoredLines(globalThis.localStorage.getItem(storageKey));
  } catch {
    return [];
  }
};

const writeLines = (lines: readonly StoredGuestCartLine[]): void => {
  try {
    const value: StoredGuestCart = { lines: lines.slice(0, maximumLines), version: 1 };
    globalThis.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Embedded and private browsers may deny storage. Current-page state still works.
  }
};

const toCarts = (lines: readonly StoredGuestCartLine[]): CartViewDto[] => {
  const grouped = new Map<string, StoredGuestCartLine[]>();
  for (const line of lines) {
    const sellerLines = grouped.get(line.seller.id);
    if (sellerLines) {
      sellerLines.push(line);
    } else {
      grouped.set(line.seller.id, [line]);
    }
  }
  return [...grouped.entries()].map(([sellerId, sellerLines]) => ({
    createdAt: guestStamp,
    id: `${guestCartPrefix}${sellerId}`,
    items: sellerLines.map((line) => ({
      listingPublicationId: line.listingPublicationId,
      quantity: line.quantity,
      sourceKind: line.sourceKind,
    })),
    seller: {
      displayName: sellerLines[0]?.seller.displayName ?? sellerId,
      region: sellerLines[0]?.seller.region ?? '—',
    },
    status: 'open',
    updatedAt: guestStamp,
  }));
};

export interface GuestCart {
  add: (listing: MarketplaceListing, quantity?: number) => void;
  carts: CartViewDto[];
  owns: (cartId: string) => boolean;
  update: (cartId: string, listingPublicationId: string, quantity: number) => void;
}

export function useGuestCart(): GuestCart {
  const [lines, setLines] = useState<StoredGuestCartLine[]>(readLines);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setLines(parseStoredLines(event.newValue));
      }
    };
    globalThis.addEventListener('storage', onStorage);
    return () => {
      globalThis.removeEventListener('storage', onStorage);
    };
  }, []);

  const persist = useCallback((change: (current: StoredGuestCartLine[]) => StoredGuestCartLine[]) => {
    setLines((current) => {
      const next = change(current).slice(0, maximumLines);
      writeLines(next);
      return next;
    });
  }, []);

  const add = useCallback(
    (listing: MarketplaceListing, quantity = 1) => {
      if (!identifierPattern.test(listing.id) || !identifierPattern.test(listing.supplierId)) {
        return;
      }
      const safeQuantity = Math.max(1, Math.min(maximumQuantity, Math.trunc(quantity)));
      persist((current) => {
        const existing = current.find((line) => line.listingPublicationId === listing.id);
        if (existing) {
          return current.map((line) =>
            line.listingPublicationId === listing.id
              ? { ...line, quantity: Math.min(maximumQuantity, line.quantity + safeQuantity) }
              : line,
          );
        }
        return [
          ...current,
          {
            listingPublicationId: listing.id,
            quantity: safeQuantity,
            seller: {
              displayName: listing.supplierName.slice(0, 160) || listing.supplierId,
              id: listing.supplierId,
              region: listing.region.slice(0, 160) || '—',
            },
            sourceKind: listing.kind,
          },
        ];
      });
    },
    [persist],
  );

  const update = useCallback(
    (cartId: string, listingPublicationId: string, quantity: number) => {
      persist((current) =>
        current
          .map((line) =>
            `${guestCartPrefix}${line.seller.id}` === cartId && line.listingPublicationId === listingPublicationId
              ? { ...line, quantity: Math.min(maximumQuantity, Math.trunc(quantity)) }
              : line,
          )
          .filter((line) => line.quantity > 0),
      );
    },
    [persist],
  );

  return {
    add,
    carts: useMemo(() => toCarts(lines), [lines]),
    owns: useCallback((cartId: string) => cartId.startsWith(guestCartPrefix), []),
    update,
  };
}

export const guestCartStorageKey = storageKey;
