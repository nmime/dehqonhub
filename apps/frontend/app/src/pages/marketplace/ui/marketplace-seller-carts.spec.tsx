// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartViewDto } from '@app/frontend-api-client';
import { activeSellerCartStorageKey } from '../model/use-active-seller-cart';
import { MarketplaceCart, groupCartsBySeller } from './marketplace-commerce';
import type { MarketplaceListing, MarketplaceTranslate } from './marketplace-ui';

/** Renders the key plus its interpolations so per-seller labels stay distinguishable. */
const t: MarketplaceTranslate = (key, params) =>
  params
    ? `${key}:${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')}`
    : key;

const listing = (overrides: Partial<MarketplaceListing> & Pick<MarketplaceListing, 'id'>): MarketplaceListing => ({
  category: 'seed',
  description: 'Certified seed',
  images: [],
  kind: 'product',
  name: `Listing ${overrides.id}`,
  priceUzs: 1_000_000,
  promoted: false,
  provenance: 'live',
  publishedAt: '2026-08-01T00:00:00.000Z',
  rating: { average: 4.6, count: 12 },
  region: 'Samarqand',
  sampleAvailable: false,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-a',
  supplierName: 'Zarafshon Agro',
  transactional: true,
  unit: 't',
  ...overrides,
});

const cart = (id: string, displayName: string, items: CartViewDto['items'], region = 'Samarqand'): CartViewDto => ({
  createdAt: '2026-08-09T10:00:00.000Z',
  id,
  items,
  seller: { displayName, region },
  status: 'open',
  updatedAt: '2026-08-09T10:00:00.000Z',
});

const cornSeed = listing({ id: 'listing-corn', name: 'Certified corn seed', supplierVerified: true });
const wheatSeed = listing({
  id: 'listing-wheat',
  name: 'Certified wheat seed',
  priceUzs: 500_000,
  supplierVerified: true,
});
const tractor = listing({
  category: 'equipment',
  id: 'listing-tractor',
  name: 'Compact tractor',
  priceUzs: 2_000_000,
  section: 'equipment',
  supplierId: 'seller-b',
  supplierName: 'AgroSem Trade',
});
const products = [cornSeed, wheatSeed, tractor];

const sellerA = cart('cart-a', 'Zarafshon Agro', [
  { listingPublicationId: cornSeed.id, quantity: 2, sourceKind: 'product' },
  { listingPublicationId: wheatSeed.id, quantity: 1, sourceKind: 'product' },
]);
const sellerB = cart(
  'cart-b',
  'AgroSem Trade',
  [{ listingPublicationId: tractor.id, quantity: 3, sourceKind: 'product' }],
  'Jizzax',
);

type CartComponentProps = Parameters<typeof MarketplaceCart>[0];

const renderCart = (
  carts: CartViewDto[],
  overrides: Partial<CartComponentProps> = {},
): { onCheckout: ReturnType<typeof vi.fn>; onUpdate: ReturnType<typeof vi.fn> } => {
  const onCheckout = vi.fn();
  const onUpdate = vi.fn();
  const props: CartComponentProps = {
    carts: { data: carts, status: carts.length > 0 ? 'ready' : 'empty' },
    locale: 'en',
    navigate: vi.fn(),
    onCheckout,
    onUpdate,
    products,
    t,
    ...overrides,
  };
  render(<MarketplaceCart {...props} />);
  return { onCheckout, onUpdate };
};

const activePanel = (): HTMLElement => screen.getByRole('tabpanel');
const tabFor = (seller: RegExp): HTMLElement => screen.getByRole('tab', { name: seller });
const zarafshon = /Zarafshon Agro/u;
const agroSem = /AgroSem Trade/u;

