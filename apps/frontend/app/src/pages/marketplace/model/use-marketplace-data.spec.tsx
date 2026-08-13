// @requirements REQ-AGRITECH-MARKETPLACE-016
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductViewDto } from '@app/frontend-api-client';
import { useMarketplaceData } from './use-marketplace-data';

const ok = <T,>(data: T) => Promise.resolve({ data, response: new Response(null, { status: 200 }) });

const fail = (status: number) =>
  Promise.resolve({ error: { detail: 'nope' }, response: new Response(null, { status }) });

const product: ProductViewDto = {
  category: 'seed',
  createdAt: '2026-08-09T10:00:00.000Z',
  description: 'Certified corn seed',
  id: 'seed-1',
  images: [],
  name: 'Corn seed',
  priceUzs: 1_250_000,
  region: 'Samarqand',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-1',
  supplierName: 'Seed cooperative',
  unit: 't',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

const request = {
  createdAt: '2026-08-09T10:00:00.000Z',
  deadline: '2026-09-01T00:00:00.000Z',
  id: 'request-1',
  productId: product.id,
  quantity: 5,
  status: 'open',
  tenantId: 'tenant-1',
  unit: 't',
  userId: 'buyer-1',
};

const verification = {
  createdAt: '2026-08-09T10:00:00.000Z',
  documents: [],
  id: 'verification-1',
  level: 'verified',
  oneIdLinked: false,
  role: 'buyer',
  status: 'verified',
  tenantId: 'tenant-1',
  updatedAt: '2026-08-09T10:00:00.000Z',
  userId: 'buyer-1',
};

/**
 * Every read the chrome issues, each answering with an empty-but-valid payload.
 * The client object and its request options keep one identity for the whole
 * test: the hook reloads whenever they change, so fresh objects per render would
 * spin forever.
 */
const apiState = vi.hoisted(() => ({
  api: {} as Record<string, ReturnType<typeof vi.fn>>,
  requestOptions: {},
}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();

  return {
    ...actual,
    useUserApiClient: () => apiState,
  };
});

const stubApi = (overrides: Record<string, ReturnType<typeof vi.fn>> = {}) => {
  apiState.api = {
    marketplaceControllerGetVerification: vi.fn(() => ok(verification)),
    marketplaceControllerListCarts: vi.fn(() => ok({ items: [] })),
    marketplaceControllerListContracts: vi.fn(() => ok({ items: [] })),
    marketplaceControllerListFavorites: vi.fn(() => ok({ items: [] })),
    marketplaceControllerListMyRequests: vi.fn(() => ok({ items: [] })),
    marketplaceControllerListOffers: vi.fn(() => ok({ items: [] })),
    marketplaceControllerListRequests: vi.fn(() => ok({ items: [request] })),
    marketplaceControllerListSamples: vi.fn(() => ok({ items: [] })),
    marketplaceControllerSampleUsage: vi.fn(() => ok({ limit: 5, remaining: 5, used: 0 })),
    productControllerList: vi.fn(() => ok({ demo: false, items: [product] })),
    ...overrides,
  };
};

/**
 * Holds every read open so a test can unmount the page while the requests are
 * still in flight, then let them all land on a page that no longer exists.
 */
const openGate = () => {
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });

  return {
    answers: <T,>(data: T) =>
      vi.fn(async () => {
        await gate;

        return { data, response: new Response(null, { status: 200 }) };
      }),
    rejects: (status: number) =>
      vi.fn(async () => {
        await gate;

        return { error: { detail: 'nope' }, response: new Response(null, { status }) };
      }),
    release: async () => {
      open();
      // A macrotask drains the whole await chain the released reads resume.
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    },
  };
};

const renderMarketplaceData = async () => {
  const view = renderHook(() => useMarketplaceData());

  await waitFor(() => {
    expect(view.result.current.auth).not.toBe('checking');
  });

  return view;
};

