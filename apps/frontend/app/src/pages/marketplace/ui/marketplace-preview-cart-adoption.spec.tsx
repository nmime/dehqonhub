// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartViewDto, VerificationViewDto } from '@app/frontend-api-client';
import type { MarketplaceData } from '../model/use-marketplace-data';
import { guestCartStorageKey } from '../model/use-guest-cart';
import { MarketplacePage } from './marketplace-page';
import type { MarketplaceListing } from './marketplace-ui';

const testState = vi.hoisted(() => {
  const apiMocks = new Map<string, ReturnType<typeof vi.fn>>();
  const api = new Proxy<Record<string, ReturnType<typeof vi.fn>>>(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== 'string') {
          return undefined;
        }
        const existing = apiMocks.get(property);
        if (existing) {
          return existing;
        }
        const created = vi.fn();
        apiMocks.set(property, created);
        return created;
      },
    },
  );
  return {
    api,
    apiMocks,
    marketplaceData: undefined as MarketplaceData | undefined,
    requestOptions: { headers: { 'x-test': 'preview-cart-adoption' } },
    views: {} as Record<string, unknown>,
  };
});

vi.mock('@app/frontend-runtime', () => ({
  observer: <T,>(component: T): T => component,
  useI18n: () => ({ locale: 'en', t: (key: string) => key }),
}));

vi.mock('@app/frontend-feature-user-logout', () => ({
  useLogout: () => ({ model: { isPending: false }, signOut: () => undefined }),
}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useUserApiClient: () => ({ api: testState.api, requestOptions: testState.requestOptions }),
  };
});

vi.mock('../model/use-marketplace-data', () => ({
  useMarketplaceData: () => testState.marketplaceData,
}));

vi.mock('../../../shared/ui', () => ({
  LanguageSwitcher: () => null,
  ThemeSwitcher: () => null,
}));

vi.mock('./marketplace-discovery', () => ({
  MarketplaceCatalog: () => <div data-testid="catalog-view" />,
  MarketplaceEmpty: () => <div data-testid="empty-view" />,
  MarketplaceFavorites: () => <div data-testid="favorites-view" />,
  MarketplaceHome: () => <div data-testid="home-view" />,
  MarketplaceProductDetail: () => <div data-testid="product-view" />,
  MarketplaceSellerProfile: () => <div data-testid="seller-view" />,
  MarketplaceSkeleton: () => <div data-testid="marketplace-skeleton" />,
}));

vi.mock('./marketplace-commerce', () => ({
  MarketplaceAccount: () => <div data-testid="account-view" />,
  MarketplaceCart: (props: unknown) => {
    testState.views.cart = props;
    return <div data-testid="cart-view" />;
  },
  MarketplaceContract: () => <div data-testid="contract-view" />,
  MarketplaceRequests: () => <div data-testid="requests-view" />,
  MarketplaceVerification: () => <div data-testid="verification-view" />,
}));

vi.mock('./marketplace-management', () => ({
  MarketplaceUserManagement: () => <div data-testid="management-view" />,
}));

vi.mock('./marketplace-ai', () => ({
  MarketplaceAi: () => <div data-testid="ai-view" />,
}));

const now = '2026-08-09T10:00:00.000Z';
const buyerPartnerId = 'a4d2c0f6-0000-4000-8000-000000000001';

const listing = (id: string, supplierId: string, supplierName: string): MarketplaceListing => ({
  category: 'seed',
  description: 'Certified seed',
  id,
  images: [],
  kind: 'product',
  name: `Listing ${id}`,
  priceUzs: 1_200_000,
  promoted: false,
  provenance: 'live',
  rating: { average: 4.6, count: 12 },
  region: 'Samarqand',
  sampleAvailable: false,
  section: 'seeds',
  status: 'active',
  stockQuantity: 50,
  supplierId,
  supplierName,
  transactional: true,
  unit: 'kg',
});

const firstListing = listing('listing-1', 'seller-a', 'Seed cooperative');
const secondListing = listing('listing-2', 'seller-b', 'Produce cooperative');

const verifiedBuyer: VerificationViewDto = {
  createdAt: now,
  documents: [],
  id: 'verification-1',
  identityAssurance: 'mock',
  level: 'verified',
  oneIdLinked: true,
  providerMode: 'mock',
  revision: 1,
  role: 'buyer',
  simulation: true,
  status: 'verified',
  step: 'complete',
  updatedAt: now,
};

