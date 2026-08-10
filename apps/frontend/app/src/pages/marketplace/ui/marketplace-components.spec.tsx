// @requirements REQ-AGRITECH-MARKETPLACE-016
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BuyerRequestViewDto, CartViewDto, ContractViewDto, ProductViewDto } from '@app/frontend-api-client';
import { MarketplaceAi } from './marketplace-ai';
import {
  MarketplaceCart,
  MarketplaceContract,
  MarketplaceRequests,
  MarketplaceVerification,
} from './marketplace-commerce';
import { MarketplaceCatalog, MarketplaceProductDetail } from './marketplace-discovery';
import type { MarketplaceTranslate } from './marketplace-ui';

const t: MarketplaceTranslate = (key) => key;

const product = (
  id: string,
  supplierId: string,
  category: ProductViewDto['category'],
  name: string,
): ProductViewDto => ({
  category,
  createdAt: '2026-08-09T10:00:00.000Z',
  description: `${name} description`,
  id,
  images: [],
  name,
  priceUzs: 1_250_000,
  region: 'Samarqand',
  status: 'active',
  stockQuantity: 20,
  supplierId,
  supplierName: `Seller ${supplierId}`,
  unit: 't',
  updatedAt: '2026-08-09T10:00:00.000Z',
});

const seed = product('seed-1', 'seller-a', 'seed', 'Certified corn seed');
const tractor = product('equipment-1', 'seller-b', 'equipment', 'Compact tractor');
const otherInput = product('input-1', 'seller-c', 'other', 'Specialty soil input');

