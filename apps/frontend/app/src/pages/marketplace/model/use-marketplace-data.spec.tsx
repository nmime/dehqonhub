// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerificationViewDto } from '@app/frontend-api-client';

const api = vi.hoisted(() => ({
  agriTechOperationsControllerListPartners: vi.fn(),
  agriTechOperationsControllerListProduce: vi.fn(),
  agriTechOperationsControllerListSupplierProducts: vi.fn(),
  marketplaceControllerGetDashboard: vi.fn(),
  marketplaceControllerGetVerification: vi.fn(),
  marketplaceControllerGetVerificationReadiness: vi.fn(),
  marketplaceControllerListAi: vi.fn(),
  marketplaceControllerListCarts: vi.fn(),
  marketplaceControllerListContracts: vi.fn(),
  marketplaceControllerListFavorites: vi.fn(),
  marketplaceControllerListMyRequests: vi.fn(),
  marketplaceControllerListNotifications: vi.fn(),
  marketplaceControllerListOffers: vi.fn(),
  marketplaceControllerListSamples: vi.fn(),
  marketplaceControllerSampleUsage: vi.fn(),
  marketplacePromotionControllerList: vi.fn(),
  marketplacePromotionControllerListPlans: vi.fn(),
  marketplacePublicControllerGetListing: vi.fn(),
  marketplacePublicControllerGetSeller: vi.fn(),
  marketplacePublicControllerListCatalog: vi.fn(),
  marketplacePublicControllerListRequests: vi.fn(),
  marketplacePublicControllerListSellerCatalog: vi.fn(),
  marketplacePublicationControllerListMine: vi.fn(),
}));
const requestOptions = vi.hoisted(() => ({}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useUserApiClient: () => ({ api, requestOptions }),
  };
});

const { useMarketplaceData } = await import('./use-marketplace-data');

const apiSuccess = (data: unknown) => ({ data: { data }, response: new Response(null) });

const pendingVerification: VerificationViewDto = {
  createdAt: '2026-08-10T08:00:00.000Z',
  documents: [],
  id: '9efffefa-f488-4fb8-8e8e-7b33d10e4259',
  identityAssurance: 'mock',
  level: 'basic',
  oneIdLinked: true,
  providerMode: 'mock',
  revision: 3,
  role: 'buyer',
  simulation: true,
  status: 'pending',
  step: 'review',
  updatedAt: '2026-08-10T08:05:00.000Z',
};

const verifiedBuyer: VerificationViewDto = {
  ...pendingVerification,
  level: 'verified',
  status: 'verified',
  step: 'complete',
};

const verifiedSeller: VerificationViewDto = {
  ...verifiedBuyer,
  role: 'seller',
};

const listRequests = [
  api.agriTechOperationsControllerListPartners,
  api.agriTechOperationsControllerListProduce,
  api.agriTechOperationsControllerListSupplierProducts,
  api.marketplaceControllerListAi,
  api.marketplaceControllerListCarts,
  api.marketplaceControllerListContracts,
  api.marketplaceControllerListFavorites,
  api.marketplaceControllerListMyRequests,
  api.marketplaceControllerListNotifications,
  api.marketplaceControllerListSamples,
  api.marketplacePromotionControllerList,
  api.marketplacePromotionControllerListPlans,
  api.marketplacePublicControllerListCatalog,
  api.marketplacePublicControllerListRequests,
] as const;

describe('useMarketplaceData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const request of listRequests) {
      request.mockResolvedValue(apiSuccess({ items: [] }));
    }
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(pendingVerification));
    api.marketplaceControllerGetVerificationReadiness.mockResolvedValue(apiSuccess({}));
    api.marketplacePublicationControllerListMine.mockResolvedValue(apiSuccess({ listings: [], requests: [] }));
    api.marketplaceControllerGetDashboard.mockRejectedValue(new Error('verification required'));
    api.marketplaceControllerSampleUsage.mockRejectedValue(new Error('verification required'));
  });

  it.each([
    ['without a verification case', null],
    ['with a pending verification case', pendingVerification],
  ] as const)('does not request verification-gated resources %s', async (_label, verification) => {
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(verification));
    const { result } = renderHook(() => useMarketplaceData());

    await waitFor(() => {
      expect(result.current.verification).toEqual({ data: verification, status: 'ready' });
      expect(result.current.ownedListingPublications.status).toBe('empty');
    });

    expect(api.marketplaceControllerGetDashboard).not.toHaveBeenCalled();
    expect(api.marketplaceControllerSampleUsage).not.toHaveBeenCalled();
    expect(result.current.dashboard).toEqual({ data: null, status: 'empty' });
    expect(result.current.sampleUsage).toEqual({
      data: { limit: 5, period: 'current', policyVersion: 1, remaining: 5, used: 0 },
      status: 'idle',
    });
  });

  it('loads the dashboard but not buyer sample usage for a verified seller', async () => {
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(verifiedSeller));
    api.marketplaceControllerGetDashboard.mockResolvedValue(apiSuccess({ role: 'seller' }));
    const { result } = renderHook(() => useMarketplaceData());

    await waitFor(() => {
      expect(result.current.dashboard.status).toBe('ready');
    });

    expect(api.marketplaceControllerGetDashboard).toHaveBeenCalledOnce();
    expect(api.marketplaceControllerSampleUsage).not.toHaveBeenCalled();
  });

  it('loads dashboard and sample usage for a verified buyer', async () => {
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(verifiedBuyer));
    api.marketplaceControllerGetDashboard.mockResolvedValue(apiSuccess({ role: 'buyer' }));
    api.marketplaceControllerSampleUsage.mockResolvedValue(
      apiSuccess({ limit: 5, period: '2026-08', policyVersion: 1, remaining: 5, used: 0 }),
    );
    const { result } = renderHook(() => useMarketplaceData());

    await waitFor(() => {
      expect(result.current.dashboard.status).toBe('ready');
      expect(result.current.sampleUsage.status).toBe('ready');
    });

    expect(api.marketplaceControllerGetDashboard).toHaveBeenCalledOnce();
    expect(api.marketplaceControllerSampleUsage).toHaveBeenCalledOnce();
  });
});