describe('per-seller marketplace carts', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('groups the seller-separated carts into sub-carts with their own count and total', () => {
    const groups = groupCartsBySeller([sellerA, sellerB], products);

    expect(groups.map((group) => group.sellerName)).toEqual(['Zarafshon Agro', 'AgroSem Trade']);
    expect(groups[0]?.itemCount).toBe(3);
    expect(groups[0]?.total).toBe(2_500_000);
    expect(groups[0]?.verified).toBe(true);
    expect(groups[1]?.itemCount).toBe(3);
    expect(groups[1]?.total).toBe(6_000_000);
    expect(groups[1]?.verified).toBe(false);
    expect(groups[1]?.region).toBe('Jizzax');
  });

  it('flags a line whose listing became unavailable and leaves it out of that cart total', () => {
    const withdrawn = cart('cart-c', 'Fergana Seeds', [
      { listingPublicationId: cornSeed.id, quantity: 1, sourceKind: 'product' },
      { listingPublicationId: 'listing-withdrawn', quantity: 4, sourceKind: 'product' },
    ]);
    const soldOut = listing({ id: 'listing-withdrawn', status: 'out_of_stock' });

    expect(groupCartsBySeller([withdrawn], [cornSeed, soldOut])[0]).toMatchObject({
      itemCount: 5,
      total: 1_000_000,
    });
    expect(groupCartsBySeller([withdrawn], [cornSeed, soldOut])[0]?.lines.map((line) => line.unavailable)).toEqual([
      false,
      true,
    ]);

    renderCart([withdrawn]);
    expect(screen.getAllByText('agritech.marketplace.cart.lineUnavailable')).toHaveLength(1);
    expect(screen.getByText('agritech.marketplace.product.unavailable')).toBeTruthy();
  });

  it('offers one switcher holding every sub-cart and a body for the active cart only', () => {
    renderCart([sellerA, sellerB]);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(activePanel().getAttribute('aria-labelledby')).toBe('dh-cart-tab-cart-a');
    expect(within(activePanel()).getByText('Certified corn seed')).toBeTruthy();
    expect(screen.queryByText('Compact tractor')).toBeNull();

    // The inactive cart carries its own seller, region, count and total inside its tab.
    const inactive = tabFor(agroSem);
    expect(inactive.textContent).toContain('AgroSem Trade');
    expect(inactive.textContent).toContain('Jizzax');
    expect(inactive.textContent).toContain('agritech.marketplace.cart.itemCountValue:count=3');
    expect(within(inactive).getByText('UZS 6,000,000')).toBeTruthy();

    // That tab is the only place the inactive cart is offered: no second summary row
    // repeats the same seller, count and total beside its own swap button.
    expect(globalThis.document.querySelectorAll('.dh-cart-group')).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: agroSem })).toHaveLength(0);
    // And no label sits beside a value that already spells the same term out.
    expect(screen.queryByText('agritech.marketplace.cart.itemCount')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.cart.cartTotal')).toBeNull();
  });

  it('swaps the active cart in both directions from the one switcher', () => {
    renderCart([sellerA, sellerB]);

    fireEvent.click(tabFor(agroSem));
    expect(within(activePanel()).getByText('Compact tractor')).toBeTruthy();
    expect(screen.queryByText('Certified corn seed')).toBeNull();
    const announcement = screen.getByText('agritech.marketplace.cart.activeCartAnnouncement:seller=AgroSem Trade');
    expect(announcement.getAttribute('role')).toBe('status');
    expect(announcement.getAttribute('aria-live')).toBe('polite');
    expect(announcement.className).toContain('dh-sr-only');

    fireEvent.click(tabFor(zarafshon));
    expect(within(activePanel()).getByText('Certified corn seed')).toBeTruthy();
    expect(screen.queryByText('Compact tractor')).toBeNull();
    expect(screen.getByText('agritech.marketplace.cart.activeCartAnnouncement:seller=Zarafshon Agro')).toBeTruthy();
  });

  it('moves the active cart with the keyboard through the tablist', () => {
    renderCart([sellerA, sellerB]);

    expect(tabFor(zarafshon).getAttribute('tabindex')).toBe('0');
    expect(tabFor(agroSem).getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(tabFor(zarafshon), { key: 'ArrowRight' });
    expect(tabFor(agroSem).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabFor(agroSem), { key: 'Home' });
    expect(tabFor(zarafshon).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabFor(zarafshon), { key: 'End' });
    expect(tabFor(agroSem).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabFor(agroSem), { key: 'ArrowLeft' });
    expect(tabFor(zarafshon).getAttribute('aria-selected')).toBe('true');

    // A key the pattern does not own leaves the selection untouched.
    fireEvent.keyDown(tabFor(zarafshon), { key: 'Enter' });
    expect(tabFor(zarafshon).getAttribute('aria-selected')).toBe('true');
  });

  it('persists the active cart in versioned storage and restores it on the next visit', () => {
    renderCart([sellerA, sellerB]);
    fireEvent.click(tabFor(agroSem));

    expect(JSON.parse(globalThis.localStorage.getItem(activeSellerCartStorageKey) ?? '{}')).toEqual({
      cartId: 'cart-b',
      version: 1,
    });

    cleanup();
    renderCart([sellerA, sellerB]);
    expect(within(activePanel()).getByText('Compact tractor')).toBeTruthy();
  });

  it('falls back to the first cart when the stored selection is malformed or from another version', () => {
    globalThis.localStorage.setItem(activeSellerCartStorageKey, '{broken');
    renderCart([sellerA, sellerB]);
    expect(within(activePanel()).getByText('Certified corn seed')).toBeTruthy();

    cleanup();
    globalThis.localStorage.setItem(activeSellerCartStorageKey, JSON.stringify({ cartId: 'cart-b', version: 2 }));
    renderCart([sellerA, sellerB]);
    expect(within(activePanel()).getByText('Certified corn seed')).toBeTruthy();
  });

  it('activates a remaining cart deterministically after the active cart loses its last line', () => {
    renderCart([sellerA, sellerB]);
    fireEvent.click(tabFor(agroSem));
    expect(within(activePanel()).getByText('Compact tractor')).toBeTruthy();

    cleanup();
    renderCart([sellerA]);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: zarafshon })).toBeTruthy();
    expect(JSON.parse(globalThis.localStorage.getItem(activeSellerCartStorageKey) ?? '{}')).toEqual({
      cartId: 'cart-a',
      version: 1,
    });
  });

  it('clears the stored selection instead of leaving it dangling on an empty cart', () => {
    renderCart([sellerA]);
    expect(globalThis.localStorage.getItem(activeSellerCartStorageKey)).not.toBeNull();

    cleanup();
    renderCart([]);
    expect(screen.getByRole('heading', { name: 'agritech.marketplace.cart.empty' })).toBeTruthy();
    expect(globalThis.localStorage.getItem(activeSellerCartStorageKey)).toBeNull();
  });

  it('drops the switcher for a single seller but still labels the cart with that seller', () => {
    renderCart([sellerB]);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.queryByText('agritech.marketplace.cart.switcherHint')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: agroSem })).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.cart.oneSeller')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.cart.activeCart')).toBeTruthy();
    // The line total and this cart's own total, both inside the seller's cart.
    expect(screen.getAllByText('UZS 6,000,000')).toHaveLength(2);
  });

  it('updates only the active sub-cart when a quantity changes', () => {
    const { onUpdate } = renderCart([sellerA, sellerB]);
    fireEvent.click(tabFor(agroSem));

    fireEvent.click(within(activePanel()).getByRole('button', { name: 'agritech.marketplace.cart.increase' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('cart-b', tractor.id, 4);

    fireEvent.click(within(activePanel()).getByRole('button', { name: 'agritech.marketplace.cart.decrease' }));
    expect(onUpdate).toHaveBeenLastCalledWith('cart-b', tractor.id, 2);
  });

  it('checks out only the active cart, never a mixed-seller set', () => {
    const { onCheckout } = renderCart([sellerA, sellerB]);
    fireEvent.click(tabFor(agroSem));
    fireEvent.click(within(activePanel()).getByRole('radio', { name: 'agritech.marketplace.product.pickup' }));
    fireEvent.click(within(activePanel()).getByRole('button', { name: /agritech.marketplace.cart.reviewContract/u }));

    expect(onCheckout).toHaveBeenCalledTimes(1);
    expect(onCheckout).toHaveBeenCalledWith(sellerB, 'pickup');
    expect(sellerB.items.map((item) => item.listingPublicationId)).toEqual([tractor.id]);
  });

  it('keeps the loading, error and local-preview states of the cart route', () => {
    renderCart([], { carts: { data: [], status: 'loading' } });
    expect(screen.getByRole('heading', { level: 1, name: 'agritech.marketplace.cart.title' })).toBeTruthy();

    cleanup();
    renderCart([], { carts: { data: [], status: 'error' } });
    expect(screen.getByRole('heading', { name: 'agritech.marketplace.cart.unavailable' })).toBeTruthy();

    cleanup();
    renderCart([sellerB], {
      canCheckout: false,
      checkoutActionLabel: 'Sign in',
      onCheckoutAction: vi.fn(),
      pendingAction: 'checkout:cart-b',
      previewCartIds: new Set(['cart-b']),
    });
    // No hint sentence was supplied, so the generic preview sentence is the fallback.
    expect(screen.getByText('agritech.marketplace.cart.previewHint')).toBeTruthy();
    // The control carries the named step instead of the hardcoded sign-in wording.
    expect(screen.queryByText('agritech.marketplace.cart.previewCheckout')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(2);
  });
});

/**
 * The checkout control is the last place a blocked buyer looks, so it must name the
 * barrier the page actually found. A verified seller reading "continue to sign in"
 * and landing on verification was the reported defect: one control, two different
 * lies. Every state below asserts the wording, the entry point and whether the
 * control may still be pressed.
 */
describe('the cart checkout control names the barrier the page found', () => {
  const previewCartIds = new Set([sellerB.id]);

  const checkoutControl = (): HTMLButtonElement => {
    const control = document.querySelector<HTMLButtonElement>('.dh-cart-summary .dh-button--primary');
    if (!control) {
      throw new Error('The cart summary must render a checkout control.');
    }
    return control;
  };

  const barriers = [
    {
      // The session is still being read: no step can be named or offered yet.
      actionLabel: undefined,
      hint: 'agritech.marketplace.access.checking',
      state: 'the session is still being read',
    },
    { actionLabel: 'Sign in', hint: 'agritech.marketplace.access.signIn', state: 'nobody is signed in' },
    {
      actionLabel: 'Open verification',
      hint: 'agritech.marketplace.access.verify',
      state: 'verification is not complete',
    },
    {
      actionLabel: 'Open verification',
      hint: 'agritech.marketplace.access.buyerRole',
      state: 'the verified role cannot buy',
    },
    {
      actionLabel: 'Open organization profile',
      hint: 'agritech.marketplace.access.organization',
      state: 'no approved buyer organization exists',
    },
  ] as const;

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  for (const barrier of barriers) {
    it(`states and offers the one step when ${barrier.state}`, () => {
      const onCheckoutAction = vi.fn();
      const { onCheckout } = renderCart([sellerB], {
        canCheckout: false,
        ...(barrier.actionLabel ? { checkoutActionLabel: barrier.actionLabel } : {}),
        checkoutHint: barrier.hint,
        onCheckoutAction,
        previewCartIds,
      });

      const control = checkoutControl();
      // Never the hardcoded sign-in wording, and never a contract review that
      // cannot happen: the control reads back the step the page named.
      expect(control.textContent).toContain(barrier.actionLabel ?? 'agritech.marketplace.cart.previewCheckout');
      expect(control.textContent).not.toContain('agritech.marketplace.cart.reviewContract');
      expect(screen.getByText(barrier.hint)).toBeTruthy();
      expect(screen.queryByText('agritech.marketplace.cart.previewHint')).toBeNull();
      expect(control.getAttribute('aria-describedby')).toBe('marketplace-cart-checkout-hint');
      // The preview control stays pressable so the boundary action can run.
      expect(control.disabled).toBe(false);

      fireEvent.click(control);
      expect(onCheckout).toHaveBeenCalledTimes(1);

      const inlineEntries = document.querySelectorAll<HTMLButtonElement>('.dh-state-inline .dh-text-button');
      expect(inlineEntries).toHaveLength(barrier.actionLabel ? 1 : 0);
      const inlineEntry = inlineEntries[0];
      if (barrier.actionLabel && inlineEntry) {
        expect(inlineEntry.textContent).toBe(barrier.actionLabel);
        fireEvent.click(inlineEntry);
        expect(onCheckoutAction).toHaveBeenCalledTimes(1);
      }
    });
  }

  it('offers contract review, not a step, once nothing is missing', () => {
    renderCart([sellerB], { canCheckout: true, previewCartIds });

    const control = checkoutControl();
    expect(control.textContent).toContain('agritech.marketplace.cart.reviewContract');
    expect(control.disabled).toBe(false);
  });

  it('disables a server cart it cannot check out and states why', () => {
    const onCheckoutAction = vi.fn();
    const { onCheckout } = renderCart([sellerB], {
      canCheckout: false,
      checkoutActionLabel: 'Open verification',
      checkoutHint: 'agritech.marketplace.access.buyerRole',
      onCheckoutAction,
    });

    const control = checkoutControl();
    expect(control.disabled).toBe(true);
    expect(control.textContent).toContain('agritech.marketplace.cart.reviewContract');
    expect(screen.getByText('agritech.marketplace.access.buyerRole')).toBeTruthy();
    fireEvent.click(control);
    expect(onCheckout).not.toHaveBeenCalled();
  });
});
