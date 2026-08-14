// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-ENGAGEMENT-019
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestFavoritesStorageKey, useGuestFavorites } from './use-guest-favorites';

const storedFavoriteLimit = 200;

const storeFavorites = (ids: readonly string[], version = 1) => {
  globalThis.localStorage.setItem(guestFavoritesStorageKey, JSON.stringify({ ids, version }));
};

afterEach(() => {
  globalThis.localStorage.clear();
  vi.restoreAllMocks();
});

describe('guest marketplace favorites', () => {
  it('persists opaque public listing ids locally and removes them idempotently', () => {
    const { result } = renderHook(() => useGuestFavorites());

    act(() => {
      result.current.toggle('listing-1');
    });
    expect(result.current.ids.has('listing-1')).toBe(true);
    expect(JSON.parse(globalThis.localStorage.getItem(guestFavoritesStorageKey) ?? '{}')).toEqual({
      ids: ['listing-1'],
      version: 1,
    });

    act(() => {
      result.current.toggle('listing-1');
    });
    expect(result.current.ids.size).toBe(0);
  });

  it('fails safely for malformed storage, unsafe ids, and denied persistence', () => {
    globalThis.localStorage.setItem(guestFavoritesStorageKey, '{broken');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    const { result } = renderHook(() => useGuestFavorites());

    expect(result.current.ids.size).toBe(0);
    act(() => {
      result.current.toggle('../private');
      result.current.toggle('safe-public-id');
    });
    expect(result.current.ids).toEqual(new Set(['safe-public-id']));
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('discards a payload from another version or shape and unreadable storage', () => {
    storeFavorites(['listing-1'], 2);
    expect(renderHook(() => useGuestFavorites()).result.current.ids.size).toBe(0);

    globalThis.localStorage.setItem(guestFavoritesStorageKey, JSON.stringify({ ids: 'listing-1', version: 1 }));
    expect(renderHook(() => useGuestFavorites()).result.current.ids.size).toBe(0);

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    expect(renderHook(() => useGuestFavorites()).result.current.ids.size).toBe(0);
  });

  it('drops unsafe stored ids and never grows past the stored favorite limit', () => {
    const stored = Array.from({ length: storedFavoriteLimit + 4 }, (_, index) => `listing-${index}`);
    storeFavorites(['../private', ...stored]);
    const { result } = renderHook(() => useGuestFavorites());

    expect(result.current.ids.size).toBe(storedFavoriteLimit);
    expect(result.current.ids.has('../private')).toBe(false);

    act(() => {
      result.current.toggle('one-listing-too-many');
    });
    expect(result.current.ids.has('one-listing-too-many')).toBe(false);
    expect(result.current.ids.size).toBe(storedFavoriteLimit);
  });

  it('adopts favorites written by another tab and ignores every other key', () => {
    const { result } = renderHook(() => useGuestFavorites());

    act(() => {
      globalThis.dispatchEvent(
        new StorageEvent('storage', {
          key: guestFavoritesStorageKey,
          newValue: JSON.stringify({ ids: ['listing-from-another-tab'], version: 1 }),
        }),
      );
    });
    expect(result.current.ids).toEqual(new Set(['listing-from-another-tab']));

    act(() => {
      globalThis.dispatchEvent(new StorageEvent('storage', { key: 'dehqonhub.unrelated', newValue: '{}' }));
    });
    expect(result.current.ids).toEqual(new Set(['listing-from-another-tab']));
  });
});
