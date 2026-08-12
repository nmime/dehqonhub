// @requirements REQ-AGRITECH-MARKETPLACE-016
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractViewDto,
  ProductViewDto,
  VerificationViewDto,
} from '@app/frontend-api-client';
import { demoAccounts } from '../model/demo-accounts';
import { MarketplaceAi } from './marketplace-ai';
import {
  MarketplaceAccount,
  MarketplaceCart,
  MarketplaceContract,
  MarketplaceRequests,
  MarketplaceVerification,
} from './marketplace-commerce';
import { MarketplaceDemoBanner } from './marketplace-demo-banner';
import {
  MarketplaceCatalog,
  MarketplaceFavorites,
  MarketplaceHome,
  MarketplaceProductDetail,
} from './marketplace-discovery';
import { ProductMedia } from './marketplace-product-card';
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

const region = (product: ProductViewDto, name: string): ProductViewDto => ({ ...product, region: name });

const panel = (selector: string): HTMLElement => {
  const found = document.querySelector(selector);

  if (!(found instanceof HTMLElement)) {
    throw new Error(`The ${selector} region is missing from the page.`);
  }

  return found;
};

const discoveryActions = () => ({
  favoriteIds: new Set<string>(),
  locale: 'en' as const,
  onAdd: vi.fn(),
  onFavorite: vi.fn(),
  onOpen: vi.fn(),
  t,
});

const identity = (overrides: Partial<VerificationViewDto> = {}): VerificationViewDto => ({
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
  ...overrides,
});

const signedContract = (overrides: Partial<ContractViewDto> = {}): ContractViewDto => ({
  amountUzs: 2_500_000,
  buyerUserId: 'buyer-1',
  createdAt: '2026-08-09T10:00:00.000Z',
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  id: 'contract-1',
  lines: [],
  sellerUserId: 'seller-a',
  status: 'draft',
  subject: seed.name,
  tenantId: 'tenant-1',
  updatedAt: '2026-08-09T10:00:00.000Z',
  ...overrides,
});