function installMatchMedia(initialMatches: boolean) {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const query = {
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    dispatchEvent: () => true,
    get matches() {
      return matches;
    },
    media: '',
    onchange: null,
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => query),
  });
  return {
    restore: () => {
      if (original) {
        Object.defineProperty(window, 'matchMedia', original);
      } else {
        Reflect.deleteProperty(window, 'matchMedia');
      }
    },
    setMatches: (value: boolean) => {
      matches = value;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('DehqonHub marketplace components', () => {
  it('keeps catalog branches distinct and applies real record filters', () => {
    window.history.replaceState({}, '', '/catalog?section=seeds');
    const onOpen = vi.fn();

    render(
      <MarketplaceCatalog
        favoriteIds={new Set()}
        locale="en"
        locationSearch="?section=seeds"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={onOpen}
        products={[seed, tractor, otherInput]}
        t={t}
      />,
    );

    expect(screen.getByText(seed.name)).toBeTruthy();
    expect(screen.queryByText(tractor.name)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.equipment' }));

    expect(screen.getByText(tractor.name)).toBeTruthy();
    expect(screen.queryByText(seed.name)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: tractor.name }));
    expect(onOpen).toHaveBeenCalledWith(tractor);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.produce' }));
    expect(screen.queryByText(otherInput.name)).toBeNull();
    expect(screen.getByRole('heading', { name: 'agritech.marketplace.catalog.noResults' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.all' }));
    expect(screen.getByText(otherInput.name)).toBeTruthy();
  });

  it('synchronizes catalog products when same-route query parameters change', () => {
    const view = render(
      <MarketplaceCatalog
        favoriteIds={new Set()}
        locale="en"
        locationSearch="?q=tractor"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        products={[seed, tractor]}
        t={t}
      />,
    );
    expect(screen.getByText(tractor.name)).toBeTruthy();
    expect(screen.queryByText(seed.name)).toBeNull();

    view.rerender(
      <MarketplaceCatalog
        favoriteIds={new Set()}
        locale="en"
        locationSearch="?section=seeds"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        products={[seed, tractor]}
        t={t}
      />,
    );
    expect(screen.getByText(seed.name)).toBeTruthy();
    expect(screen.queryByText(tractor.name)).toBeNull();
  });

  it('closes mobile catalog filters explicitly and when the viewport becomes desktop', () => {
    const viewport = installMatchMedia(false);
    try {
      render(
        <MarketplaceCatalog
          favoriteIds={new Set()}
          locale="en"
          locationSearch="?section=seeds"
          navigate={vi.fn()}
          onAdd={vi.fn()}
          onFavorite={vi.fn()}
          onOpen={vi.fn()}
          products={[seed]}
          t={t}
        />,
      );

      const trigger = screen.getByRole('button', { name: 'agritech.marketplace.filter.open' });
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog', { name: 'agritech.marketplace.filter.title' });
      expect(dialog.getAttribute('open')).not.toBeNull();

      fireEvent(dialog, new Event('cancel', { cancelable: true }));
      expect(dialog.getAttribute('open')).toBeNull();

      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.close' }));
      expect(dialog.getAttribute('open')).toBeNull();

      fireEvent.click(trigger);
      act(() => {
        viewport.setMatches(true);
      });
      expect(dialog.getAttribute('open')).toBeNull();
    } finally {
      viewport.restore();
    }
  });

  it('defers PDP delivery selection to checkout and distinguishes unavailable sample allowance', () => {
    const onRetry = vi.fn();
    render(
      <MarketplaceProductDetail
        canReview={false}
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReview={vi.fn()}
        onRetry={onRetry}
        onSample={vi.fn()}
        product={seed}
        reviews={{ data: [], status: 'empty' }}
        sampleUsage={{ data: { limit: 5, remaining: 5, used: 0 }, status: 'error' }}
        similar={[]}
        t={t}
      />,
    );

    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('agritech.marketplace.samples.usageUnavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.samples.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('submits an eligible buyer review from the product page', async () => {
    const onReview = vi.fn().mockResolvedValue(true);
    render(
      <MarketplaceProductDetail
        canReview
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReview={onReview}
        onRetry={vi.fn()}
        onSample={vi.fn()}
        product={seed}
        reviews={{ data: [], status: 'empty' }}
        sampleUsage={{ data: { limit: 5, remaining: 5, used: 0 }, status: 'ready' }}
        similar={[]}
        t={t}
      />,
    );

    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.rating'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.comment'), {
      target: { value: 'Reliable quality' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' }));

    expect(onReview).toHaveBeenCalledWith(seed, 4, 'Reliable quality');
    await waitFor(() => {
      expect((screen.getByLabelText('agritech.marketplace.reviews.comment') as HTMLTextAreaElement).value).toBe('');
    });
  });

  it('preserves review input when the server rejects submission', async () => {
    const onReview = vi.fn().mockResolvedValue(false);
    render(
      <MarketplaceProductDetail
        canReview
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReview={onReview}
        onRetry={vi.fn()}
        onSample={vi.fn()}
        product={seed}
        reviews={{ data: [], status: 'empty' }}
        sampleUsage={{ data: { limit: 5, remaining: 5, used: 0 }, status: 'ready' }}
        similar={[]}
        t={t}
      />,
    );

    const comment = screen.getByLabelText('agritech.marketplace.reviews.comment');
    fireEvent.change(comment, { target: { value: 'Keep this on failure' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' }));

    await waitFor(() => {
      expect(onReview).toHaveBeenCalledOnce();
    });
    expect((comment as HTMLTextAreaElement).value).toBe('Keep this on failure');
  });

  it('keeps an accessible cart page heading when the cart is empty', () => {
    render(
      <MarketplaceCart
        carts={{ data: [], status: 'empty' }}
        locale="en"
        navigate={vi.fn()}
        onCheckout={vi.fn()}
        onUpdate={vi.fn()}
        products={[]}
        t={t}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'agritech.marketplace.cart.title' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'agritech.marketplace.cart.empty' })).toBeTruthy();
  });

  it('does not invite offers on closed or expired purchase requests', () => {
    const request = (id: string, status: BuyerRequestViewDto['status']): BuyerRequestViewDto => ({
      buyerUserId: 'buyer-1',
      createdAt: '2026-08-09T10:00:00.000Z',
      id,
      region: 'Samarqand',
      status,
      tenantId: 'tenant-1',
      title: `Request ${id}`,
      updatedAt: '2026-08-09T10:00:00.000Z',
    });
    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={{ data: [], status: 'empty' }}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={{ data: [request('closed', 'closed'), request('expired', 'expired')], status: 'ready' }}
        role="seller"
        t={t}
      />,
    );

    expect(screen.queryByRole('button', { name: 'agritech.marketplace.orders.makeOffer' })).toBeNull();
  });

  it('submits the visible request deadline even before controlled state catches up', () => {
    const onCreate = vi.fn();
    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={{ data: [], status: 'empty' }}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={onCreate}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={{ data: [], status: 'empty' }}
        role="buyer"
        t={t}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0]);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.requestTitle'), {
      target: { value: 'Deadline-sensitive request' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.region'), {
      target: { value: 'Tashkent' },
    });
    const deadlineInput = screen.getByLabelText('agritech.marketplace.orders.deadline') as HTMLInputElement;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    expect(setInputValue).toBeDefined();
    setInputValue?.call(deadlineInput, '2026-09-01');
    expect(deadlineInput.value).toBe('2026-09-01');
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.publish' }));

    expect(onCreate).toHaveBeenCalledWith({
      deadline: '2026-09-01',
      region: 'Tashkent',
      title: 'Deadline-sensitive request',
    });
  });

  it('submits a seller-authored delivery quote with an offer', () => {
    const request: BuyerRequestViewDto = {
      buyerUserId: 'buyer-1',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-open',
      region: 'Samarqand',
      status: 'open',
      tenantId: 'tenant-1',
      title: 'Corn seed',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onOffer = vi.fn();
    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={{ data: [], status: 'empty' }}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={onOffer}
        onRetry={vi.fn()}
        requests={{ data: [request], status: 'ready' }}
        role="seller"
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.price'), { target: { value: '4500000' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.product.delivery'), {
      target: { value: 'seller_delivery' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.contract.deliveryPrice'), {
      target: { value: '250000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.submitOffer' }));

    expect(onOffer).toHaveBeenCalledWith(request, {
      deliveryPriceUzs: 250_000,
      deliveryTerms: 'seller_delivery',
      priceUzs: 4_500_000,
    });
  });

  it('offers an in-place retry when an owned request offer list fails', () => {
    const request: BuyerRequestViewDto = {
      buyerUserId: 'buyer-1',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-owned',
      region: 'Samarqand',
      status: 'open',
      tenantId: 'tenant-1',
      title: 'Corn seed',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onRetry = vi.fn();

    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={{ data: [request], status: 'ready' }}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'error' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={onRetry}
        requests={{ data: [], status: 'empty' }}
        role="buyer"
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.orders.unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('reviews each server-separated seller cart with explicit delivery terms', () => {
    const carts: CartViewDto[] = [
      {
        createdAt: '2026-08-09T10:00:00.000Z',
        id: 'cart-a',
        items: [{ productId: seed.id, quantity: 2 }],
        sellerId: seed.supplierId,
        status: 'open',
        tenantId: 'tenant-1',
        updatedAt: '2026-08-09T10:00:00.000Z',
        userId: 'buyer-1',
      },
      {
        createdAt: '2026-08-09T10:00:00.000Z',
        id: 'cart-b',
        items: [{ productId: tractor.id, quantity: 1 }],
        sellerId: tractor.supplierId,
        status: 'open',
        tenantId: 'tenant-1',
        updatedAt: '2026-08-09T10:00:00.000Z',
        userId: 'buyer-1',
      },
    ];
    const onCheckout = vi.fn();

    render(
      <MarketplaceCart
        carts={{ data: carts, status: 'ready' }}
        locale="en"
        navigate={vi.fn()}
        onCheckout={onCheckout}
        onUpdate={vi.fn()}
        products={[seed, tractor]}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /seller-b/u }));
    expect(screen.getByText(tractor.name)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'agritech.marketplace.product.sellerDelivery' }));
    fireEvent.click(screen.getByRole('button', { name: /agritech.marketplace.cart.reviewContract/u }));

    expect(onCheckout).toHaveBeenCalledWith(carts[1], 'seller_delivery');
  });

  it('shows honest verification provider unavailability without a placeholder submission', () => {
    render(
      <MarketplaceVerification
        navigate={vi.fn()}
        onRetry={vi.fn()}
        t={t}
        verification={{ data: null, status: 'empty' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'agritech.marketplace.verify.providerUnavailable' })).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.verify.noPlaceholderSubmission')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.verify.submit' })).toBeNull();
  });

  it('retries a failed verification identity load without reloading the browser', () => {
    const onRetry = vi.fn();

    render(
      <MarketplaceVerification
        navigate={vi.fn()}
        onRetry={onRetry}
        t={t}
        verification={{ data: null, status: 'error' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('lets only the current unsigned party record contract consent', () => {
    const contract: ContractViewDto = {
      amountUzs: 2_500_000,
      buyerUserId: 'buyer-1',
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryTerms: 'pickup',
      deliveryPriceUzs: 0,
      factoringEnabled: false,
      id: 'contract-1',
      lines: [
        {
          lineTotalUzs: 2_500_000,
          name: seed.name,
          productId: seed.id,
          quantity: 2,
          unit: seed.unit,
          unitPriceUzs: 1_250_000,
        },
      ],
      sellerUserId: 'seller-a',
      sourceId: 'cart-a',
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: seed.name,
      tenantId: 'tenant-1',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onSign = vi.fn();

    render(
      <MarketplaceContract
        contract={contract}
        currentUserId="buyer-1"
        identityStatus="ready"
        locale="en"
        navigate={vi.fn()}
        onQuote={vi.fn()}
        onRetry={vi.fn()}
        onSign={onSign}
        status="ready"
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /agritech.marketplace.contract.signOwnParty/u }));
    expect(onSign).toHaveBeenCalledWith(contract);
    expect(screen.getByText('agritech.marketplace.contract.paymentUnavailable')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.contract.factoringUnavailable')).toBeTruthy();
  });

  it('blocks consent and lets the listed seller quote pending delivery', () => {
    const contract: ContractViewDto = {
      amountUzs: 2_500_000,
      buyerUserId: 'buyer-1',
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryTerms: 'seller_delivery',
      factoringEnabled: false,
      id: 'contract-delivery',
      lines: [],
      sellerUserId: 'seller-a',
      sourceId: 'cart-a',
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: seed.name,
      tenantId: 'tenant-1',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onQuote = vi.fn();
    render(
      <MarketplaceContract
        contract={contract}
        currentUserId="seller-a"
        identityStatus="ready"
        locale="en"
        navigate={vi.fn()}
        onQuote={onQuote}
        onRetry={vi.fn()}
        onSign={vi.fn()}
        status="ready"
        t={t}
      />,
    );

    expect(screen.queryByRole('button', { name: /agritech.marketplace.contract.signOwnParty/u })).toBeNull();
    fireEvent.change(screen.getByLabelText('agritech.marketplace.contract.deliveryPrice'), {
      target: { value: '250000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.contract.saveDeliveryQuote' }));
    expect(onQuote).toHaveBeenCalledWith(contract, { deliveryPriceUzs: 250_000 });
  });

  it('keeps contract consent blocked and retries when party identity cannot load', () => {
    const contract: ContractViewDto = {
      amountUzs: 2_500_000,
      buyerUserId: 'buyer-1',
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryPriceUzs: 0,
      deliveryTerms: 'pickup',
      factoringEnabled: false,
      id: 'contract-identity-error',
      lines: [],
      sellerUserId: 'seller-a',
      sourceId: 'cart-a',
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: seed.name,
      tenantId: 'tenant-1',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onRetry = vi.fn();

    render(
      <MarketplaceContract
        contract={contract}
        currentUserId={undefined}
        identityStatus="error"
        locale="en"
        navigate={vi.fn()}
        onQuote={vi.fn()}
        onRetry={onRetry}
        onSign={vi.fn()}
        status="ready"
        t={t}
      />,
    );

    expect(screen.queryByRole('button', { name: /agritech.marketplace.contract.signOwnParty/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps grounded AI informational and returns focus after closing', async () => {
    const onAsk = vi.fn().mockResolvedValue({
      answer: 'Unlocalized server explanation',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'ai-1',
      kind: 'recommendation',
      productIds: [seed.id],
      question: 'seed',
      tenantId: 'tenant-1',
      userId: 'buyer-1',
    });
    const onOpenProduct = vi.fn();

    render(<MarketplaceAi locale="en" onAsk={onAsk} onOpenProduct={onOpenProduct} products={[seed]} t={t} />);

    const launcher = screen.getByRole('button', { name: 'agritech.marketplace.ai.open' });
    fireEvent.click(launcher);
    const question = screen.getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' });
    expect(document.activeElement).toBe(question);
    fireEvent.change(question, { target: { value: 'seed' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));

    expect(await screen.findByText('agritech.marketplace.ai.result.recommendation')).toBeTruthy();
    expect(screen.queryByText('Unlocalized server explanation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(seed.name, 'u') }));
    expect(onOpenProduct).toHaveBeenCalledWith(seed);

    fireEvent.keyDown(globalThis, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(launcher);
    });
  });

  it('contains focus and exposes modal semantics in the full-screen mobile AI view', () => {
    const viewport = installMatchMedia(true);
    try {
      render(<MarketplaceAi locale="en" onAsk={vi.fn()} onOpenProduct={vi.fn()} products={[seed]} t={t} />);

      fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.open' }));
      const dialog = screen.getByRole('dialog', { name: 'agritech.marketplace.ai.title' });
      const input = within(dialog).getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' });
      const closeButton = within(dialog).getByRole('button', { name: 'agritech.marketplace.ai.close' });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(document.activeElement).toBe(input);

      fireEvent.keyDown(globalThis, { key: 'Tab' });
      expect(document.activeElement).toBe(closeButton);
      fireEvent.keyDown(globalThis, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(input);
    } finally {
      viewport.restore();
    }
  });

  it('renders grounded AI results through the current locale translator', async () => {
    const onAsk = vi.fn().mockResolvedValue({
      answer: 'Unlocalized server explanation',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'ai-locale',
      kind: 'recommendation',
      productIds: [seed.id],
      question: 'seed',
      tenantId: 'tenant-1',
      userId: 'buyer-1',
    });
    const english: MarketplaceTranslate = (key) => `en:${key}`;
    const russian: MarketplaceTranslate = (key) => `ru:${key}`;
    const view = render(
      <MarketplaceAi locale="en" onAsk={onAsk} onOpenProduct={vi.fn()} products={[seed]} t={english} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'en:agritech.marketplace.ai.open' }));
    const question = screen.getByRole('textbox', { name: 'en:agritech.marketplace.ai.placeholder' });
    fireEvent.change(question, { target: { value: 'seed' } });
    fireEvent.click(screen.getByRole('button', { name: 'en:agritech.marketplace.ai.send' }));
    expect(await screen.findByText('en:agritech.marketplace.ai.result.recommendation')).toBeTruthy();

    view.rerender(<MarketplaceAi locale="ru" onAsk={onAsk} onOpenProduct={vi.fn()} products={[seed]} t={russian} />);
    expect(screen.getByText('ru:agritech.marketplace.ai.result.recommendation')).toBeTruthy();
    expect(screen.queryByText('en:agritech.marketplace.ai.result.recommendation')).toBeNull();
  });
});