const ready = <T,>(data: T) => ({ data, status: 'ready' as const });
const empty = <T,>(data: T) => ({ data, status: 'empty' as const });
const settledStatus = (items: readonly unknown[]): 'empty' | 'ready' => (items.length > 0 ? 'ready' : 'empty');

interface MarketplaceDataOverrides {
  auth?: MarketplaceData['auth'];
  partners?: MarketplaceData['partners']['data'];
  /** Stated only when the read itself is the state under test. */
  partnersStatus?: MarketplaceData['partners']['status'];
  refresh: () => void;
  verification?: VerificationViewDto | null;
}

/**
 * Only the members this page body reads are stated. Everything else answers with
 * an empty resource, because every route view is mocked here and an accidental
 * omission would otherwise fail as a missing property rather than as the
 * behaviour under test.
 */
const buildMarketplaceData = ({
  auth = 'signed-in',
  partners = [],
  partnersStatus,
  refresh,
  verification = verifiedBuyer,
}: MarketplaceDataOverrides): MarketplaceData =>
  new Proxy(
    {
      auth,
      carts: empty([] as CartViewDto[]),
      catalog: ready([firstListing, secondListing]),
      contracts: empty([]),
      favorites: empty([]),
      partners: { data: partners, status: partnersStatus ?? settledStatus(partners) },
      refresh,
      selectedListing: { data: null, status: 'empty' as const },
      verification: verification ? ready(verification) : empty(null),
    } as unknown as MarketplaceData,
    {
      get: (target, property) =>
        property in target ? target[property as keyof MarketplaceData] : { data: [], status: 'empty' },
    },
  );

const approvedBuyerPartner: MarketplaceData['partners']['data'] = [
  {
    createdAt: now,
    id: buyerPartnerId,
    kind: 'buyer',
    legalName: 'Buyer cooperative',
    ownerUserId: 'buyer-user',
    phone: '+998901234567',
    region: 'Samarqand',
    status: 'approved',
    taxId: '123456789',
    tenantId: 'tenant-1',
    updatedAt: now,
  },
];

const apiSuccess = <T,>(data: T) => ({ data: { data }, response: new Response() });
const apiFailure = (status: number) => ({
  error: { detail: `request failed with ${status}` },
  response: new Response(null, { status }),
});

const serverCart = (id: string, seller: string, listingPublicationId: string, quantity: number): CartViewDto => ({
  createdAt: now,
  id,
  items: [{ listingPublicationId, quantity, sourceKind: 'product' }],
  seller: { displayName: seller, region: 'Samarqand' },
  status: 'open',
  updatedAt: now,
});

const apiMock = (name: string): ReturnType<typeof vi.fn> => testState.api[name];

const addToCartMock = () => apiMock('marketplaceControllerAddToCart');

const storePreviewLines = (
  lines: readonly { listingPublicationId: string; quantity: number; seller: MarketplaceListing }[],
): void => {
  globalThis.localStorage.setItem(
    guestCartStorageKey,
    JSON.stringify({
      lines: lines.map((line) => ({
        listingPublicationId: line.listingPublicationId,
        quantity: line.quantity,
        seller: {
          displayName: line.seller.supplierName,
          id: line.seller.supplierId,
          region: line.seller.region,
        },
        sourceKind: 'product',
      })),
      version: 1,
    }),
  );
};

const storedPreviewLines = (): { listingPublicationId: string; quantity: number }[] => {
  const raw = globalThis.localStorage.getItem(guestCartStorageKey);
  if (!raw) {
    return [];
  }
  return (JSON.parse(raw) as { lines: { listingPublicationId: string; quantity: number }[] }).lines.map((line) => ({
    listingPublicationId: line.listingPublicationId,
    quantity: line.quantity,
  }));
};

const cartProps = (): {
  canCheckout?: boolean;
  checkoutActionLabel?: string;
  checkoutHint?: string;
  onCheckout: (cart: CartViewDto, deliveryTerms: 'by_agreement' | 'pickup' | 'seller_delivery') => void;
  onCheckoutAction?: () => void;
  carts: { data: CartViewDto[]; status: string };
  previewCartIds?: ReadonlySet<string>;
} => {
  const props = testState.views.cart;
  if (!props) {
    throw new Error('The cart route was not rendered.');
  }
  return props as ReturnType<typeof cartProps>;
};

const adoptionKeys = (): string[] => addToCartMock().mock.calls.map((call) => String(call[1]));