const ownedRequest = (overrides: Partial<BuyerRequestViewDto> = {}): BuyerRequestViewDto => ({
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

const emptyResource = { data: [], status: 'empty' as const };

const basket = (items: CartViewDto['items'], sellerId = seed.supplierId): CartViewDto => ({
  createdAt: '2026-08-09T10:00:00.000Z',
  id: 'cart-a',
  items,
  sellerId,
  status: 'open',
  tenantId: 'tenant-1',
  updatedAt: '2026-08-09T10:00:00.000Z',
  userId: 'buyer-1',
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

    // Produce is where the `other` category lands: the section mapping is total,
    // so no category is left without a browsable branch.
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.produce' }));
    expect(screen.getByText(otherInput.name)).toBeTruthy();
    expect(screen.queryByText(tractor.name)).toBeNull();

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

  it('copies a review login and sends a guest to sign in from where they were', async () => {
    window.history.replaceState({}, '', '/catalog?section=seeds');
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const navigate = vi.fn();
    const account = demoAccounts[0];

    if (!account) {
      throw new Error('Missing demo account fixture.');
    }

    render(<MarketplaceDemoBanner navigate={navigate} onRetry={vi.fn()} reason="guest" t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.demo.signIn' }));
    expect(navigate).toHaveBeenCalledWith(`/auth?returnUrl=${encodeURIComponent('/catalog?section=seeds')}`);

    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.demo.copy' })[0] as HTMLElement);

    expect(writeText).toHaveBeenCalledWith(`${account.email} / ${account.password}`);
    expect(await screen.findByRole('button', { name: 'agritech.marketplace.demo.copied' })).toBeTruthy();
  });

  // The banner is typed against a browser, but it also renders where there is no
  // `location` to read the current page from, and sign-in still has to lead home.
  it('sends sign-in to the site root when there is no page to return to', () => {
    const navigate = vi.fn();
    vi.stubGlobal('location', undefined);

    render(<MarketplaceDemoBanner navigate={navigate} onRetry={vi.fn()} reason="guest" t={t} />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.demo.signIn' }));

    expect(navigate).toHaveBeenCalledWith(`/auth?returnUrl=${encodeURIComponent('/')}`);
  });

  it('leaves the credentials on screen when the browser has no clipboard', () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

    render(<MarketplaceDemoBanner navigate={vi.fn()} onRetry={vi.fn()} reason="demo-catalog" t={t} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.demo.copy' })[0] as HTMLElement);

    expect(screen.queryByRole('button', { name: 'agritech.marketplace.demo.copied' })).toBeNull();
    expect(screen.getByText('agritech.marketplace.demo.description')).toBeTruthy();
  });

  it('keeps the retry within reach while the catalog is unavailable', () => {
    const navigate = vi.fn();
    const onRetry = vi.fn();

    render(
      <MarketplaceDemoBanner navigate={navigate} onRetry={onRetry} reason="unavailable" t={t} variant="compact" />,
    );

    expect(screen.getByText('agritech.marketplace.demo.unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.demo.title' }));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('states the demo reason on a compact strip without repeating the credentials', () => {
    render(<MarketplaceDemoBanner navigate={vi.fn()} onRetry={vi.fn()} reason="guest" t={t} variant="compact" />);

    expect(screen.getByText('agritech.marketplace.demo.guest')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.demo.copy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ui.runtime.retry' })).toBeNull();
  });

  it('keeps the credentials on screen when the clipboard refuses the write', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('The clipboard permission was denied.');
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<MarketplaceDemoBanner navigate={vi.fn()} onRetry={vi.fn()} reason="guest" t={t} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.demo.copy' })[0] as HTMLElement);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.demo.copied' })).toBeNull();
  });

  it('leaves a blank assistant question unsent and says when the assistant is unreachable', async () => {
    const onAsk = vi.fn().mockRejectedValue(new Error('The consultation service is down.'));

    render(<MarketplaceAi locale="en" onAsk={onAsk} onOpenProduct={vi.fn()} products={[seed]} t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.open' }));
    // The send control is disabled, so a bare form submit is the way in.
    fireEvent.submit(panel('.dh-ai-panel__composer'));
    expect(onAsk).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' }), {
      target: { value: 'cheapest seed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));

    expect(await screen.findByText('agritech.marketplace.ai.unavailable')).toBeTruthy();
  });

  it('falls back to the category mark when a product photo cannot load', () => {
    render(<ProductMedia locale="en" product={{ ...seed, images: ['https://cdn.invalid/seed.png'] }} t={t} />);

    fireEvent.error(screen.getByRole('img', { name: seed.name }));

    expect(screen.getByRole('img', { name: 'agritech.marketplace.product.imageFallback' })).toBeTruthy();
  });

  it('opens every home entry point, and offers a request where a branch has no records', () => {
    const navigate = vi.fn();

    render(<MarketplaceHome {...discoveryActions()} navigate={navigate} products={[seed]} />);

    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.hero\.cta/u }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');

    const creates = screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' });
    fireEvent.click(creates[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/requests?create=1');

    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.section\.seedsDescription/u }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog?section=seeds');

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.scenario.verify' }));
    expect(navigate).toHaveBeenLastCalledWith('/verification');

    fireEvent.click(screen.getAllByRole('button', { name: /agritech\.marketplace\.shelf\.seeAll/u })[0] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/catalog?section=seeds');

    // Equipment and produce carry nothing in this fixture, so both shelves offer
    // the reverse auction instead of an empty grid.
    expect(screen.getAllByText('agritech.marketplace.catalog.noBranchRecords').length).toBe(2);
    fireEvent.click(creates[1] as HTMLElement);
    expect(navigate).toHaveBeenLastCalledWith('/requests?create=1');
  });

  it('narrows the catalog by region, price, stock and order, then clears every filter', () => {
    const cheap = { ...region(seed, 'Xorazm'), id: 'seed-cheap', name: 'Barley seed', priceUzs: 400_000 };
    const soldOut = { ...seed, id: 'seed-sold-out', name: 'Rye seed', stockQuantity: 0 };

    render(
      <MarketplaceCatalog
        {...discoveryActions()}
        locationSearch=""
        navigate={vi.fn()}
        products={[seed, cheap, soldOut]}
      />,
    );

    const filters = within(panel('.dh-filter-panel'));
    const resultCount = () => document.querySelectorAll('.dh-product-card').length;

    fireEvent.change(filters.getByLabelText('agritech.marketplace.filter.query'), { target: { value: 'barley' } });
    expect(resultCount()).toBe(1);

    fireEvent.change(filters.getByLabelText('agritech.marketplace.filter.query'), { target: { value: '' } });
    fireEvent.change(filters.getByLabelText('agritech.marketplace.filter.region'), { target: { value: 'Xorazm' } });
    expect(resultCount()).toBe(1);

    fireEvent.change(filters.getByLabelText('agritech.marketplace.filter.region'), { target: { value: '' } });
    fireEvent.click(filters.getByLabelText('agritech.marketplace.filter.inStock'));
    expect(resultCount()).toBe(2);

    fireEvent.click(filters.getByLabelText('agritech.marketplace.filter.inStock'));
    fireEvent.change(filters.getByLabelText('agritech.marketplace.filter.from'), { target: { value: '500000' } });
    expect(resultCount()).toBe(2);
    fireEvent.change(filters.getByLabelText('agritech.marketplace.filter.to'), { target: { value: '1000000' } });
    expect(document.querySelector('.dh-empty')).toBeTruthy();

    // The empty result offers the same reset the filter panel carries.
    fireEvent.click(within(panel('.dh-empty')).getByRole('button', { name: 'agritech.marketplace.filter.reset' }));
    expect(resultCount()).toBe(3);

    const sort = screen.getByLabelText('agritech.marketplace.sort');
    fireEvent.change(sort, { target: { value: 'priceAsc' } });
    expect(panel('.dh-product-card .dh-product-card__title').textContent).toBe(cheap.name);
    fireEvent.change(sort, { target: { value: 'priceDesc' } });
    expect(panel('.dh-product-card .dh-product-card__title').textContent).not.toBe(cheap.name);
  });

  it('sends a visitor back to the catalog from a product that is gone, and from one that is not', () => {
    const navigate = vi.fn();
    const detail = (product?: ProductViewDto) => (
      <MarketplaceProductDetail
        {...discoveryActions()}
        canReview={false}
        navigate={navigate}
        onReview={vi.fn()}
        onRetry={vi.fn()}
        onSample={vi.fn()}
        product={product}
        reviews={{ data: [], status: 'idle' }}
        sampleUsage={{ data: { limit: 5, remaining: 0, used: 5 }, status: 'ready' }}
        similar={[]}
      />
    );

    const view = render(detail());
    expect(screen.getByRole('heading', { name: 'agritech.marketplace.product.notFound' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.back' }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');

    view.rerender(detail(seed));
    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.back/u }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
    // No allowance left, so the sample control states that instead of inviting one.
    expect(screen.getByRole('button', { name: 'agritech.marketplace.samples.unavailable' })).toBeTruthy();
  });

  it('distinguishes a loading, unavailable and empty favourites page', () => {
    const navigate = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const favorites = (status: 'empty' | 'error' | 'loading') => (
      <MarketplaceFavorites {...discoveryActions()} navigate={navigate} products={[seed]} status={status} />
    );

    const view = render(favorites('loading'));
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();

    view.rerender(favorites('error'));
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(reload).toHaveBeenCalledOnce();

    view.rerender(favorites('empty'));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.hero.cta' }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
  });

  it('distinguishes a loading, unavailable and empty basket', () => {
    const navigate = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const basket = (status: 'empty' | 'error' | 'loading') => (
      <MarketplaceCart
        carts={{ data: [], status }}
        locale="en"
        navigate={navigate}
        onCheckout={vi.fn()}
        onUpdate={vi.fn()}
        products={[]}
        t={t}
      />
    );

    const view = render(basket('loading'));
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();

    view.rerender(basket('error'));
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(reload).toHaveBeenCalledOnce();

    view.rerender(basket('empty'));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.hero.cta' }));
    expect(navigate).toHaveBeenLastCalledWith('/catalog');
  });

  it('asks an unverified buyer for identity even when a link opened the request form', () => {
    window.history.replaceState({}, '', '/requests?create=1');
    const navigate = vi.fn();
    const onCreate = vi.fn();

    render(
      <MarketplaceRequests
        isVerified={false}
        locale="en"
        myRequests={emptyResource}
        navigate={navigate}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={onCreate}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={emptyResource}
        t={t}
      />,
    );

    fireEvent.submit(panel('.dh-form'));
    expect(navigate).toHaveBeenCalledWith('/verification');
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.click(within(panel('.dh-form')).getByRole('button', { name: 'agritech.marketplace.close' }));
    expect(document.querySelector('.dh-form')).toBeNull();
  });

  it('says an owned request has drawn no offers yet', () => {
    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={{ data: [ownedRequest()], status: 'ready' }}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'ready' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={emptyResource}
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.orders.noOffers')).toBeTruthy();
  });

  it('reports each identity outcome on its own page', () => {
    const navigate = vi.fn();
    const verification = (data: VerificationViewDto | null, status: 'error' | 'loading' | 'ready') => (
      <MarketplaceVerification navigate={navigate} onRetry={vi.fn()} t={t} verification={{ data, status }} />
    );

    const view = render(verification(null, 'loading'));
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();

    view.rerender(verification(identity(), 'ready'));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.account.title' }));
    expect(navigate).toHaveBeenLastCalledWith('/account');

    view.rerender(verification(identity({ rejectionReason: 'document_unreadable', status: 'rejected' }), 'ready'));
    expect(screen.getByText('agritech.marketplace.verify.rejection.document_unreadable')).toBeTruthy();

    view.rerender(verification(null, 'ready'));
    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.account\.role\.seller/u }));
    expect(screen.getByText('agritech.marketplace.verify.doc.warehouse')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.account.title' }));
    expect(navigate).toHaveBeenLastCalledWith('/account');
  });

  it('keeps the account dashboard honest when nothing has happened on it yet', () => {
    const navigate = vi.fn();

    render(
      <MarketplaceAccount
        contracts={emptyResource}
        locale="en"
        myRequests={emptyResource}
        navigate={navigate}
        samples={emptyResource}
        t={t}
        verification={{ data: null, status: 'empty' }}
      />,
    );

    expect(screen.getByText('agritech.marketplace.empty')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.samples.empty')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.verify.notStarted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verification' }));
    expect(navigate).toHaveBeenLastCalledWith('/verification');
  });

  it('names who may still consent on a contract, and who never could', () => {
    const navigate = vi.fn();
    const page = (
      contract: ContractViewDto | undefined,
      currentUserId?: string,
      status: 'loading' | 'ready' = 'ready',
    ) => (
      <MarketplaceContract
        contract={contract}
        currentUserId={currentUserId}
        identityStatus="ready"
        locale="en"
        navigate={navigate}
        onQuote={vi.fn()}
        onRetry={vi.fn()}
        onSign={vi.fn()}
        status={status}
        t={t}
      />
    );

    const view = render(page(undefined, 'buyer-1', 'loading'));
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();

    view.rerender(page(undefined, 'buyer-1'));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.back' }));
    expect(navigate).toHaveBeenLastCalledWith('/account');

    // No identity yet: the page states the contract is not this visitor's.
    view.rerender(page(signedContract()));
    expect(screen.getByText('agritech.marketplace.contract.notYourContract')).toBeTruthy();

    // Somebody else's contract, read by neither party.
    view.rerender(page(signedContract(), 'onlooker-1'));
    expect(screen.getByText('agritech.marketplace.contract.notYourContract')).toBeTruthy();

    view.rerender(page(signedContract({ sellerSignedAt: '2026-08-10T10:00:00.000Z' }), 'seller-a'));
    expect(screen.getByText('agritech.marketplace.contract.yourSignatureRecorded')).toBeTruthy();

    view.rerender(page(signedContract({ status: 'legacy_review_required' }), 'buyer-1'));
    expect(screen.getByText('agritech.marketplace.contract.legacyReviewRequiredDescription')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.back/u }));
    expect(navigate).toHaveBeenLastCalledWith('/account');
  });

  // A basket line whose product the catalog no longer carries still has to be
  // legible and removable: the identifier stands in for everything unknown.
  it('keeps a basket line readable after its product leaves the catalog', () => {
    render(
      <MarketplaceCart
        carts={{ data: [basket([{ productId: 'ghost-1', quantity: 2 }], 'seller-z')], status: 'ready' }}
        locale="en"
        navigate={vi.fn()}
        onCheckout={vi.fn()}
        onUpdate={vi.fn()}
        products={[seed]}
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.product.unavailable')).toBeTruthy();
    expect(screen.getByText('ghost-1')).toBeTruthy();
    // Nothing priced, so the line total and the basket total stay blank rather
    // than claiming a number the page cannot stand behind.
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('accepts a request that clears every optional field it offered', () => {
    const onCreate = vi.fn();
    window.history.replaceState({}, '', '/requests?create=1');

    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={emptyResource}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={onCreate}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={emptyResource}
        t={t}
      />,
    );

    const form = panel('.dh-form');
    const filled: ReadonlyArray<readonly [string, string]> = [
      ['agritech.marketplace.orders.product', 'Corn seed'],
      ['agritech.marketplace.orders.volume', '40 t'],
      ['agritech.marketplace.orders.deadline', '2026-09-01'],
      ['agritech.marketplace.orders.budget', '2500000'],
      ['agritech.marketplace.orders.requirements', 'Certified seed only.'],
    ];
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.requestTitle'), {
      target: { value: 'Barley for spring' },
    });
    for (const [field, value] of filled) {
      const input = within(form).getByLabelText(field);
      fireEvent.change(input, { target: { value } });
      fireEvent.change(input, { target: { value: '' } });
    }
    fireEvent.submit(form);

    // Only the title is required, and every cleared field is sent as absent
    // rather than as an empty string the API would have to interpret.
    expect(onCreate).toHaveBeenCalledWith({
      budgetUzs: undefined,
      deadline: undefined,
      product: undefined,
      region: '',
      requirements: undefined,
      title: 'Barley for spring',
      volume: undefined,
    });
  });

  it('sends a bare offer once the seller clears the terms it filled in', () => {
    const onOffer = vi.fn();

    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={emptyResource}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={onOffer}
        onRetry={vi.fn()}
        requests={{ data: [ownedRequest({ buyerUserId: 'buyer-9', id: 'request-9' })], status: 'ready' }}
        role="seller"
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' }));
    const form = panel('.dh-inline-form');
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.price'), {
      target: { value: '2400000' },
    });
    const timing = within(form).getByLabelText('agritech.marketplace.orders.timing');
    const note = within(form).getByLabelText('agritech.marketplace.orders.deliveryNote');
    fireEvent.change(timing, { target: { value: '7' } });
    fireEvent.change(timing, { target: { value: '' } });
    fireEvent.change(note, { target: { value: 'Delivered to the gate.' } });
    fireEvent.change(note, { target: { value: '' } });
    fireEvent.submit(form);

    expect(onOffer).toHaveBeenCalledWith(ownedRequest({ buyerUserId: 'buyer-9', id: 'request-9' }), {
      deliveryDays: undefined,
      deliveryNote: undefined,
      deliveryTerms: 'by_agreement',
      priceUzs: 2_400_000,
    });
  });

  it('reads a request feed entry that carries neither a budget nor requirements', () => {
    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={emptyResource}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={{ data: [ownedRequest({ buyerUserId: 'buyer-9', id: 'request-9' })], status: 'ready' }}
        t={t}
      />,
    );

    expect(screen.getByText('Corn seed for autumn')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.orders.budget')).toBeNull();
  });

  it('prices a request feed entry that states a budget and its requirements', () => {
    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={emptyResource}
        navigate={vi.fn()}
        offersByRequest={{ data: {}, status: 'empty' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={{
          data: [
            ownedRequest({
              budgetUzs: 45_000_000,
              buyerUserId: 'buyer-9',
              id: 'request-9',
              requirements: 'Certified seed only',
            }),
          ],
          status: 'ready',
        }}
        t={t}
      />,
    );

    expect(screen.getByText('Certified seed only')).toBeTruthy();
    expect(document.querySelector('.dh-request-card__head strong')?.textContent).toContain('45');
  });

  it('states a rejected identity that came back without a stated reason', () => {
    render(
      <MarketplaceVerification
        navigate={vi.fn()}
        onRetry={vi.fn()}
        t={t}
        verification={{ data: identity({ status: 'rejected' }), status: 'ready' }}
      />,
    );

    expect(screen.getByText('agritech.marketplace.verify.rejectedDescription')).toBeTruthy();
  });

  // A contract that is running: both signatures are on it, the delivery window is
  // fixed, and nobody outside the two parties has anything left to consent to.
  it('reads an active contract as a record rather than a pending signature', () => {
    const active = signedContract({
      buyerSignedAt: '2026-08-10T09:00:00.000Z',
      deliveryDays: 5,
      deliveryPriceUzs: 150_000,
      deliveryTerms: 'seller_delivery',
      sellerSignedAt: '2026-08-10T10:00:00.000Z',
      status: 'active',
    });

    render(
      <MarketplaceContract
        contract={active}
        currentUserId="onlooker-1"
        identityStatus="ready"
        locale="en"
        navigate={vi.fn()}
        onQuote={vi.fn()}
        onRetry={vi.fn()}
        onSign={vi.fn()}
        status="ready"
        t={t}
      />,
    );

    expect(screen.queryByRole('button', { name: 'agritech.marketplace.contract.signOwnParty' })).toBeNull();
    expect(screen.getByText('agritech.marketplace.contract.notYourContract')).toBeTruthy();
    expect(screen.getAllByText('agritech.marketplace.contract.signedAt')).toHaveLength(2);
    expect(screen.getByText('agritech.marketplace.orders.deliveryDays')).toBeTruthy();
    expect(document.querySelector('.dh-inline-form')).toBeNull();
  });

  it('quotes a delivery the seller owes without inventing optional terms', () => {
    const onQuote = vi.fn();
    const quotable = signedContract({ deliveryTerms: 'seller_delivery' });

    render(
      <MarketplaceContract
        contract={quotable}
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

    const form = panel('.dh-inline-form');
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.contract.deliveryPrice'), {
      target: { value: '150000' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '' } });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: 'By the gate.' },
    });
    fireEvent.change(within(form).getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: '' },
    });
    fireEvent.submit(form);

    expect(onQuote).toHaveBeenCalledWith(quotable, {
      deliveryDays: undefined,
      deliveryNote: undefined,
      deliveryPriceUzs: 150_000,
    });
  });

  it('holds the quantity at one when the stepper field is emptied', () => {
    const onAdd = vi.fn();

    render(
      <MarketplaceProductDetail
        {...discoveryActions()}
        canReview={false}
        navigate={vi.fn()}
        onAdd={onAdd}
        onReview={vi.fn()}
        onRetry={vi.fn()}
        onSample={vi.fn()}
        product={seed}
        reviews={emptyResource}
        sampleUsage={{ data: { limit: 5, remaining: 5, used: 0 }, status: 'ready' }}
        similar={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText('agritech.marketplace.product.quantity'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));

    expect(onAdd).toHaveBeenCalledWith(seed, 1);
  });

  it('keeps the assistant open on any key but Escape, and says when nothing matched', async () => {
    const onAsk = vi.fn().mockResolvedValue({ kind: 'cheapest', productIds: [] });

    render(<MarketplaceAi locale="en" onAsk={onAsk} onOpenProduct={vi.fn()} products={[seed]} t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.open' }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(document.querySelector('.dh-ai-panel')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' }), {
      target: { value: 'cheapest gold' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));

    expect(await screen.findByText('agritech.marketplace.ai.noMatch')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.dh-ai-panel')).toBeNull();
  });

  // The quick prompts are the assistant's own suggestions: one click has to ask the
  // question for the visitor, carrying the kind that prompt stands for.
  it('asks a quick prompt on the visitor behalf without typing anything', async () => {
    const onAsk = vi.fn().mockResolvedValue({ id: 'ai-quick', kind: 'find_cheaper', productIds: [seed.id] });

    render(<MarketplaceAi locale="en" onAsk={onAsk} onOpenProduct={vi.fn()} products={[seed]} t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.open' }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.q.cheaper' }));

    expect(onAsk).toHaveBeenCalledWith('agritech.marketplace.ai.q.cheaper', 'find_cheaper');
    expect(await screen.findByText('agritech.marketplace.ai.result.findCheaper')).toBeTruthy();
  });
});
