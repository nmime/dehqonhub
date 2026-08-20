// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-WEB-006
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartViewDto, MarketplacePublicListingDto, VerificationViewDto } from '@app/frontend-api-client';
import type { MarketplaceData } from '../model/use-marketplace-data';
import { MarketplacePage } from './marketplace-page';

const testState = vi.hoisted(() => {
  const listSuggestions = vi.fn();
  /*
   * The header is what this suite is about, so every other read the page fires
   * on mount answers with the same rejected promise: an unavailable side read
   * renders its own recovery state and never blocks the shell.
   */
  const unavailable = () => Promise.reject(new Error('unused in this suite'));
  return {
    api: new Proxy({ marketplacePublicControllerListSuggestions: listSuggestions } as Record<string, unknown>, {
      get: (target, key: string) => target[key] ?? unavailable,
    }),
    listSuggestions,
    marketplaceData: undefined as MarketplaceData | undefined,
    refresh: vi.fn(),
    requestOptions: {},
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
  LanguageSwitcher: () => <button type="button">language</button>,
  ThemeSwitcher: () => null,
}));

/**
 * A media query list whose `matches` the test owns, so the same page can be
 * rendered above and below the compact breakpoint without a real viewport.
 */
function installViewport(compact: boolean) {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const listeners = new Set<() => void>();
  const query = {
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    dispatchEvent: () => true,
    matches: compact,
    media: '',
    onchange: null,
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => query) });
  return () => {
    if (original) {
      Object.defineProperty(window, 'matchMedia', original);
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  };
}

const listing: MarketplacePublicListingDto = {
  category: 'seed',
  description: 'Certified corn seed',
  id: 'seed-1',
  images: [],
  kind: 'product',
  name: 'Corn seed',
  priceUzs: 1_250_000,
  promoted: false,
  provenance: 'live',
  rating: { average: 4.6, count: 12 },
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-1',
  supplierName: 'Seed cooperative',
  transactional: true,
  unit: 't',
} as unknown as MarketplacePublicListingDto;

const cart: CartViewDto = {
  createdAt: '2026-08-09T10:00:00.000Z',
  id: 'cart-1',
  items: [
    { listingPublicationId: listing.id, quantity: 2, sourceKind: 'product' },
    { listingPublicationId: 'other', quantity: 1, sourceKind: 'product' },
  ],
  seller: { displayName: 'Seed cooperative', region: 'Samarqand' },
  status: 'open',
  updatedAt: '2026-08-09T10:00:00.000Z',
} as unknown as CartViewDto;

const verification = (role: 'buyer' | 'seller'): VerificationViewDto =>
  ({
    createdAt: '2026-08-09T10:00:00.000Z',
    documents: [],
    id: 'verification-1',
    identityAssurance: 'mock',
    level: 'verified',
    oneIdLinked: true,
    providerMode: 'mock',
    revision: 1,
    role,
    simulation: true,
    status: 'verified',
    step: 'complete',
    updatedAt: '2026-08-09T10:00:00.000Z',
  }) as unknown as VerificationViewDto;

const emptyList = { data: [], status: 'empty' as const };

const marketplaceData = (role: 'buyer' | 'seller'): MarketplaceData =>
  ({
    aiConsultations: emptyList,
    auth: 'signed-in',
    carts: { data: [cart], status: 'ready' },
    catalog: { data: [listing], status: 'ready' },
    contracts: emptyList,
    dashboard: { data: null, status: 'empty' },
    favorites: { data: [{ listing }], status: 'ready' },
    myRequests: emptyList,
    notifications: emptyList,
    offersByRequest: { data: {}, status: 'empty' },
    ownedListingPublications: emptyList,
    ownedRequestPublications: emptyList,
    partners: emptyList,
    produceListings: emptyList,
    promotionPlans: emptyList,
    promotions: emptyList,
    providerReadiness: { data: {}, status: 'ready' },
    refresh: testState.refresh,
    requests: emptyList,
    samples: emptyList,
    sampleUsage: { data: null, status: 'empty' },
    selectedListing: { data: null, status: 'idle' },
    seller: { data: null, status: 'idle' },
    sellerCatalog: emptyList,
    supplierProducts: emptyList,
    verification: { data: verification(role), status: 'ready' },
  }) as unknown as MarketplaceData;

const burger = () => document.querySelector('.dh-burger') as HTMLButtonElement;
const drawer = () => screen.getByRole('dialog', { name: 'agritech.marketplace.menu.title' });
const closeControl = () => within(drawer()).getByRole('button', { name: 'agritech.marketplace.menu.close' });