beforeEach(() => {
  globalThis.localStorage.clear();
  testState.views = {};
  for (const mock of testState.apiMocks.values()) {
    mock.mockReset();
  }
  apiMock('marketplacePublicControllerListSuggestions').mockResolvedValue(apiSuccess({ items: [] }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('preview cart adoption after authentication', () => {
  it('never invokes a cart mutation for a signed-out visitor', async () => {
    const refresh = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 3, seller: firstListing }]);
    testState.marketplaceData = buildMarketplaceData({ auth: 'signed-out', refresh });

    render(<MarketplacePage view="cart" />);

    await screen.findByTestId('cart-view');
    expect(addToCartMock()).not.toHaveBeenCalled();
    expect(cartProps().carts.data.map((cart) => cart.id)).toEqual(['guest-cart:seller-a']);
    expect(storedPreviewLines()).toHaveLength(1);
  });

  it('never invokes a cart mutation for a signed-in visitor who is not yet an authorized buyer', async () => {
    const refresh = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 3, seller: firstListing }]);
    testState.marketplaceData = buildMarketplaceData({
      partners: approvedBuyerPartner,
      refresh,
      verification: { ...verifiedBuyer, status: 'pending' },
    });

    render(<MarketplacePage view="cart" />);

    await screen.findByTestId('cart-view');
    expect(addToCartMock()).not.toHaveBeenCalled();
    expect(storedPreviewLines()).toHaveLength(1);
  });

  it('promotes every preview line through the authenticated cart endpoint and empties the local store', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    storePreviewLines([
      { listingPublicationId: firstListing.id, quantity: 3, seller: firstListing },
      { listingPublicationId: secondListing.id, quantity: 7, seller: secondListing },
    ]);
    addToCartMock()
      .mockResolvedValueOnce(apiSuccess(serverCart('cart-a', 'Seed cooperative', firstListing.id, 3)))
      .mockResolvedValueOnce(apiSuccess(serverCart('cart-b', 'Produce cooperative', secondListing.id, 7)));
    testState.marketplaceData = buildMarketplaceData({ partners: approvedBuyerPartner, refresh });

    render(<MarketplacePage navigate={navigate} view="cart" />);

    await waitFor(() => {
      expect(addToCartMock()).toHaveBeenCalledTimes(2);
    });
    expect(addToCartMock().mock.calls[0]?.[0]).toEqual({
      actingPartnerId: buyerPartnerId,
      listingPublicationId: firstListing.id,
      quantity: 3,
    });
    expect(addToCartMock().mock.calls[1]?.[0]).toEqual({
      actingPartnerId: buyerPartnerId,
      listingPublicationId: secondListing.id,
      quantity: 7,
    });
    await waitFor(() => {
      expect(storedPreviewLines()).toEqual([]);
    });
    expect(cartProps().previewCartIds?.size ?? 0).toBe(0);
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findAllByText('agritech.marketplace.cart.addedToSellerCart')).toHaveLength(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('replays the same derived idempotency key after a reload instead of doubling the quantity', async () => {
    const refresh = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 4, seller: firstListing }]);
    const accepted = apiSuccess(serverCart('cart-a', 'Seed cooperative', firstListing.id, 4));
    let releaseFirstAttempt: () => void = () => undefined;
    const firstAttempt = new Promise<typeof accepted>((resolve) => {
      releaseFirstAttempt = () => {
        resolve(accepted);
      };
    });
    addToCartMock().mockReturnValueOnce(firstAttempt).mockResolvedValueOnce(accepted);
    testState.marketplaceData = buildMarketplaceData({ partners: approvedBuyerPartner, refresh });

    const first = render(<MarketplacePage view="cart" />);
    await waitFor(() => {
      expect(addToCartMock()).toHaveBeenCalledTimes(1);
    });
    // The tab closes before the accepted command could be released locally.
    first.unmount();
    expect(storedPreviewLines()).toEqual([{ listingPublicationId: firstListing.id, quantity: 4 }]);

    testState.views = {};
    render(<MarketplacePage view="cart" />);
    await waitFor(() => {
      expect(addToCartMock()).toHaveBeenCalledTimes(2);
    });

    const keys = adoptionKeys();
    expect(keys[0]).toBe(`guest-cart:${buyerPartnerId}:${firstListing.id}:4`);
    expect(keys[1]).toBe(keys[0]);
    expect(addToCartMock().mock.calls[1]?.[0]).toEqual({
      actingPartnerId: buyerPartnerId,
      listingPublicationId: firstListing.id,
      quantity: 4,
    });
    await waitFor(() => {
      expect(storedPreviewLines()).toEqual([]);
    });
    releaseFirstAttempt();
  });

  it('reports a rejected revalidation once and keeps the line instead of retrying on every refresh', async () => {
    const refresh = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 900, seller: firstListing }]);
    addToCartMock().mockResolvedValue(apiFailure(409));
    testState.marketplaceData = buildMarketplaceData({ partners: approvedBuyerPartner, refresh });

    const view = render(<MarketplacePage view="cart" />);
    await waitFor(() => {
      expect(addToCartMock()).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('agritech.marketplace.action.conflict')).toBeTruthy();

    view.rerender(<MarketplacePage view="cart" />);
    view.rerender(<MarketplacePage view="cart" />);
    await waitFor(() => {
      expect(storedPreviewLines()).toEqual([{ listingPublicationId: firstListing.id, quantity: 900 }]);
    });
    expect(addToCartMock()).toHaveBeenCalledTimes(1);
  });
});

