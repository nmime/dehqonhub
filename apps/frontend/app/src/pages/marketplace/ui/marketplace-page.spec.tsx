// @requirements REQ-AGRITECH-MARKETPLACE-016
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceData } from '../model/use-marketplace-data';
import { MarketplacePage } from './marketplace-page';

const testState = vi.hoisted(() => {
  const addToCart = vi.fn();
  return {
    addToCart,
    api: { marketplaceControllerAddToCart: addToCart },
    marketplaceData: undefined as MarketplaceData | undefined,
    refresh: vi.fn(),
    requestOptions: {},
    translate: (key: string) => key,
  };
});

vi.mock('@app/frontend-runtime', () => ({
  observer: <T,>(component: T): T => component,
  useI18n: () => ({
    locale: 'en',
    t: testState.translate,
  }),
}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useUserApiClient: () => ({
      api: testState.api,
      requestOptions: testState.requestOptions,
    }),
  };
});

vi.mock('../model/use-marketplace-data', () => ({
  useMarketplaceData: () => testState.marketplaceData,
}));

vi.mock('../../../shared/ui', () => ({
  LanguageSwitcher: () => null,
  ThemeSwitcher: () => null,
}));

const product = {
  category: 'seed' as const,
  createdAt: '2026-08-09T10:00:00.000Z',
  description: 'Certified corn seed',
  id: 'seed-1',
  images: [],
  name: 'Corn seed',
  priceUzs: 1_250_000,
  region: 'Samarqand',
  status: 'active' as const,
  stockQuantity: 20,
  supplierId: 'seller-1',
  supplierName: 'Seed cooperative',
  unit: 't',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

const emptyList = { data: [], status: 'empty' as const };

describe('MarketplacePage mutations', () => {
  beforeEach(() => {
    testState.refresh.mockReset();
    testState.addToCart.mockReset();
    testState.marketplaceData = {
      auth: 'signed-in',
      carts: emptyList,
      catalog: { data: [product], status: 'ready' },
      contracts: emptyList,
      favorites: emptyList,
      myRequests: emptyList,
      offersByRequest: { data: {}, status: 'empty' },
      refresh: testState.refresh,
      requests: emptyList,
      samples: emptyList,
      sampleUsage: { data: { limit: 5, remaining: 5, used: 0 }, status: 'ready' },
      verification: {
        data: {
          createdAt: '2026-08-09T10:00:00.000Z',
          id: 'verification-1',
          role: 'buyer',
          status: 'verified',
          tenantId: 'tenant-1',
          updatedAt: '2026-08-09T10:00:00.000Z',
          userId: 'buyer-1',
        },
        status: 'ready',
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    [404, 'agritech.marketplace.action.notFound'],
    [409, 'agritech.marketplace.action.conflict'],
  ] as const)('refreshes authoritative marketplace state after a mutation fails with %s', async (status, message) => {
    testState.addToCart.mockResolvedValue({
      error: { detail: 'The stock changed.' },
      response: new Response(null, { status }),
    });

    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));

    expect((await screen.findByRole('alert')).textContent).toContain(message);
    await waitFor(() => {
      expect(testState.refresh).toHaveBeenCalledOnce();
    });
  });
});
