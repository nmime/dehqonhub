// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-ENGAGEMENT-019
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestFavoritesStorageKey, useGuestFavorites } from './use-guest-favorites';

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
});