describe('blocked preview checkout is explained where the decision is made', () => {
  it('states the missing step, orders nothing, and routes sign-in back to the cart', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 2, seller: firstListing }]);
    testState.marketplaceData = buildMarketplaceData({ auth: 'signed-out', refresh });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await screen.findByTestId('cart-view');

    const props = cartProps();
    const previewCart = props.carts.data[0];
    if (!previewCart) {
      throw new Error('The preview cart must be visible before checkout.');
    }
    props.onCheckout(previewCart, 'pickup');

    expect(await screen.findByText('agritech.marketplace.access.signIn')).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith('/auth?returnUrl=%2Fcart');
    expect(addToCartMock()).not.toHaveBeenCalled();
    expect(apiMock('marketplaceControllerCheckoutCart')).not.toHaveBeenCalled();
    expect(screen.queryByText('agritech.marketplace.demo.checkoutDone')).toBeNull();
  });

  it('sends the inline sign-in entry back to the cart as well', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 2, seller: firstListing }]);
    testState.marketplaceData = buildMarketplaceData({ auth: 'signed-out', refresh });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await screen.findByTestId('cart-view');

    cartProps().onCheckoutAction?.();

    expect(navigate).toHaveBeenCalledWith('/auth?returnUrl=%2Fcart');
  });

  it('names verification rather than sign-in for a signed-in but unverified buyer', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 2, seller: firstListing }]);
    testState.marketplaceData = buildMarketplaceData({
      partners: approvedBuyerPartner,
      refresh,
      verification: { ...verifiedBuyer, status: 'pending' },
    });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await screen.findByTestId('cart-view');

    const props = cartProps();
    const previewCart = props.carts.data.find((cart) => cart.id.startsWith('guest-cart:'));
    if (!previewCart) {
      throw new Error('The preview cart must be visible before checkout.');
    }
    props.onCheckout(previewCart, 'pickup');

    expect(await screen.findByText('agritech.marketplace.access.verify')).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith('/verification');
    expect(addToCartMock()).not.toHaveBeenCalled();
  });

  it('retries adoption from the checkout control once the buyer is authorized', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 2, seller: firstListing }]);
    addToCartMock().mockResolvedValueOnce(apiFailure(409));
    testState.marketplaceData = buildMarketplaceData({ partners: approvedBuyerPartner, refresh });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await waitFor(() => {
      expect(addToCartMock()).toHaveBeenCalledTimes(1);
    });

    addToCartMock().mockResolvedValue(apiSuccess(serverCart('cart-a', 'Seed cooperative', firstListing.id, 2)));
    const props = cartProps();
    const previewCart = props.carts.data.find((cart) => cart.id.startsWith('guest-cart:'));
    if (!previewCart) {
      throw new Error('The preview cart must still be visible after a rejected adoption.');
    }
    props.onCheckout(previewCart, 'pickup');

    await waitFor(() => {
      expect(storedPreviewLines()).toEqual([]);
    });
    expect(adoptionKeys()).toEqual([
      `guest-cart:${buyerPartnerId}:${firstListing.id}:2`,
      `guest-cart:${buyerPartnerId}:${firstListing.id}:2`,
    ]);
    expect(navigate).not.toHaveBeenCalled();
  });
});

/**
 * One barrier, named once. The reported defect was a control that read "continue to
 * sign in" to an actor who was signed in and verified, and then opened verification:
 * the wording and the destination named different steps, and neither named the real
 * one. Each state below fixes the wording, the entry point and whether the cart may
 * be checked out at all against the same computed barrier.
 */
