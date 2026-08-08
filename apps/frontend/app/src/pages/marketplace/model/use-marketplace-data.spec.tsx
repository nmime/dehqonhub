// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019
import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('reports public, authenticated partial-failure, offer, refresh, and signed-out states independently', async () => {
    const publicListing = {
      availableQuantity: 8,
      category: 'seed',
      description: 'Public listing',
      id: 'listing-public',
      images: [],
      kind: 'product',
      priceUzs: 500_000,
      promoted: false,
      region: 'Buxoro',
      sampleAvailable: true,
      section: 'seeds',
      seller: { displayName: 'Public seller', id: 'seller-public' },
      title: 'Seed listing',
      unit: 'kg',
    };
    const publicRequest = {
      buyerDisplayName: 'Public buyer',
      createdAt: '2026-08-10T08:00:00.000Z',
      id: 'request-public',
      region: 'Buxoro',
      status: 'open',
      title: 'Need seed',
      updatedAt: '2026-08-10T08:00:00.000Z',
    };
    const ownedRequests = [
      { ...publicRequest, id: 'owned-one' },
      { ...publicRequest, id: 'owned-two' },
    ];
    api.marketplacePublicControllerListCatalog.mockResolvedValue(apiSuccess({ items: [publicListing] }));
    api.marketplacePublicControllerListRequests.mockResolvedValue(apiSuccess({ items: [publicRequest] }));
    api.marketplacePublicControllerGetListing.mockResolvedValue(apiSuccess(publicListing));
    api.marketplacePublicControllerGetSeller.mockResolvedValue(
      apiSuccess({
        description: 'Seller profile',
        displayName: 'Public seller',
        id: 'seller-public',
        region: 'Buxoro',
      }),
    );
    api.marketplacePublicControllerListSellerCatalog.mockResolvedValue(apiSuccess({ items: [publicListing] }));
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(verifiedBuyer));
    api.marketplaceControllerListMyRequests.mockResolvedValue(apiSuccess({ items: ownedRequests }));
    api.marketplaceControllerListOffers
      .mockResolvedValueOnce(apiSuccess({ items: [{ id: 'offer-one', priceUzs: 100 }] }))
      .mockRejectedValueOnce(new Error('one seller offer list failed'));
    api.marketplaceControllerGetDashboard.mockRejectedValue(new Error('dashboard unavailable'));
    api.marketplaceControllerSampleUsage.mockRejectedValue(new Error('usage unavailable'));
    api.marketplaceControllerGetVerificationReadiness.mockRejectedValue(new Error('readiness unavailable'));
    api.marketplacePublicationControllerListMine.mockRejectedValue(new Error('publication history unavailable'));
    api.marketplaceControllerListCarts.mockRejectedValue(new Error('carts unavailable'));

    const signedIn = renderHook(() => useMarketplaceData('listing-public', 'seller-public'));
    await waitFor(() => {
      expect(signedIn.result.current.auth).toBe('signed-in');
      expect(signedIn.result.current.selectedListing.status).toBe('ready');
      expect(signedIn.result.current.seller.status).toBe('ready');
      expect(signedIn.result.current.sellerCatalog.status).toBe('ready');
      expect(signedIn.result.current.carts.status).toBe('error');
      expect(signedIn.result.current.offersByRequest.status).toBe('error');
      expect(signedIn.result.current.dashboard.status).toBe('error');
      expect(signedIn.result.current.sampleUsage.status).toBe('error');
      expect(signedIn.result.current.providerReadiness.status).toBe('error');
      expect(signedIn.result.current.ownedListingPublications.status).toBe('error');
    });
    expect(signedIn.result.current.catalog.data[0]?.id).toBe('listing-public');
    expect(signedIn.result.current.requests.data[0]?.status).toBe('open');
    signedIn.result.current.refresh();
    await waitFor(() => {
      expect(api.marketplacePublicControllerListCatalog).toHaveBeenCalledTimes(2);
    });
    signedIn.unmount();

    api.marketplaceControllerGetVerification.mockResolvedValue({
      error: { detail: 'Authentication required' },
      response: new Response(null, { status: 401 }),
    });
    const signedOut = renderHook(() => useMarketplaceData());
    await waitFor(() => {
      expect(signedOut.result.current.auth).toBe('signed-out');
      expect(signedOut.result.current.verification.status).toBe('empty');
      expect(signedOut.result.current.carts.status).toBe('empty');
    });
    signedOut.unmount();

    api.marketplaceControllerGetVerification.mockRejectedValue(new Error('session service unavailable'));
    const authError = renderHook(() => useMarketplaceData());
    await waitFor(() => {
      expect(authError.result.current.auth).toBe('error');
      expect(authError.result.current.verification.status).toBe('error');
    });
    authError.unmount();

    vi.clearAllMocks();
    for (const listRequest of listRequests) {
      listRequest.mockResolvedValue(apiSuccess({ items: [] }));
    }
    api.marketplacePublicControllerListCatalog.mockRejectedValue(new Error('catalog unavailable'));
    api.marketplacePublicControllerListRequests.mockRejectedValue(new Error('requests unavailable'));
    api.marketplacePublicControllerGetListing.mockResolvedValue(apiSuccess(null));
    api.marketplacePublicControllerGetSeller.mockRejectedValue(new Error('seller unavailable'));
    api.marketplacePublicControllerListSellerCatalog.mockRejectedValue(new Error('seller catalog unavailable'));
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(pendingVerification));
    api.marketplaceControllerGetVerificationReadiness.mockResolvedValue(apiSuccess({}));
    api.marketplacePublicationControllerListMine.mockResolvedValue(apiSuccess({ listings: [], requests: [] }));
    const publicFailures = renderHook(() => useMarketplaceData('missing-listing', 'missing-seller'));
    await waitFor(() => {
      expect(publicFailures.result.current.catalog.status).toBe('error');
      expect(publicFailures.result.current.requests.status).toBe('error');
      expect(publicFailures.result.current.selectedListing.status).toBe('error');
      expect(publicFailures.result.current.seller.status).toBe('error');
      expect(publicFailures.result.current.sellerCatalog.status).toBe('error');
    });
    publicFailures.unmount();

    vi.clearAllMocks();
    for (const listRequest of listRequests) {
      listRequest.mockResolvedValue(apiSuccess({ items: [] }));
    }
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(verifiedBuyer));
    api.marketplaceControllerGetDashboard.mockResolvedValue(apiSuccess({ role: 'buyer' }));
    api.marketplaceControllerSampleUsage.mockResolvedValue(
      apiSuccess({ limit: 5, period: '2026-08', policyVersion: 1, remaining: 4, used: 1 }),
    );
    api.marketplaceControllerGetVerificationReadiness.mockResolvedValue(apiSuccess({}));
    api.marketplacePublicationControllerListMine.mockResolvedValue(apiSuccess({ listings: [], requests: [] }));
    api.marketplaceControllerListMyRequests.mockRejectedValueOnce(new Error('owned requests unavailable'));
    const ownedFailure = renderHook(() => useMarketplaceData());
    await waitFor(() => {
      expect(ownedFailure.result.current.myRequests.status).toBe('error');
      expect(ownedFailure.result.current.offersByRequest.status).toBe('error');
    });
    ownedFailure.unmount();

    api.marketplaceControllerListMyRequests.mockResolvedValue(apiSuccess({ items: [ownedRequests[0]] }));
    api.marketplaceControllerListOffers.mockResolvedValue(apiSuccess({ items: [] }));
    const offerStates = renderHook(() => useMarketplaceData());
    await waitFor(() => {
      expect(offerStates.result.current.offersByRequest.status).toBe('empty');
    });
    api.marketplaceControllerListOffers.mockResolvedValue(apiSuccess({ items: [{ id: 'offer-ready', priceUzs: 50 }] }));
    act(() => {
      offerStates.result.current.refresh();
    });
    await waitFor(() => {
      expect(offerStates.result.current.offersByRequest.status).toBe('ready');
    });
    offerStates.unmount();

    let resolveVerification!: (value: ReturnType<typeof apiSuccess>) => void;
    api.marketplaceControllerGetVerification.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVerification = resolve;
        }),
    );
    const staleVerification = renderHook(() => useMarketplaceData());
    await waitFor(() => {
      expect(api.marketplaceControllerGetVerification).toHaveBeenCalled();
    });
    staleVerification.unmount();
    resolveVerification(apiSuccess(verifiedBuyer));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    let resolveOffers!: (value: ReturnType<typeof apiSuccess>) => void;
    api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(verifiedBuyer));
    api.marketplaceControllerListMyRequests.mockResolvedValue(apiSuccess({ items: [ownedRequests[0]] }));
    api.marketplaceControllerListOffers.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOffers = resolve;
        }),
    );
    const staleOffers = renderHook(() => useMarketplaceData());
    await waitFor(() => {
      expect(api.marketplaceControllerListOffers).toHaveBeenCalled();
    });
    staleOffers.unmount();
    resolveOffers(apiSuccess({ items: [] }));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    const staleResourceRun = async (outcome: 'resolve' | 'reject') => {
      vi.clearAllMocks();
      for (const listRequest of listRequests) {
        listRequest.mockResolvedValue(apiSuccess({ items: [] }));
      }
      api.marketplaceControllerGetVerification.mockResolvedValue(apiSuccess(verifiedBuyer));

      const carts = Promise.withResolvers<ReturnType<typeof apiSuccess>>();
      const dashboard = Promise.withResolvers<ReturnType<typeof apiSuccess>>();
      const myRequests = Promise.withResolvers<ReturnType<typeof apiSuccess>>();
      const publications = Promise.withResolvers<ReturnType<typeof apiSuccess>>();
      const readiness = Promise.withResolvers<ReturnType<typeof apiSuccess>>();
      const usage = Promise.withResolvers<ReturnType<typeof apiSuccess>>();
      api.marketplaceControllerListCarts.mockReturnValueOnce(carts.promise);
      api.marketplaceControllerGetDashboard.mockReturnValueOnce(dashboard.promise);
      api.marketplaceControllerListMyRequests.mockReturnValueOnce(myRequests.promise);
      api.marketplacePublicationControllerListMine.mockReturnValueOnce(publications.promise);
      api.marketplaceControllerGetVerificationReadiness.mockReturnValueOnce(readiness.promise);
      api.marketplaceControllerSampleUsage.mockReturnValueOnce(usage.promise);

      const staleResources = renderHook(() => useMarketplaceData());
      await waitFor(() => {
        expect(api.marketplaceControllerListCarts).toHaveBeenCalled();
        expect(api.marketplaceControllerGetDashboard).toHaveBeenCalled();
        expect(api.marketplaceControllerListMyRequests).toHaveBeenCalled();
        expect(api.marketplacePublicationControllerListMine).toHaveBeenCalled();
        expect(api.marketplaceControllerGetVerificationReadiness).toHaveBeenCalled();
        expect(api.marketplaceControllerSampleUsage).toHaveBeenCalled();
      });
      staleResources.unmount();

      const deferred = [carts, dashboard, myRequests, publications, readiness, usage];
      if (outcome === 'resolve') {
        carts.resolve(apiSuccess({ items: [] }));
        dashboard.resolve(apiSuccess({ role: 'buyer' }));
        myRequests.resolve(apiSuccess({ items: [] }));
        publications.resolve(apiSuccess({ listings: [], requests: [] }));
        readiness.resolve(apiSuccess({}));
        usage.resolve(apiSuccess({ limit: 5, period: '2026-08', policyVersion: 1, remaining: 5, used: 0 }));
      } else {
        for (const request of deferred) {
          request.reject(new Error('stale request failed'));
        }
      }
      await Promise.allSettled(deferred.map(({ promise }) => promise));
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    };
    await staleResourceRun('resolve');
    await staleResourceRun('reject');
  });
});