describe('marketplace mobile header drawer', () => {
  let restoreViewport = () => undefined as void;

  beforeEach(() => {
    testState.refresh.mockReset();
    testState.listSuggestions.mockResolvedValue({ data: { data: { items: [] } }, response: new Response() });
    testState.marketplaceData = marketplaceData('seller');
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    restoreViewport();
    cleanup();
    document.body.style.overflow = '';
  });

  it('leaves the narrow header carrying only the brand lockup and the burger', () => {
    restoreViewport = installViewport(true);
    render(<MarketplacePage navigate={vi.fn()} />);

    const header = document.querySelector('.dh-header');
    expect(header).toBeTruthy();
    const headerRow = document.querySelector('.dh-header__main');
    expect(headerRow?.children).toHaveLength(2);
    expect(headerRow?.firstElementChild?.className).toContain('dh-brand');
    expect(headerRow?.lastElementChild?.className).toContain('dh-burger');
    expect(within(header as HTMLElement).queryByRole('searchbox')).toBeNull();
    expect(document.querySelector('.dh-header__nav')).toBeNull();
    expect(document.querySelector('.dh-header__categories')).toBeNull();
    expect(document.querySelector('.dh-header__preferences')).toBeNull();
    expect(document.querySelector('.dh-header__mobile-preferences')).toBeNull();
    expect(document.querySelector('.dh-mobile-nav')).toBeNull();
    expect(burger()).toHaveProperty('ariaExpanded', 'false');
  });

  it('keeps the wide header exactly as it is above the breakpoint', () => {
    restoreViewport = installViewport(false);
    render(<MarketplacePage navigate={vi.fn()} />);

    expect(document.querySelector('.dh-burger')).toBeNull();
    expect(document.querySelector('.dh-header__nav')).toBeTruthy();
    expect(document.querySelector('.dh-header__categories')).toBeTruthy();
    expect(document.querySelector('.dh-header__preferences')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'agritech.marketplace.search' })).toHaveProperty('id', 'dh-search');
  });

  it('opens from the burger, names itself, and carries the search and every navigation entry', () => {
    restoreViewport = installViewport(true);
    render(<MarketplacePage navigate={vi.fn()} />);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(burger());

    const panel = drawer();
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(closeControl()).toBeTruthy();
    expect(within(panel).getByRole('searchbox', { name: 'agritech.marketplace.search' })).toHaveProperty(
      'id',
      'dh-drawer-search',
    );
    for (const name of [
      'agritech.marketplace.home',
      'agritech.marketplace.catalog',
      'agritech.marketplace.newListing.title',
      'agritech.marketplace.deals.nav',
      'agritech.marketplace.orders',
      'agritech.marketplace.favorites',
      'agritech.marketplace.cart',
      'agritech.marketplace.account',
    ]) {
      expect(within(panel).getByText(name)).toBeTruthy();
    }
    // The section chips and the language control travel with the rest.
    expect(within(panel).getByText('agritech.marketplace.section.produce')).toBeTruthy();
    expect(within(panel).getByText('language')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('shows each entry its own counter', () => {
    restoreViewport = installViewport(true);
    render(<MarketplacePage navigate={vi.fn()} />);
    fireEvent.click(burger());

    const cartEntry = within(drawer()).getByText('agritech.marketplace.cart').closest('button');
    expect(cartEntry?.querySelector('em')?.textContent).toBe('2');
    const favoriteEntry = within(drawer()).getByText('agritech.marketplace.favorites').closest('button');
    expect(favoriteEntry?.querySelector('em')?.textContent).toBe('1');
  });

  it('offers the create-listing entry to a seller and to no buyer', () => {
    restoreViewport = installViewport(true);
    const view = render(<MarketplacePage navigate={vi.fn()} />);
    fireEvent.click(burger());
    expect(within(drawer()).queryByText('agritech.marketplace.newListing.title')).toBeTruthy();

    fireEvent.click(closeControl());
    testState.marketplaceData = marketplaceData('buyer');
    view.rerender(<MarketplacePage navigate={vi.fn()} />);
    fireEvent.click(burger());
    expect(within(drawer()).queryByText('agritech.marketplace.newListing.title')).toBeNull();
    expect(within(drawer()).queryByText('agritech.marketplace.orders')).toBeTruthy();
  });

  it('closes from the burger, from Escape and from a tap outside, returning focus each time', async () => {
    restoreViewport = installViewport(true);
    render(<MarketplacePage navigate={vi.fn()} />);

    fireEvent.click(burger());
    expect(document.activeElement).toBe(closeControl());
    fireEvent.click(closeControl());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(burger());
    });
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(burger());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(burger());
    });

    fireEvent.click(burger());
    const backdrop = document.querySelector('.dh-drawer-backdrop');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(burger());
    });
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps Tab inside the open panel', () => {
    restoreViewport = installViewport(true);
    render(<MarketplacePage navigate={vi.fn()} />);
    fireEvent.click(burger());

    const focusable = [...drawer().querySelectorAll<HTMLElement>('button, input')];
    const first = focusable[0];
    const last = focusable.at(-1);
    last?.focus();
    const forward = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' });
    expect(globalThis.dispatchEvent(forward)).toBe(false);
    expect(document.activeElement).toBe(first);
    const backward = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab', shiftKey: true });
    expect(globalThis.dispatchEvent(backward)).toBe(false);
    expect(document.activeElement).toBe(last);
  });

  it('navigates from an entry, closes the panel, and unlocks the page', async () => {
    restoreViewport = installViewport(true);
    const navigate = vi.fn();
    render(<MarketplacePage navigate={navigate} />);
    fireEvent.click(burger());

    fireEvent.click(within(drawer()).getByText('agritech.marketplace.cart').closest('button') as HTMLElement);
    expect(navigate).toHaveBeenCalledWith('/cart');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => {
      expect(document.activeElement).toBe(burger());
    });

    fireEvent.click(burger());
    fireEvent.click(
      within(drawer()).getByText('agritech.marketplace.section.equipment').closest('button') as HTMLElement,
    );
    expect(navigate).toHaveBeenCalledWith('/catalog?section=equipment');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('submits the drawer search the same way the header search submits', () => {
    restoreViewport = installViewport(true);
    const navigate = vi.fn();
    render(<MarketplacePage navigate={navigate} />);
    fireEvent.click(burger());

    const field = within(drawer()).getByRole('searchbox', { name: 'agritech.marketplace.search' });
    fireEvent.change(field, { target: { value: '  corn seed  ' } });
    fireEvent.submit(within(drawer()).getByRole('search'));
    expect(navigate).toHaveBeenCalledWith('/catalog?q=corn%20seed');
  });
});