describe('the cart checkout control is bound to the actor real barrier', () => {
  const withPreviewLine = (): void => {
    storePreviewLines([{ listingPublicationId: firstListing.id, quantity: 2, seller: firstListing }]);
  };

  const previewCart = (): CartViewDto => {
    const cart = cartProps().carts.data.find((entry) => entry.id.startsWith('guest-cart:'));
    if (!cart) {
      throw new Error('The preview cart must be visible before checkout.');
    }
    return cart;
  };

  it('names the buying role rather than sign-in for a verified seller', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    withPreviewLine();
    testState.marketplaceData = buildMarketplaceData({
      partners: approvedBuyerPartner,
      refresh,
      verification: { ...verifiedBuyer, role: 'seller' },
    });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await screen.findByTestId('cart-view');

    const props = cartProps();
    expect(props.canCheckout).toBe(false);
    expect(props.checkoutHint).toBe('agritech.marketplace.access.buyerRole');
    // Buying is outside a seller's role, not a step it can complete, so the control
    // offers no destination at all. Verification cannot change a submitted role.
    expect(props.checkoutActionLabel).toBeUndefined();
    expect(props.onCheckoutAction).toBeUndefined();

    props.onCheckout(previewCart(), 'pickup');
    expect(await screen.findByText('agritech.marketplace.access.buyerRole')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalledWith('/verification');
    expect(addToCartMock()).not.toHaveBeenCalled();
    expect(apiMock('marketplaceControllerCheckoutCart')).not.toHaveBeenCalled();
  });

  it('names the missing buyer organization and opens the organization profile', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    withPreviewLine();
    testState.marketplaceData = buildMarketplaceData({ refresh });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await screen.findByTestId('cart-view');

    const props = cartProps();
    expect(props.canCheckout).toBe(false);
    expect(props.checkoutHint).toBe('agritech.marketplace.access.organization');
    expect(props.checkoutActionLabel).toBe('agritech.marketplace.access.action.organization');

    props.onCheckoutAction?.();
    expect(navigate).toHaveBeenLastCalledWith('/account');

    props.onCheckout(previewCart(), 'pickup');
    expect(await screen.findByText('agritech.marketplace.access.organization')).toBeTruthy();
    expect(navigate).toHaveBeenLastCalledWith('/account');
    expect(addToCartMock()).not.toHaveBeenCalled();
  });

  it('reports a check in progress instead of a missing organization while the list is still read', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    withPreviewLine();
    testState.marketplaceData = buildMarketplaceData({ partnersStatus: 'loading', refresh });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await screen.findByTestId('cart-view');

    const props = cartProps();
    expect(props.canCheckout).toBe(false);
    expect(props.checkoutHint).toBe('agritech.marketplace.access.checking');
    expect(props.checkoutActionLabel).toBeUndefined();
    expect(props.onCheckoutAction).toBeUndefined();

    props.onCheckout(previewCart(), 'pickup');
    expect(await screen.findByText('agritech.marketplace.access.checking')).toBeTruthy();
    // Nothing is claimed and nowhere is entered while the answer is unknown.
    expect(navigate).not.toHaveBeenCalled();
    expect(addToCartMock()).not.toHaveBeenCalled();
  });

  it('never tells the actor to sign in while the session itself is being re-read', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    withPreviewLine();
    testState.marketplaceData = buildMarketplaceData({ auth: 'checking', partners: approvedBuyerPartner, refresh });

    render(<MarketplacePage navigate={navigate} view="cart" />);
    await screen.findByTestId('cart-view');

    const props = cartProps();
    expect(props.canCheckout).toBe(false);
    expect(props.checkoutHint).toBe('agritech.marketplace.access.checking');
    expect(props.checkoutActionLabel).toBeUndefined();
    expect(props.onCheckoutAction).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves checkout open when nothing is missing', async () => {
    const refresh = vi.fn();
    testState.marketplaceData = buildMarketplaceData({ partners: approvedBuyerPartner, refresh });

    render(<MarketplacePage view="cart" />);
    await screen.findByTestId('cart-view');

    const props = cartProps();
    expect(props.canCheckout).toBe(true);
    expect(props.checkoutHint).toBeUndefined();
    expect(props.checkoutActionLabel).toBeUndefined();
    expect(props.onCheckoutAction).toBeUndefined();
  });
});