describe('useMarketplaceData', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    stubApi();
  });

  afterEach(() => {
    cleanup();
    globalThis.localStorage.clear();
  });

  it('reads the account resources once a session answers, and discloses nothing', async () => {
    stubApi({
      marketplaceControllerListMyRequests: vi.fn(() => ok({ items: [request] })),
      marketplaceControllerListOffers: vi.fn(() =>
        ok({
          items: [
            {
              createdAt: '2026-08-09T10:00:00.000Z',
              deliveryTerms: 'pickup',
              id: 'offer-1',
              priceUzs: 1000,
              requestId: request.id,
              sellerUserId: 'seller-1',
              status: 'open',
              tenantId: 'tenant-1',
            },
          ],
        }),
      ),
    });

    const { result } = await renderMarketplaceData();

    expect(result.current.auth).toBe('signed-in');
    expect(result.current.local).toBe(false);
    expect(result.current.demo).toBe('none');
    expect(result.current.catalog).toEqual({ data: [product], status: 'ready' });
    expect(result.current.requests.status).toBe('ready');
    expect(result.current.offersByRequest.status).toBe('ready');
    expect(result.current.offersByRequest.data[request.id]).toHaveLength(1);
    expect(result.current.verification.data?.status).toBe('verified');
  });

  it('holds an own request that nobody has answered yet as an empty offer list', async () => {
    stubApi({
      marketplaceControllerListMyRequests: vi.fn(() => ok({ items: [request] })),
      marketplaceControllerListOffers: vi.fn(() => ok({ items: [] })),
    });

    const { result } = await renderMarketplaceData();

    expect(result.current.myRequests.status).toBe('ready');
    expect(result.current.offersByRequest).toEqual({ data: { [request.id]: [] }, status: 'empty' });
  });

  it('reports missing offers for one request as an error rather than an empty list', async () => {
    stubApi({
      marketplaceControllerListMyRequests: vi.fn(() => ok({ items: [request] })),
      marketplaceControllerListOffers: vi.fn(() => fail(500)),
    });

    const { result } = await renderMarketplaceData();

    expect(result.current.myRequests.status).toBe('ready');
    expect(result.current.offersByRequest).toEqual({ data: {}, status: 'error' });
  });

  it('browses as a guest on a 401 and restores the basket from this browser', async () => {
    globalThis.localStorage.setItem(
      'dehqonhub.guest.favorites',
      JSON.stringify([
        {
          id: product.id,
          kind: 'product',
          sampleAvailable: true,
          sellerId: product.supplierId,
          sellerName: product.supplierName,
          title: product.name,
        },
      ]),
    );
    globalThis.localStorage.setItem(
      'dehqonhub.guest.carts',
      JSON.stringify([
        {
          productId: product.id,
          quantity: 2,
          sellerId: product.supplierId,
          sellerName: product.supplierName,
          sellerRegion: product.region,
          sourceKind: 'product',
        },
      ]),
    );
    stubApi({ marketplaceControllerGetVerification: vi.fn(() => fail(401)) });

    const { result } = await renderMarketplaceData();

    expect(result.current.auth).toBe('signed-out');
    expect(result.current.local).toBe(true);
    expect(result.current.demo).toBe('guest');
    expect(result.current.favorites.data).toEqual([
      expect.objectContaining({ listing: expect.objectContaining({ id: product.id }) }),
    ]);
    expect(result.current.carts.data).toEqual([expect.objectContaining({ id: `guest-cart-${product.supplierId}` })]);
    // The per-account reads would each 401 and bounce the visitor mid-browse.
    expect(apiState.api['marketplaceControllerListCarts']).not.toHaveBeenCalled();
    expect(apiState.api['marketplaceControllerListFavorites']).not.toHaveBeenCalled();
  });

  it('keeps guest writes in this browser and reflects them immediately', async () => {
    stubApi({ marketplaceControllerGetVerification: vi.fn(() => fail(401)) });

    const { result } = await renderMarketplaceData();

    act(() => {
      result.current.localActions.addToCart(product, 2);
    });
    expect(result.current.carts.data[0]?.items).toEqual([
      { listingPublicationId: product.id, quantity: 2, sourceKind: 'product' },
    ]);

    act(() => {
      result.current.localActions.updateCart(product.id, 5);
    });
    expect(result.current.carts.data[0]?.items).toEqual([
      { listingPublicationId: product.id, quantity: 5, sourceKind: 'product' },
    ]);

    act(() => {
      result.current.localActions.toggleFavorite(product);
    });
    expect(result.current.favorites.data).toHaveLength(1);

    act(() => {
      result.current.localActions.checkout(`guest-cart-${product.supplierId}`);
    });
    expect(result.current.carts).toEqual({ data: [], status: 'empty' });
  });

  it('treats an unreachable session as a guest visit rather than a broken page', async () => {
    stubApi({ marketplaceControllerGetVerification: vi.fn(() => fail(500)) });

    const { result } = await renderMarketplaceData();

    expect(result.current.auth).toBe('error');
    expect(result.current.local).toBe(true);
    expect(result.current.demo).toBe('guest');
  });

  it('discloses a demo assortment served by the API', async () => {
    stubApi({ productControllerList: vi.fn(() => ok({ demo: true, items: [product] })) });

    const { result } = await renderMarketplaceData();

    expect(result.current.demo).toBe('demo-catalog');
    expect(result.current.catalog.data).toEqual([product]);
  });

  it('keeps a retry in reach when the catalog request fails', async () => {
    const list = vi.fn(() => fail(503));
    stubApi({ productControllerList: list });

    const { result } = await renderMarketplaceData();

    expect(result.current.demo).toBe('unavailable');
    expect(result.current.catalog).toEqual({ data: [], status: 'error' });

    list.mockImplementation(() => ok({ demo: false, items: [product] }));
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.catalog.status).toBe('ready');
    });
    expect(result.current.demo).toBe('none');
  });

  it('survives a 200 that carries no catalog list', async () => {
    stubApi({ productControllerList: vi.fn(() => ok({ demo: false, items: undefined })) });

    const { result } = await renderMarketplaceData();

    expect(result.current.catalog).toEqual({ data: [], status: 'empty' });
    expect(result.current.demo).toBe('none');
  });

  it('marks each failed account resource without taking the others down', async () => {
    stubApi({
      marketplaceControllerListCarts: vi.fn(() => fail(500)),
      marketplaceControllerListContracts: vi.fn(() => fail(500)),
      marketplaceControllerListFavorites: vi.fn(() => fail(500)),
      marketplaceControllerListMyRequests: vi.fn(() => fail(500)),
      marketplaceControllerListRequests: vi.fn(() => fail(500)),
      marketplaceControllerListSamples: vi.fn(() => fail(500)),
      marketplaceControllerSampleUsage: vi.fn(() => fail(500)),
    });

    const { result } = await renderMarketplaceData();

    expect(result.current.auth).toBe('signed-in');
    expect(result.current.carts.status).toBe('error');
    expect(result.current.contracts.status).toBe('error');
    expect(result.current.favorites.status).toBe('error');
    expect(result.current.myRequests.status).toBe('error');
    expect(result.current.offersByRequest.status).toBe('error');
    expect(result.current.requests.status).toBe('error');
    expect(result.current.samples.status).toBe('error');
    // A failed allowance read assumes nothing spent and nothing remaining beyond
    // the policy default, so the period is whichever month the page is open in.
    expect(result.current.sampleUsage).toEqual({
      data: { limit: 5, period: expect.stringMatching(/^\d{4}-\d{2}$/u), policyVersion: 1, remaining: 5, used: 0 },
      status: 'error',
    });
    expect(result.current.catalog.status).toBe('ready');
  });

  // Nothing else in this suite stubs the organizations read, so the rest of the
  // page is measured against a failed one; this is the answered case.
  it('reads the organizations the account may act for', async () => {
    const supplier = {
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'partner-supplier',
      kind: 'supplier',
      legalName: 'Zamin Agro MChJ',
      ownerUserId: 'buyer-1',
      phone: '+998901234567',
      region: 'Samarqand',
      status: 'approved',
      taxId: '300123456',
      tenantId: 'tenant-1',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    stubApi({ agriTechOperationsControllerListPartners: vi.fn(() => ok({ items: [supplier] })) });

    const { result } = await renderMarketplaceData();

    await waitFor(() => {
      expect(result.current.partners).toEqual({ data: [supplier], status: 'ready' });
    });
  });

  it('abandons every in-flight read once the page it was loading is gone', async () => {
    const gate = openGate();
    stubApi({
      agriTechOperationsControllerListPartners: gate.answers({ items: [] }),
      marketplaceControllerGetVerification: gate.answers(verification),
      marketplaceControllerListCarts: gate.answers({ items: [] }),
      marketplaceControllerListContracts: gate.answers({ items: [] }),
      marketplaceControllerListFavorites: gate.answers({ items: [] }),
      marketplaceControllerListMyRequests: gate.answers({ items: [request] }),
      marketplaceControllerListRequests: gate.answers({ items: [request] }),
      marketplaceControllerListSamples: gate.answers({ items: [] }),
      marketplaceControllerSampleUsage: gate.answers({ limit: 5, remaining: 5, used: 0 }),
      productControllerList: gate.answers({ demo: false, items: [product] }),
    });

    const view = renderHook(() => useMarketplaceData());
    expect(view.result.current.auth).toBe('checking');

    view.unmount();
    await gate.release();

    // The session probe answered, so the account reads went out — and each one
    // found the page gone and wrote nothing back into it.
    expect(apiState.api.marketplaceControllerListCarts).toHaveBeenCalledOnce();
    expect(apiState.api.marketplaceControllerListSamples).toHaveBeenCalledOnce();
    expect(apiState.api.marketplaceControllerSampleUsage).toHaveBeenCalledOnce();
    // The owned-requests read stops before its per-request offer fan-out.
    expect(apiState.api.marketplaceControllerListOffers).not.toHaveBeenCalled();
    expect(view.result.current.auth).toBe('checking');
    expect(view.result.current.carts).toEqual({ data: [], status: 'idle' });
    expect(view.result.current.partners).toEqual({ data: [], status: 'idle' });
  });

  // The owned requests arrive while the page is still up, so the per-request offer
  // fan-out goes out — and then the visitor leaves before those offers land.
  it('drops an offer fan-out that lands after the page that asked for it is gone', async () => {
    const gate = openGate();
    stubApi({
      marketplaceControllerListMyRequests: vi.fn(() => ok({ items: [request] })),
      marketplaceControllerListOffers: gate.answers({ items: [] }),
    });

    const view = renderHook(() => useMarketplaceData());
    await waitFor(() => {
      expect(apiState.api.marketplaceControllerListOffers).toHaveBeenCalledOnce();
    });

    view.unmount();
    await gate.release();

    expect(view.result.current.offersByRequest).toEqual({ data: {}, status: 'idle' });
  });

  it('keeps a failure that arrives after the page is gone off the screen it left', async () => {
    const gate = openGate();
    stubApi({
      marketplaceControllerGetVerification: gate.answers(verification),
      marketplaceControllerListCarts: gate.rejects(500),
      marketplaceControllerListContracts: gate.rejects(500),
      marketplaceControllerListFavorites: gate.rejects(500),
      marketplaceControllerListMyRequests: gate.rejects(500),
      marketplaceControllerListRequests: gate.rejects(500),
      marketplaceControllerListSamples: gate.rejects(500),
      marketplaceControllerSampleUsage: gate.rejects(500),
      productControllerList: gate.rejects(500),
    });

    const view = renderHook(() => useMarketplaceData());
    view.unmount();
    await gate.release();

    expect(apiState.api.marketplaceControllerListCarts).toHaveBeenCalledOnce();
    expect(view.result.current.carts).toEqual({ data: [], status: 'idle' });
    expect(view.result.current.catalog).toEqual({ data: [], status: 'loading' });
    expect(view.result.current.samples.status).toBe('idle');
  });

  it('leaves the browser-local basket alone when the session probe outlives the page', async () => {
    const gate = openGate();
    stubApi({
      marketplaceControllerGetVerification: gate.rejects(401),
    });

    const view = renderHook(() => useMarketplaceData());
    view.unmount();
    await gate.release();

    expect(view.result.current.auth).toBe('checking');
    expect(view.result.current.carts).toEqual({ data: [], status: 'idle' });
    expect(view.result.current.sampleUsage.status).toBe('idle');
  });
});
