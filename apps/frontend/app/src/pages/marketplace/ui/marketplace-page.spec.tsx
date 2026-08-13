// @requirements REQ-AGRITECH-MARKETPLACE-016
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractViewDto,
  OfferViewDto,
  ProductViewDto,
  ReviewViewDto,
  SampleViewDto,
} from '@app/frontend-api-client';
import type { MarketplaceData } from '../model/use-marketplace-data';
import { MarketplacePage } from './marketplace-page';

const testState = vi.hoisted(() => {
  const api = {
    marketplaceControllerAddFavorite: vi.fn(),
    marketplaceControllerAddReview: vi.fn(),
    marketplaceControllerAddToCart: vi.fn(),
    marketplaceControllerAskAi: vi.fn(),
    marketplaceControllerCheckoutCart: vi.fn(),
    marketplaceControllerChooseOffer: vi.fn(),
    marketplaceControllerCreateRequest: vi.fn(),
    marketplaceControllerListReviews: vi.fn(),
    marketplaceControllerMakeOffer: vi.fn(),
    marketplaceControllerRemoveCartItem: vi.fn(),
    marketplaceControllerRemoveFavorite: vi.fn(),
    marketplaceControllerRequestSample: vi.fn(),
    marketplaceControllerSignContract: vi.fn(),
    marketplaceControllerUpdateCartItem: vi.fn(),
    marketplaceControllerUpdateContractDeliveryQuote: vi.fn(),
  };
  return {
    addToCart: api.marketplaceControllerAddToCart,
    api,
    localActions: {
      addToCart: vi.fn(),
      checkout: vi.fn(),
      toggleFavorite: vi.fn(),
      updateCart: vi.fn(),
    },
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
  // A stand-in with an identity, so a test can say where the control is rendered
  // without reaching into the shared component's own markup.
  LanguageSwitcher: () => <span data-testid="language-switcher" />,
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

const signedInData = (): MarketplaceData => ({
  auth: 'signed-in',
  carts: emptyList,
  catalog: { data: [product], status: 'ready' },
  contracts: emptyList,
  demo: 'none',
  favorites: emptyList,
  local: false,
  localActions: testState.localActions,
  myRequests: emptyList,
  offersByRequest: { data: {}, status: 'empty' },
  refresh: testState.refresh,
  requests: emptyList,
  samples: emptyList,
  sampleUsage: { data: { limit: 5, remaining: 5, used: 0 }, status: 'ready' },
  verification: {
    data: {
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
    },
    status: 'ready',
  },
});

/** Nobody signed in: cart and favourite writes stay in this browser. */
const guestData = (): MarketplaceData => ({
  ...signedInData(),
  auth: 'signed-out',
  demo: 'guest',
  local: true,
  verification: { data: null, status: 'empty' },
});

describe('MarketplacePage mutations', () => {
  beforeEach(() => {
    testState.refresh.mockReset();
    testState.addToCart.mockReset();
    testState.localActions.addToCart.mockReset();
    testState.localActions.checkout.mockReset();
    testState.localActions.toggleFavorite.mockReset();
    testState.localActions.updateCart.mockReset();
    testState.marketplaceData = signedInData();
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

  // 404 and 409 mean the page is out of date; anything else is just a failure,
  // and re-reading the lists would not change what the visitor sees.
  it('states a plain failure for a status it cannot explain, and re-reads nothing', async () => {
    testState.addToCart.mockResolvedValue({
      error: { detail: 'The service is unavailable.' },
      response: new Response(null, { status: 503 }),
    });

    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));

    expect((await screen.findByRole('alert')).textContent).toContain('agritech.marketplace.error');
    expect(testState.refresh).not.toHaveBeenCalled();
  });

  it('keeps a guest basket and favourites in the browser instead of asking for an account', async () => {
    testState.marketplaceData = guestData();

    render(<MarketplacePage />);

    // The credential banner is part of the home page, below the hero.
    expect(screen.getByText('agritech.marketplace.demo.title')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));
    expect(testState.localActions.addToCart).toHaveBeenCalledWith(product, 1);
    expect((await screen.findByRole('status')).textContent).toContain('agritech.marketplace.cart.addedToSellerCart');
    expect(testState.addToCart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addFavorite' }));
    expect(testState.localActions.toggleFavorite).toHaveBeenCalledWith(product.id);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.close' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('runs a guest checkout to an emptied basket and says what signing needs', async () => {
    testState.marketplaceData = {
      ...guestData(),
      carts: {
        data: [
          {
            createdAt: '2026-08-09T10:00:00.000Z',
            id: 'guest-cart-seller-1',
            items: [{ productId: product.id, quantity: 2 }],
            sellerId: product.supplierId,
            status: 'open',
            tenantId: 'guest',
            updatedAt: '2026-08-09T10:00:00.000Z',
            userId: 'guest',
          },
        ],
        status: 'ready',
      },
    };

    render(<MarketplacePage view="cart" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.cart.reviewContract' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('agritech.marketplace.cart.checkoutConfirmation');
    fireEvent.click(within(dialog).getByRole('button', { name: 'agritech.marketplace.cart.reviewContract' }));

    await waitFor(() => {
      expect(testState.localActions.checkout).toHaveBeenCalledWith('guest-cart-seller-1');
    });
    expect(await screen.findByText('agritech.marketplace.demo.checkoutDone')).toBeTruthy();
  });

  it('explains the account-only surfaces to a guest instead of an empty page', () => {
    testState.marketplaceData = guestData();
    const navigate = vi.fn();
    window.history.replaceState({}, '', '/account');

    render(<MarketplacePage navigate={navigate} view="account" />);

    expect(screen.getByText('agritech.marketplace.auth.title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.signIn/u }));
    expect(navigate).toHaveBeenCalledWith(`/auth?returnUrl=${encodeURIComponent('/account')}`);

    window.history.replaceState({}, '', '/');
  });

  it('searches the catalog from the header and browses its sections', () => {
    const navigate = vi.fn();

    render(<MarketplacePage navigate={navigate} />);

    const searchBox = screen.getByRole('searchbox', { name: 'agritech.marketplace.search' });
    fireEvent.change(searchBox, { target: { value: '  wheat seed  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.search' }));
    expect(navigate).toHaveBeenLastCalledWith(`/catalog?q=${encodeURIComponent('wheat seed')}`);

    // A blank query is a request for the whole catalog, not for an empty result.
    fireEvent.change(searchBox, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.search' }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.seeds' }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog?section=seeds');
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.all' }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
  });

  it('offers the display language in the header and nowhere else', () => {
    render(<MarketplacePage navigate={vi.fn()} />);

    // Reachable without scrolling, in the row a visitor who cannot read the page
    // looks at first. It used to sit above the footer, where finding it meant
    // scrolling the whole page in a language the visitor could not read.
    const switchers = screen.getAllByTestId('language-switcher');
    expect(switchers).toHaveLength(1);
    expect(within(screen.getByRole('banner')).getByTestId('language-switcher')).toBe(switchers[0]);
  });

  it('reaches every site area from one header, and sends unverified accounts to identity first', () => {
    const navigate = vi.fn();

    render(<MarketplacePage navigate={navigate} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.brand' })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/');
    fireEvent.click(screen.getAllByRole('button', { name: /agritech\.marketplace\.catalog$/u })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
    fireEvent.click(screen.getAllByRole('button', { name: /agritech\.marketplace\.orders/u })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/requests');
    fireEvent.click(screen.getAllByRole('button', { name: /agritech\.marketplace\.favorites/u })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/favorites');
    fireEvent.click(screen.getAllByRole('button', { name: /agritech\.marketplace\.cart$/u })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/cart');
    // Verified in this fixture, so the same slot opens the account page.
    fireEvent.click(screen.getAllByRole('button', { name: /agritech\.marketplace\.account/u })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/account');

    cleanup();
    testState.marketplaceData = guestData();
    render(<MarketplacePage navigate={navigate} />);

    fireEvent.click(screen.getAllByRole('button', { name: /agritech\.marketplace\.verification/u })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/verification');
  });

  it('keeps the profile and preferences pages reachable from the footer', () => {
    const navigate = vi.fn();

    render(<MarketplacePage navigate={navigate} />);

    const footer = document.querySelector('.dh-footer');

    if (!(footer instanceof HTMLElement)) {
      throw new Error('The site footer is missing.');
    }

    fireEvent.click(within(footer).getByRole('button', { name: 'agritech.marketplace.brand' }));
    expect(navigate).toHaveBeenLastCalledWith('/');

    for (const [name, target] of [
      ['agritech.marketplace.footer.forBuyers: agritech.marketplace.catalog', '/catalog'],
      ['agritech.marketplace.footer.forBuyers: agritech.marketplace.orders', '/requests'],
      ['agritech.marketplace.footer.forSellers: agritech.marketplace.orders.feed', '/requests'],
      ['agritech.marketplace.verification', '/verification'],
      ['agritech.marketplace.account', '/account'],
      ['user.nav.profile', '/profile'],
      ['user.nav.settings', '/settings'],
    ] as const) {
      fireEvent.click(within(footer).getByRole('button', { name }));
      expect(navigate).toHaveBeenLastCalledWith(target);
    }

    const mobileNav = document.querySelector('.dh-mobile-nav');

    if (!(mobileNav instanceof HTMLElement)) {
      throw new Error('The mobile navigation is missing.');
    }

    fireEvent.click(within(mobileNav).getByRole('button', { name: 'agritech.marketplace.home' }));
    expect(navigate).toHaveBeenLastCalledWith('/');
    fireEvent.click(within(mobileNav).getByRole('button', { name: 'agritech.marketplace.cart' }));
    expect(navigate).toHaveBeenLastCalledWith('/cart');
  });

  it('shows one loading state while the session or the catalog is still in flight', () => {
    testState.marketplaceData = { ...signedInData(), auth: 'checking' };
    const view = render(<MarketplacePage />);

    expect(screen.getByLabelText('agritech.marketplace.loading')).toBeTruthy();

    testState.marketplaceData = { ...signedInData(), catalog: { data: [], status: 'loading' } };
    view.rerender(<MarketplacePage />);
    expect(screen.getByLabelText('agritech.marketplace.loading')).toBeTruthy();
  });

  it('wraps other routes in the same chrome without reading the catalog', () => {
    testState.marketplaceData = { ...signedInData(), catalog: { data: [], status: 'loading' } };

    render(
      <MarketplacePage view="embedded">
        <p>Preferences</p>
      </MarketplacePage>,
    );

    expect(screen.getByText('Preferences')).toBeTruthy();
    expect(screen.queryByLabelText('agritech.marketplace.loading')).toBeNull();
    // One header for the whole site, so the embedded route keeps the search field.
    expect(screen.getByRole('searchbox', { name: 'agritech.marketplace.search' })).toBeTruthy();
  });
});

const ok = <T,>(data: T) => ({ data, response: new Response(null, { status: 200 }) });
const failed = (status: number) => ({
  error: { detail: 'The marketplace refused the write.' },
  response: new Response(null, { status }),
});

const secondSeed: ProductViewDto = {
  ...product,
  description: 'Certified wheat seed',
  id: 'seed-2',
  name: 'Wheat seed',
  priceUzs: 900_000,
};

const cart = (items: CartViewDto['items']): CartViewDto => ({
  createdAt: '2026-08-09T10:00:00.000Z',
  id: 'cart-1',
  items,
  sellerId: product.supplierId,
  status: 'open',
  tenantId: 'tenant-1',
  updatedAt: '2026-08-09T10:00:00.000Z',
  userId: 'buyer-1',
});

const contract = (overrides: Partial<ContractViewDto> = {}): ContractViewDto => ({
  amountUzs: 2_500_000,
  buyerUserId: 'buyer-1',
  createdAt: '2026-08-09T10:00:00.000Z',
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  id: 'contract-1',
  lines: [
    {
      lineTotalUzs: 2_500_000,
      name: product.name,
      productId: product.id,
      quantity: 2,
      unit: product.unit,
      unitPriceUzs: product.priceUzs,
    },
  ],
  sellerUserId: 'seller-1',
  status: 'draft',
  subject: 'Corn seed supply',
  tenantId: 'tenant-1',
  updatedAt: '2026-08-10T10:00:00.000Z',
  ...overrides,
});

const request = (overrides: Partial<BuyerRequestViewDto> = {}): BuyerRequestViewDto => ({
  buyerUserId: 'buyer-1',
  createdAt: '2026-08-09T10:00:00.000Z',
  id: 'request-1',
  region: 'Samarqand',
  status: 'open',
  tenantId: 'tenant-1',
  title: 'Corn seed for autumn',
  updatedAt: '2026-08-09T10:00:00.000Z',
  ...overrides,
});

const offer = (overrides: Partial<OfferViewDto> = {}): OfferViewDto => ({
  createdAt: '2026-08-09T11:00:00.000Z',
  deliveryTerms: 'pickup',
  id: 'offer-1',
  priceUzs: 2_400_000,
  requestId: 'request-1',
  sellerUserId: 'seller-1',
  status: 'pending',
  tenantId: 'tenant-1',
  ...overrides,
});

const review = (overrides: Partial<ReviewViewDto> = {}): ReviewViewDto => ({
  createdAt: '2026-08-10T10:00:00.000Z',
  id: 'review-1',
  productId: product.id,
  rating: 4,
  tenantId: 'tenant-1',
  userId: 'other-buyer',
  ...overrides,
});

const sample = (overrides: Partial<SampleViewDto> = {}): SampleViewDto => ({
  createdAt: '2026-08-10T10:00:00.000Z',
  id: 'sample-1',
  productId: product.id,
  sellerId: product.supplierId,
  status: 'pending',
  tenantId: 'tenant-1',
  userId: 'buyer-1',
  ...overrides,
});

/** The identity record with one field moved, so unverified runs stay readable. */
const withIdentity = (
  base: MarketplaceData,
  overrides: Partial<NonNullable<MarketplaceData['verification']['data']>>,
): MarketplaceData => {
  const current = signedInData().verification.data;

  if (!current) {
    throw new Error('The signed-in fixture lost its identity record.');
  }

  return { ...base, verification: { data: { ...current, ...overrides }, status: 'ready' } };
};

/** Lets a released promise chain finish before the page is inspected again. */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const panel = (selector: string): HTMLElement => {
  const found = document.querySelector(selector);

  if (!(found instanceof HTMLElement)) {
    throw new Error(`The ${selector} region is missing from the page.`);
  }

  return found;
};

describe('MarketplacePage journeys', () => {
  beforeEach(() => {
    testState.refresh.mockReset();
    testState.localActions.addToCart.mockReset();
    testState.localActions.checkout.mockReset();
    testState.localActions.toggleFavorite.mockReset();
    testState.localActions.updateCart.mockReset();
    for (const call of Object.values(testState.api)) {
      call.mockReset();
    }
    testState.api.marketplaceControllerListReviews.mockResolvedValue(ok({ items: [] }));
    testState.marketplaceData = signedInData();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('loads the public ratings of a product and appends the review a buyer just wrote', async () => {
    testState.api.marketplaceControllerListReviews.mockResolvedValue(ok({ items: [review()] }));
    testState.api.marketplaceControllerAddReview.mockResolvedValue(
      ok(review({ comment: 'Germinated well.', id: 'review-2', rating: 4, userId: 'buyer-1' })),
    );
    testState.marketplaceData = {
      ...signedInData(),
      catalog: { data: [product, secondSeed], status: 'ready' },
      contracts: { data: [contract({ status: 'completed' })], status: 'ready' },
    };

    render(<MarketplacePage productId={product.id} view="product" />);

    await waitFor(() => {
      expect(testState.api.marketplaceControllerListReviews).toHaveBeenCalledWith(product.id, {});
    });
    await waitFor(() => {
      expect(within(panel('.dh-review-list')).getByText('4/5')).toBeTruthy();
    });

    // The contract fixture is a completed purchase of this product by this
    // account, which is exactly the condition the review form is gated on.
    const form = panel('.dh-review-form');
    fireEvent.change(within(form).getByRole('combobox'), { target: { value: '4' } });
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: '  Germinated well.  ' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(testState.api.marketplaceControllerAddReview).toHaveBeenCalledWith(
        product.id,
        { comment: 'Germinated well.', rating: 4 },
        {},
      );
    });
    expect(await screen.findByText('agritech.marketplace.reviews.submitted')).toBeTruthy();
    expect(screen.getByText('Germinated well.')).toBeTruthy();
    // Same category, different record: the page offers it as an alternative.
    expect(screen.getByRole('button', { name: secondSeed.name })).toBeTruthy();
  });

  it('says the ratings are unavailable rather than reporting a product with none', async () => {
    testState.api.marketplaceControllerListReviews.mockResolvedValue(failed(503));

    render(<MarketplacePage productId={product.id} view="product" />);

    expect(await screen.findByText('agritech.marketplace.reviews.unavailable')).toBeTruthy();
    // Nothing gates the rest of the page on the rating request.
    expect(screen.getByRole('button', { name: /agritech\.marketplace\.product\.addToCart/u })).toBeTruthy();
  });

  it('adds the chosen quantity to the basket and moves the favourite both ways', async () => {
    testState.api.marketplaceControllerAddToCart.mockResolvedValue(ok({ cartId: 'cart-1' }));
    testState.api.marketplaceControllerAddFavorite.mockResolvedValue(ok({ productId: product.id }));
    testState.api.marketplaceControllerRemoveFavorite.mockResolvedValue(ok({ productId: product.id }));

    const view = render(<MarketplacePage productId={product.id} view="product" />);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.product\.addToCart/u }));

    await waitFor(() => {
      expect(testState.api.marketplaceControllerAddToCart).toHaveBeenCalledWith(
        { productId: product.id, quantity: 3 },
        {},
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addFavorite' }));
    await waitFor(() => {
      expect(testState.api.marketplaceControllerAddFavorite).toHaveBeenCalledWith(product.id, {});
    });

    testState.marketplaceData = {
      ...signedInData(),
      favorites: {
        data: [
          { createdAt: '2026-08-10T10:00:00.000Z', productId: product.id, tenantId: 'tenant-1', userId: 'buyer-1' },
        ],
        status: 'ready',
      },
    };
    view.rerender(<MarketplacePage productId={product.id} view="product" />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.removeFavorite' }));
    await waitFor(() => {
      expect(testState.api.marketplaceControllerRemoveFavorite).toHaveBeenCalledWith(product.id, {});
    });
  });

  it.each([
    [401, 'agritech.marketplace.auth.required'],
    [403, 'agritech.marketplace.cart.verifyRequired'],
  ] as const)('names what a %s refusal needs instead of a bare failure', async (status, message) => {
    testState.api.marketplaceControllerAddToCart.mockResolvedValue(failed(status));

    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));

    expect((await screen.findByRole('alert')).textContent).toContain(message);
    // Only 404 and 409 mean the state on screen is stale, so nothing refetches.
    expect(testState.refresh).not.toHaveBeenCalled();
  });

  it('reports a transport failure as one error and keeps the page usable', async () => {
    testState.api.marketplaceControllerAddToCart.mockRejectedValue(new Error('The network went away.'));

    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));

    expect((await screen.findByRole('alert')).textContent).toContain('agritech.marketplace.error');
  });

  it('retires a notice on its own so it does not sit on the page forever', () => {
    vi.useFakeTimers();
    testState.marketplaceData = guestData();

    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens a product from the catalog grid', () => {
    const navigate = vi.fn();

    render(<MarketplacePage navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: `agritech.marketplace.product.openDetails` }));

    expect(navigate).toHaveBeenCalledWith(`/products/${product.id}`);
  });

  it('hands the route to the browser when the site chrome is mounted without one', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, pathname: '/', search: '' });

    render(<MarketplacePage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.brand' })[0] as HTMLElement);

    expect(assign).toHaveBeenCalledWith('/');
  });

  // The sign-in invitation is typed against a browser, but it also renders where
  // there is no `location` to name the page being returned to.
  it('invites a guest to sign in and come back to the site root when there is no page to name', () => {
    const navigate = vi.fn();
    testState.marketplaceData = guestData();
    vi.stubGlobal('location', undefined);

    render(<MarketplacePage navigate={navigate} view="account" />);
    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.signIn/u }));

    expect(navigate).toHaveBeenCalledWith(`/auth?returnUrl=${encodeURIComponent('/')}`);
  });

  it('sends an unverified account to identity before a sample, and confirms it once verified', async () => {
    const navigate = vi.fn();
    testState.marketplaceData = withIdentity(signedInData(), { level: 'basic', status: 'pending' });

    const view = render(<MarketplacePage navigate={navigate} productId={product.id} view="product" />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.sample' }));
    expect(navigate).toHaveBeenCalledWith('/verification');
    expect(testState.api.marketplaceControllerRequestSample).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('agritech.marketplace.cart.verifyRequired');

    testState.api.marketplaceControllerRequestSample.mockResolvedValue(ok(sample()));
    testState.marketplaceData = signedInData();
    view.rerender(<MarketplacePage navigate={navigate} productId={product.id} view="product" />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.sample' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('agritech.marketplace.samples.confirmDescription');
    fireEvent.click(within(dialog).getByRole('button', { name: 'agritech.marketplace.samples.confirm' }));

    await waitFor(() => {
      expect(testState.api.marketplaceControllerRequestSample).toHaveBeenCalledWith({ productId: product.id }, {});
    });
    expect(await screen.findByText('agritech.marketplace.samples.requested')).toBeTruthy();
  });

  // Once the visitor has confirmed, the dialog is the only thing telling them a
  // write is running: Escape and a click outside must not take it away mid-flight.
  it('holds a confirmation open while the write it started is still running', async () => {
    let land!: (value: { data: SampleViewDto; response: Response }) => void;
    testState.api.marketplaceControllerRequestSample.mockReturnValue(
      new Promise<{ data: SampleViewDto; response: Response }>((resolve) => {
        land = resolve;
      }),
    );

    render(<MarketplacePage productId={product.id} view="product" />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.sample' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'agritech.marketplace.samples.confirm' }));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.mouseDown(panel('.dh-dialog-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeNull();

    land(ok(sample()));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('agritech.marketplace.samples.requested')).toBeTruthy();
  });

  it('drops a rating list that lands after the visitor left the product', async () => {
    let land!: (value: { data: { items: ReviewViewDto[] }; response: Response }) => void;
    let fail!: (reason: Error) => void;
    testState.api.marketplaceControllerListReviews
      .mockReturnValueOnce(
        new Promise<{ data: { items: ReviewViewDto[] }; response: Response }>((resolve) => {
          land = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<never>((_resolve, reject) => {
          fail = reject;
        }),
      );
    testState.marketplaceData = {
      ...signedInData(),
      contracts: { data: [contract({ status: 'completed' })], status: 'ready' },
    };

    const view = render(<MarketplacePage productId={product.id} view="product" />);
    view.rerender(<MarketplacePage view="catalog" />);
    land(ok({ items: [review()] }));
    await settle();

    expect(screen.queryByText('4/5')).toBeNull();

    view.rerender(<MarketplacePage productId={product.id} view="product" />);
    view.rerender(<MarketplacePage view="catalog" />);
    fail(new Error('The ratings service is unreachable.'));
    await settle();

    expect(screen.queryByText('agritech.marketplace.reviews.unavailable')).toBeNull();
  });

  it('records a rating with no comment attached to it', async () => {
    testState.api.marketplaceControllerAddReview.mockResolvedValue(ok(review({ rating: 5, userId: 'buyer-1' })));
    testState.marketplaceData = {
      ...signedInData(),
      contracts: { data: [contract({ status: 'completed' })], status: 'ready' },
    };

    render(<MarketplacePage productId={product.id} view="product" />);

    const form = await waitFor(() => panel('.dh-review-form'));
    fireEvent.change(within(form).getByRole('combobox'), { target: { value: '5' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(testState.api.marketplaceControllerAddReview).toHaveBeenCalledWith(product.id, { rating: 5 }, {});
    });
  });

  it('names the seller by identifier when the basket holds a product the catalog dropped', async () => {
    testState.marketplaceData = {
      ...signedInData(),
      carts: { data: [cart([{ productId: 'ghost-1', quantity: 2 }])], status: 'ready' },
    };

    render(<MarketplacePage view="cart" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.cart.reviewContract' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('agritech.marketplace.cart.checkoutConfirmation');
    expect(screen.getByText('agritech.marketplace.product.unavailable')).toBeTruthy();
  });

  it('closes a confirmation with Escape and with a click outside it', async () => {
    render(<MarketplacePage productId={product.id} view="product" />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.sample' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.sample' }));
    await screen.findByRole('dialog');
    fireEvent.mouseDown(panel('.dh-dialog-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(testState.api.marketplaceControllerRequestSample).not.toHaveBeenCalled();
  });

  it('changes a basket quantity, drops a line at zero and drafts the contract', async () => {
    const navigate = vi.fn();
    testState.api.marketplaceControllerUpdateCartItem.mockResolvedValue(ok(cart([])));
    testState.api.marketplaceControllerRemoveCartItem.mockResolvedValue(ok(cart([])));
    testState.api.marketplaceControllerCheckoutCart.mockResolvedValue(
      ok({ cartId: 'cart-1', contractId: 'contract-1' }),
    );
    testState.marketplaceData = {
      ...signedInData(),
      carts: {
        data: [
          cart([
            { productId: product.id, quantity: 2 },
            { productId: secondSeed.id, quantity: 1 },
          ]),
        ],
        status: 'ready',
      },
      catalog: { data: [product, secondSeed], status: 'ready' },
    };

    render(<MarketplacePage navigate={navigate} view="cart" />);

    const increases = screen.getAllByRole('button', { name: 'agritech.marketplace.cart.increase' });
    fireEvent.click(increases[0] as HTMLElement);
    await waitFor(() => {
      expect(testState.api.marketplaceControllerUpdateCartItem).toHaveBeenCalledWith(
        'cart-1',
        product.id,
        { quantity: 3 },
        {},
      );
    });

    // The last unit leaves the basket rather than being written back as zero.
    const decreases = screen.getAllByRole('button', { name: 'agritech.marketplace.cart.decrease' });
    fireEvent.click(decreases[1] as HTMLElement);
    await waitFor(() => {
      expect(testState.api.marketplaceControllerRemoveCartItem).toHaveBeenCalledWith('cart-1', secondSeed.id, {});
    });

    fireEvent.click(screen.getByLabelText('agritech.marketplace.product.pickup'));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.cart.reviewContract' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'agritech.marketplace.cart.reviewContract' }));

    await waitFor(() => {
      expect(testState.api.marketplaceControllerCheckoutCart).toHaveBeenCalledWith(
        'cart-1',
        { deliveryTerms: 'pickup' },
        {},
      );
    });
    expect(navigate).toHaveBeenCalledWith('/contracts/contract-1');
  });

  it('stops an unverified basket at the identity step instead of at a draft contract', () => {
    const navigate = vi.fn();
    testState.marketplaceData = withIdentity(
      { ...signedInData(), carts: { data: [cart([{ productId: product.id, quantity: 1 }])], status: 'ready' } },
      { level: 'basic', status: 'pending' },
    );

    render(<MarketplacePage navigate={navigate} view="cart" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.cart.reviewContract' }));

    expect(navigate).toHaveBeenCalledWith('/verification');
    expect(panel('.dh-notice').textContent).toContain('agritech.marketplace.cart.verifyRequired');
    expect(testState.api.marketplaceControllerCheckoutCart).not.toHaveBeenCalled();
  });

  it('keeps a guest basket quantity change in this browser', () => {
    testState.marketplaceData = {
      ...guestData(),
      carts: { data: [cart([{ productId: product.id, quantity: 2 }])], status: 'ready' },
    };

    render(<MarketplacePage view="cart" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.cart.increase' }));

    expect(testState.localActions.updateCart).toHaveBeenCalledWith(product.id, 3);
    expect(panel('.dh-notice').textContent).toContain('agritech.marketplace.cart.updated');
    expect(testState.api.marketplaceControllerUpdateCartItem).not.toHaveBeenCalled();
  });

  it('publishes a purchase request, and asks an unverified buyer for identity first', async () => {
    const navigate = vi.fn();
    testState.api.marketplaceControllerCreateRequest.mockResolvedValue(ok(request()));
    testState.marketplaceData = withIdentity(signedInData(), { level: 'basic', status: 'pending' });

    const view = render(<MarketplacePage navigate={navigate} view="requests" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/verification');

    testState.marketplaceData = signedInData();
    view.rerender(<MarketplacePage navigate={navigate} view="requests" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0] as HTMLElement);

    const form = panel('.dh-form');
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.requestTitle'), {
      target: { value: 'Corn seed for autumn' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.product'), {
      target: { value: 'Corn seed' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.volume'), {
      target: { value: '40 t' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.region'), {
      target: { value: 'Samarqand' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.deadline'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.budget'), {
      target: { value: '2500000' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.requirements'), {
      target: { value: 'Certified seed only.' },
    });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(testState.api.marketplaceControllerCreateRequest).toHaveBeenCalledWith(
        {
          budgetUzs: 2_500_000,
          deadline: '2026-09-01',
          product: 'Corn seed',
          region: 'Samarqand',
          requirements: 'Certified seed only.',
          title: 'Corn seed for autumn',
          volume: '40 t',
        },
        {},
      );
    });
    expect(await screen.findByText('agritech.marketplace.orders.created')).toBeTruthy();
  });

  it('lets an eligible seller quote a delivered offer and abandon the form', async () => {
    testState.api.marketplaceControllerMakeOffer.mockResolvedValue(ok(offer()));
    testState.marketplaceData = withIdentity(
      {
        ...signedInData(),
        requests: { data: [request({ buyerUserId: 'buyer-9', id: 'request-9' })], status: 'ready' },
      },
      { role: 'seller', userId: 'seller-1' },
    );

    render(<MarketplacePage view="requests" />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' }));
    const form = panel('.dh-inline-form');
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.price'), {
      target: { value: '2400000' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.product.delivery'), {
      target: { value: 'seller_delivery' },
    });
    // Choosing to deliver adds the price of doing so, and it is required.
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.contract.deliveryPrice'), {
      target: { value: '150000' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '7' } });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: 'Delivered to the gate.' },
    });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(testState.api.marketplaceControllerMakeOffer).toHaveBeenCalledWith(
        'request-9',
        {
          deliveryDays: 7,
          deliveryNote: 'Delivered to the gate.',
          deliveryPriceUzs: 150_000,
          deliveryTerms: 'seller_delivery',
          priceUzs: 2_400_000,
        },
        {},
      );
    });

    // The form stays open after a send, so abandoning it is its own action.
    fireEvent.click(within(panel('.dh-inline-form')).getByRole('button', { name: 'agritech.marketplace.cancel' }));
    expect(document.querySelector('.dh-inline-form')).toBeNull();
    expect(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' })).toBeTruthy();
  });

  it('chooses the cheapest offer and opens the contract it drafted', async () => {
    const navigate = vi.fn();
    testState.api.marketplaceControllerChooseOffer.mockResolvedValue(
      ok({ contractId: 'contract-1', offerId: 'offer-2', requestId: 'request-1', sellerUserId: 'seller-2' }),
    );
    testState.marketplaceData = {
      ...signedInData(),
      myRequests: { data: [request({ status: 'offering' })], status: 'ready' },
      offersByRequest: {
        data: {
          'request-1': [
            offer({ deliveryDays: 4, deliveryPriceUzs: 120_000, deliveryTerms: 'seller_delivery', id: 'offer-1' }),
            offer({ id: 'offer-2', priceUzs: 2_100_000, sellerUserId: 'seller-2' }),
            offer({ id: 'offer-3', priceUzs: 2_900_000, status: 'declined' }),
          ],
        },
        status: 'ready',
      },
    };

    render(<MarketplacePage navigate={navigate} view="requests" />);

    // Sorted by price, so the cheapest carries the best-offer marker.
    const offers = panel('.dh-offer-list');
    expect(panel('.dh-offer-list > div').textContent).toContain('agritech.marketplace.orders.bestOffer');
    const declined = within(offers).getByRole<HTMLButtonElement>('button', {
      name: 'agritech.marketplace.orders.offerStatus.declined',
    });
    expect(declined.disabled).toBe(true);

    fireEvent.click(
      within(offers).getAllByRole('button', { name: 'agritech.marketplace.orders.choose' })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'agritech.marketplace.orders.confirmOffer' }));

    await waitFor(() => {
      expect(testState.api.marketplaceControllerChooseOffer).toHaveBeenCalledWith('request-1', 'offer-2', {});
    });
    expect(navigate).toHaveBeenCalledWith('/contracts/contract-1');
  });

  it('states which order lists are unavailable instead of showing them as empty', () => {
    testState.marketplaceData = {
      ...signedInData(),
      myRequests: { data: [], status: 'error' },
      requests: { data: [], status: 'error' },
    };

    const view = render(<MarketplacePage view="requests" />);
    expect(screen.getAllByText('agritech.marketplace.orders.unavailable').length).toBe(2);

    testState.marketplaceData = {
      ...signedInData(),
      myRequests: { data: [], status: 'loading' },
      requests: { data: [], status: 'loading' },
    };
    view.rerender(<MarketplacePage view="requests" />);
    expect(document.querySelectorAll('.dh-skeleton-grid').length).toBe(2);
  });

  it('opens the request form from the empty state a buyer lands on', () => {
    render(<MarketplacePage view="requests" />);

    expect(screen.getByText('agritech.marketplace.orders.feedEmpty')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.orders.empty')).toBeTruthy();

    // The heading button is first; this is the one inside the empty state.
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[1] as HTMLElement);
    expect(panel('.dh-form')).toBeTruthy();
    fireEvent.click(within(panel('.dh-form')).getByRole('button', { name: 'agritech.marketplace.cancel' }));
    expect(document.querySelector('.dh-form')).toBeNull();
  });

  it('records the buyer signature on a draft contract', async () => {
    testState.api.marketplaceControllerSignContract.mockResolvedValue(ok(contract({ status: 'signed' })));
    testState.marketplaceData = {
      ...signedInData(),
      contracts: { data: [contract()], status: 'ready' },
    };

    render(<MarketplacePage contractId="contract-1" view="contract" />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.contract.signOwnParty' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'agritech.marketplace.contract.signOwnParty' }));

    await waitFor(() => {
      expect(testState.api.marketplaceControllerSignContract).toHaveBeenCalledWith('contract-1', {});
    });
    expect(await screen.findByText('agritech.marketplace.contract.signatureRecorded')).toBeTruthy();
  });

  it('lets the seller price a pending delivery before either party signs', async () => {
    testState.api.marketplaceControllerUpdateContractDeliveryQuote.mockResolvedValue(
      ok(contract({ deliveryPriceUzs: 150_000 })),
    );
    testState.marketplaceData = withIdentity(
      {
        ...signedInData(),
        contracts: { data: [contract({ deliveryTerms: 'seller_delivery' })], status: 'ready' },
      },
      { role: 'seller', userId: 'seller-1' },
    );

    render(<MarketplacePage contractId="contract-1" view="contract" />);

    const form = panel('.dh-inline-form');
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.contract.deliveryPrice'), {
      target: { value: '150000' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '5' } });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: 'Two trucks.' },
    });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(testState.api.marketplaceControllerUpdateContractDeliveryQuote).toHaveBeenCalledWith(
        'contract-1',
        { deliveryDays: 5, deliveryNote: 'Two trucks.', deliveryPriceUzs: 150_000 },
        {},
      );
    });
    // Consent stays blocked while the delivery price is missing from the terms.
    expect(screen.getAllByText('agritech.marketplace.contract.deliveryQuoteRequired').length).toBeGreaterThan(0);
  });

  it('reads the account dashboard and opens a contract listed on it', () => {
    const navigate = vi.fn();
    testState.marketplaceData = {
      ...signedInData(),
      contracts: { data: [contract({ status: 'active' })], status: 'ready' },
      myRequests: { data: [request()], status: 'ready' },
      samples: { data: [sample()], status: 'ready' },
    };

    render(<MarketplacePage navigate={navigate} view="account" />);

    expect(screen.getByText('agritech.marketplace.account.role.buyer')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.samples.status.pending')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Corn seed supply/u }));
    expect(navigate).toHaveBeenCalledWith('/contracts/contract-1');
  });

  it('keeps the account dashboard readable while contracts and samples are still loading', () => {
    testState.marketplaceData = {
      ...signedInData(),
      contracts: { data: [], status: 'loading' },
      samples: { data: [], status: 'loading' },
    };

    render(<MarketplacePage view="account" />);

    expect(document.querySelectorAll('.dh-skeleton-grid').length).toBe(2);
  });

  it('browses the catalog, the favourites page and the identity page as their own routes', () => {
    const navigate = vi.fn();
    testState.marketplaceData = {
      ...signedInData(),
      catalog: { data: [product, secondSeed], status: 'ready' },
      favorites: {
        data: [
          { createdAt: '2026-08-10T10:00:00.000Z', productId: secondSeed.id, tenantId: 'tenant-1', userId: 'buyer-1' },
        ],
        status: 'ready',
      },
    };

    const view = render(<MarketplacePage locationSearch="?q=wheat" navigate={navigate} view="catalog" />);
    expect(screen.getByRole('button', { name: secondSeed.name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: product.name })).toBeNull();

    view.rerender(<MarketplacePage navigate={navigate} view="favorites" />);
    expect(screen.getByRole('button', { name: secondSeed.name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: product.name })).toBeNull();

    testState.marketplaceData = withIdentity(signedInData(), { level: 'basic', status: 'pending' });
    view.rerender(<MarketplacePage navigate={navigate} view="verification" />);
    expect(screen.getAllByText('agritech.marketplace.verify.pending').length).toBeGreaterThan(0);
  });

  it('asks the grounded assistant from the site chrome', async () => {
    testState.api.marketplaceControllerAskAi.mockResolvedValue(
      ok({
        answer: 'catalog_match',
        createdAt: '2026-08-10T10:00:00.000Z',
        id: 'consultation-1',
        kind: 'generic',
        productIds: [product.id],
        question: 'What corn seed do you have?',
        tenantId: 'tenant-1',
        userId: 'buyer-1',
      }),
    );

    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.open' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.ai.placeholder'), {
      target: { value: 'What corn seed do you have?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));

    await waitFor(() => {
      expect(testState.api.marketplaceControllerAskAi).toHaveBeenCalledWith(
        { kind: 'generic', question: 'What corn seed do you have?' },
        {},
      );
    });
  });

  it('explains an expired session instead of writing through it', async () => {
    // The session probe has dropped to guest, but the lists it read before that
    // are still on screen. Every write has to say so rather than 401 quietly.
    testState.marketplaceData = {
      ...guestData(),
      contracts: { data: [contract({ status: 'completed' })], status: 'ready' },
      myRequests: { data: [request({ status: 'offering' })], status: 'ready' },
      offersByRequest: { data: { 'request-1': [offer()] }, status: 'ready' },
      requests: { data: [request({ buyerUserId: 'buyer-9', id: 'request-9' })], status: 'ready' },
    };

    const view = render(<MarketplacePage view="requests" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.choose' })[0] as HTMLElement);
    expect(screen.getByRole('status').textContent).toContain('agritech.marketplace.demo.signInRequired');
    expect(testState.api.marketplaceControllerChooseOffer).not.toHaveBeenCalled();

    testState.api.marketplaceControllerListReviews.mockResolvedValue(ok({ items: [] }));
    view.rerender(<MarketplacePage productId={product.id} view="product" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.sample' }));
    expect(testState.api.marketplaceControllerRequestSample).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('agritech.marketplace.demo.signInRequired');
    });
  });

  // The same lapsed session, on the three forms a verified account unlocks: the
  // identity record read before the session dropped still says "verified", so the
  // forms are on screen and each submit has to be stopped with an explanation.
  it('stops a review, a request and an offer that a lapsed session cannot carry', async () => {
    const staleSession = (overrides: Partial<MarketplaceData> = {}): MarketplaceData =>
      withIdentity(
        {
          ...guestData(),
          contracts: { data: [contract({ status: 'completed' })], status: 'ready' },
          requests: { data: [request({ buyerUserId: 'buyer-9', id: 'request-9' })], status: 'ready' },
          ...overrides,
        },
        {},
      );
    testState.marketplaceData = staleSession();

    const view = render(<MarketplacePage productId={product.id} view="product" />);

    const reviewForm = await waitFor(() => panel('.dh-review-form'));
    fireEvent.change(within(reviewForm).getByRole('combobox'), { target: { value: '5' } });
    fireEvent.submit(reviewForm);

    expect(testState.api.marketplaceControllerAddReview).not.toHaveBeenCalled();
    expect(panel('.dh-notice').textContent).toContain('agritech.marketplace.demo.signInRequired');

    view.rerender(<MarketplacePage view="requests" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0] as HTMLElement);
    const requestForm = panel('.dh-form');
    fireEvent.change(within(requestForm).getByLabelText('agritech.marketplace.orders.requestTitle'), {
      target: { value: 'Corn seed for autumn' },
    });
    fireEvent.change(within(requestForm).getByLabelText('agritech.marketplace.orders.product'), {
      target: { value: 'Corn seed' },
    });
    fireEvent.change(within(requestForm).getByLabelText('agritech.marketplace.orders.volume'), {
      target: { value: '40 t' },
    });
    fireEvent.change(within(requestForm).getByLabelText('agritech.marketplace.orders.region'), {
      target: { value: 'Samarqand' },
    });
    fireEvent.change(within(requestForm).getByLabelText('agritech.marketplace.orders.deadline'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.submit(requestForm);

    expect(testState.api.marketplaceControllerCreateRequest).not.toHaveBeenCalled();
    expect(panel('.dh-notice').textContent).toContain('agritech.marketplace.demo.signInRequired');

    // The stale record reads as a seller, so the feed offers the quote form.
    testState.marketplaceData = withIdentity(staleSession(), { role: 'seller', userId: 'seller-1' });
    view.rerender(<MarketplacePage view="requests" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' }));
    const offerForm = panel('.dh-inline-form');
    fireEvent.change(within(offerForm).getByLabelText('agritech.marketplace.orders.price'), {
      target: { value: '2400000' },
    });
    fireEvent.change(within(offerForm).getByLabelText('agritech.marketplace.orders.timing'), {
      target: { value: '7' },
    });
    fireEvent.submit(offerForm);

    expect(testState.api.marketplaceControllerMakeOffer).not.toHaveBeenCalled();
    expect(panel('.dh-notice').textContent).toContain('agritech.marketplace.demo.signInRequired');
  });
});
