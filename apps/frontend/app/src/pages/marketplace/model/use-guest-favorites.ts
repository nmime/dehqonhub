// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-ENGAGEMENT-019
import { useCallback, useEffect, useState } from 'react';

const storageKey = 'dehqonhub.marketplace.guest-favorites.v1';
const maximumFavoriteCount = 200;
const publicListingIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

interface StoredGuestFavorites {
  ids: string[];
  version: 1;
}

const parseStoredIds = (value: string | null): Set<string> => {
  if (!value) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredGuestFavorites>;
    if (parsed.version !== 1 || !Array.isArray(parsed.ids)) {
      return new Set();
    }
    return new Set(
      parsed.ids
        .filter((id): id is string => typeof id === 'string' && publicListingIdPattern.test(id))
        .slice(0, maximumFavoriteCount),
    );
  } catch {
    return new Set();
  }
};

const readGuestFavorites = (): Set<string> => {
  try {
    return parseStoredIds(globalThis.localStorage.getItem(storageKey));
  } catch {
    return new Set();
  }
};

const writeGuestFavorites = (ids: ReadonlySet<string>): void => {
  try {
    const value: StoredGuestFavorites = { ids: [...ids].slice(0, maximumFavoriteCount), version: 1 };
    globalThis.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage can be denied in private or embedded browsers. The in-memory
    // favorite still works for the current page and never affects server state.
  }
};

export interface GuestFavorites {
  ids: ReadonlySet<string>;
  toggle: (publicListingId: string) => void;
}

export function useGuestFavorites(): GuestFavorites {
  const [ids, setIds] = useState<Set<string>>(readGuestFavorites);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setIds(parseStoredIds(event.newValue));
      }
    };
    globalThis.addEventListener('storage', onStorage);
    return () => {
      globalThis.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = useCallback((publicListingId: string) => {
    if (!publicListingIdPattern.test(publicListingId)) {
      return;
    }
    setIds((current) => {
      const next = new Set(current);
      if (next.has(publicListingId)) {
        next.delete(publicListingId);
      } else if (next.size < maximumFavoriteCount) {
        next.add(publicListingId);
      }
      writeGuestFavorites(next);
      return next;
    });
  }, []);

  return { ids, toggle };
}

export const guestFavoritesStorageKey = storageKey;
