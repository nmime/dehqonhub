// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractLifecycleDto,
  ContractViewDto,
  MarketplaceAiConsultationDto,
  MarketplaceProviderReadinessDto,
  OfferViewDto,
} from '@app/frontend-api-client';
import { MarketplaceAi } from './marketplace-ai';
import {
  MarketplaceAccount,
  MarketplaceCart,
  MarketplaceContract,
  MarketplaceRequests,
  MarketplaceVerification,
} from './marketplace-commerce';
import { MarketplaceCatalog, MarketplaceProductDetail, MarketplaceSellerProfile } from './marketplace-discovery';
import { ProductMedia } from './marketplace-product-card';
import type { MarketplaceListing, MarketplaceTranslate } from './marketplace-ui';

const t: MarketplaceTranslate = (key) => key;

const product = (
  id: string,
  supplierId: string,
  category: MarketplaceListing['category'],
  name: string,
): MarketplaceListing => ({
  category,
  description: `${name} description`,
  id,
  images: [],
  kind: 'product',
  name,
  priceUzs: 1_250_000,
  promoted: false,
  region: 'Samarqand',
  sampleAvailable: true,
  section: category === 'equipment' || category === 'irrigation' ? 'equipment' : 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId,
  supplierName: `Seller ${supplierId}`,
  unit: 't',
});

const seed = product('seed-1', 'seller-a', 'seed', 'Certified corn seed');
const tractor = product('equipment-1', 'seller-b', 'equipment', 'Compact tractor');
const otherInput = product('input-1', 'seller-c', 'other', 'Specialty soil input');
const fertilizer = product('fertilizer-1', 'seller-d', 'fertilizer', 'Granular fertilizer');
const pesticide = product('pesticide-1', 'seller-e', 'pesticide', 'Crop protection concentrate');

const aiAnswer = (id: string): MarketplaceAiConsultationDto => ({
  answer: 'catalog_match' as const,
  createdAt: '2026-08-09T10:00:00.000Z',
  id,
  kind: 'recommendation' as const,
  listingPublicationIds: [seed.id],
  question: 'seed',
  response: {
    explanationCodes: ['grounded_at_consultation_time' as const],
    recommendations: [
      {
        availability: {
          quantity: seed.stockQuantity,
          status: 'in_stock_at_consultation' as const,
          unit: seed.unit,
          warningCode: 'stock_may_change' as const,
        },
        listingPublicationId: seed.id,
        priceUzs: seed.priceUzs,
        reasonCodes: ['query_terms_match' as const],
        sellerPublicId: seed.supplierId,
        titles: { en: seed.name, ru: seed.name, uz: seed.name, uzCyrl: seed.name },
      },
    ],
    starterCartPreview: { sellerPartitions: [], status: 'unavailable' as const },
  },
  updatedAt: '2026-08-09T10:00:00.000Z',
});

const contractLifecycle = (contractId: string): ContractLifecycleDto => ({
  contractId,
  disputeEvidence: [],
  fulfillment: {
    createdAt: '2026-08-09T10:00:00.000Z',
    revision: 1,
    status: 'awaiting_settlement',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
  notificationIntents: [],
  reputationSignals: [],
  reviewEligibility: { eligible: false, sourceCount: 0 },
  settlement: {
    amountUzs: 2_500_000,
    createdAt: '2026-08-09T10:00:00.000Z',
    currency: 'UZS',
    kind: 'DirectPaymentSettlementDto',
    latestProviderMode: 'mock',
    reconciliationState: 'clear',
    revision: 1,
    simulation: true,
    status: 'awaiting_buyer_confirmation',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
  settlementEvents: [],
  signatures: [],
  timeline: [],
});

const readyVerificationProviders: MarketplaceProviderReadinessDto = Object.fromEntries(
  [
    'contractArtifactStorage',
    'directPayment',
    'factoring',
    'notificationDelivery',
    'oneId',
    'promotionBilling',
    'qualifiedSignature',
    'verificationDocuments',
  ].map((capability) => [
    capability,
    {
      mode: 'mock',
      providerName: 'mock',
      ready: true,
      reconciliation: 'idempotent-retry',
      simulation: true,
      timeoutMs: 1_000,
    },
  ]),
) as MarketplaceProviderReadinessDto;

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
        products={[seed, tractor, otherInput, fertilizer, pesticide]}
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
    expect(screen.queryByText(fertilizer.name)).toBeNull();
    expect(screen.queryByText(pesticide.name)).toBeNull();
    expect(screen.getByRole('heading', { name: 'agritech.marketplace.catalog.noResults' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.all' }));
    expect(screen.getByText(otherInput.name)).toBeTruthy();
  });

  it.each([
    [fertilizer, 'fertilizer'],
    [pesticide, 'pesticide'],
    [otherInput, 'input'],
  ] as const)('renders %s with a non-produce fallback glyph', (catalogProduct, expectedIcon) => {
    render(<ProductMedia locale="en" product={catalogProduct} t={t} />);

    const fallback = screen.getByRole('img', { name: 'agritech.marketplace.product.imageFallback' });
    const icon = fallback.querySelector('[data-marketplace-icon]');
    expect(icon?.getAttribute('data-marketplace-icon')).toBe(expectedIcon);
    expect(icon?.getAttribute('data-marketplace-icon')).not.toBe('produce');
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

  it('renders a public seller profile with its privacy-safe catalog', () => {
    render(
      <MarketplaceSellerProfile
        catalog={{ data: [seed], status: 'ready' }}
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        seller={{
          data: {
            description: 'Regional certified seed supplier',
            displayName: 'Seed cooperative',
            id: seed.supplierId,
            region: 'Samarqand',
            verified: true,
          },
          status: 'ready',
        }}
        t={t}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Seed cooperative' })).toBeTruthy();
    expect(screen.getByText('Regional certified seed supplier')).toBeTruthy();
    expect(screen.getByText(seed.name)).toBeTruthy();
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
        canReplyToReviews={false}
        canReportReviews={false}
        canReview={false}
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReview={vi.fn()}
        onReplyToReview={vi.fn()}
        onReportReview={vi.fn()}
        onRetry={onRetry}
        onSample={vi.fn()}
        product={seed}
        reviews={{ data: [], status: 'empty' }}
        sampleUsage={{
          data: { limit: 5, period: '2026', policyVersion: 1, remaining: 5, used: 0 },
          status: 'error',
        }}
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
        canReplyToReviews={false}
        canReportReviews={false}
        canReview
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReview={onReview}
        onReplyToReview={vi.fn()}
        onReportReview={vi.fn()}
        onRetry={vi.fn()}
        onSample={vi.fn()}
        product={seed}
        reviews={{ data: [], status: 'empty' }}
        sampleUsage={{
          data: { limit: 5, period: '2026', policyVersion: 1, remaining: 5, used: 0 },
          status: 'ready',
        }}
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
        canReplyToReviews={false}
        canReportReviews={false}
        canReview
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReview={onReview}
        onReplyToReview={vi.fn()}
        onReportReview={vi.fn()}
        onRetry={vi.fn()}
        onSample={vi.fn()}
        product={seed}
        reviews={{ data: [], status: 'empty' }}
        sampleUsage={{
          data: { limit: 5, period: '2026', policyVersion: 1, remaining: 5, used: 0 },
          status: 'ready',
        }}
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

  it('exposes actor-authorized review reply and report commands', async () => {
    const review = {
      assetReferences: [],
      comment: 'Strong germination rate',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'review-1',
      listingPublicationId: seed.id,
      rating: 5,
      revision: 2,
      updatedAt: '2026-08-09T10:00:00.000Z',
      verifiedDeal: true as const,
    };
    const onReplyToReview = vi.fn().mockResolvedValue(true);
    const onReportReview = vi.fn().mockResolvedValue(true);

    render(
      <MarketplaceProductDetail
        canReplyToReviews
        canReportReviews
        canReview={false}
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReview={vi.fn()}
        onReplyToReview={onReplyToReview}
        onReportReview={onReportReview}
        onRetry={vi.fn()}
        onSample={vi.fn()}
        product={seed}
        reviews={{ data: [review], status: 'ready' }}
        sampleUsage={{
          data: { limit: 5, period: '2026', policyVersion: 1, remaining: 5, used: 0 },
          status: 'ready',
        }}
        similar={[]}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.reply' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.reply'), {
      target: { value: 'Thank you for the feedback' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.replySubmit' }));
    await waitFor(() => {
      expect(onReplyToReview).toHaveBeenCalledWith(review, 'Thank you for the feedback');
    });

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.report' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.reportReason'), {
      target: { value: 'privacy' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.reportComment'), {
      target: { value: 'Contains personal information' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.reportSubmit' }));
    await waitFor(() => {
      expect(onReportReview).toHaveBeenCalledWith(review, 'privacy', 'Contains personal information');
    });
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

  it('invites a verified seller to an open public purchase request', () => {
    const request = {
      buyerDisplayName: 'Regional buyer',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'public-request-1',
      region: 'Samarqand',
      status: 'open' as const,
      title: 'Request for corn seed',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
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
        requests={{ data: [request], status: 'ready' }}
        role="seller"
        t={t}
      />,
    );

    expect(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' })).toBeTruthy();
  });

  it('does not expose request, offer, or offer-selection commands without current verification', () => {
    const navigate = vi.fn();
    const request: BuyerRequestViewDto = {
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-unverified',
      region: 'Samarqand',
      status: 'offering',
      title: 'Corn seed',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const offer: OfferViewDto = {
      createdAt: '2026-08-09T10:05:00.000Z',
      deliveryTerms: 'pickup',
      id: 'offer-unverified',
      priceUzs: 4_500_000,
      requestPublicId: request.id,
      seller: { displayName: 'Seed cooperative', region: 'Tashkent' },
      status: 'pending',
    };
    render(
      <MarketplaceRequests
        isVerified={false}
        locale="en"
        myRequests={{ data: [request], status: 'ready' }}
        navigate={navigate}
        offersByRequest={{ data: { [request.id]: [offer] }, status: 'ready' }}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={{ data: [request], status: 'ready' }}
        role="seller"
        t={t}
      />,
    );

    expect(screen.queryByRole('button', { name: 'agritech.marketplace.orders.makeOffer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.orders.choose' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0]);
    expect(navigate).toHaveBeenCalledWith('/verification');
    expect(screen.queryByLabelText('agritech.marketplace.orders.requestTitle')).toBeNull();
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
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-open',
      region: 'Samarqand',
      status: 'open',
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
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-owned',
      region: 'Samarqand',
      status: 'open',
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

  it('renders the privacy-safe seller snapshot for an owned request offer', () => {
    const request: BuyerRequestViewDto = {
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-with-offer',
      region: 'Samarqand',
      status: 'offering',
      title: 'Corn seed',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const offer = {
      createdAt: '2026-08-09T10:05:00.000Z',
      deliveryTerms: 'pickup' as const,
      id: 'offer-1',
      priceUzs: 4_500_000,
      requestPublicId: request.id,
      seller: { displayName: 'Verified seed cooperative', region: 'Tashkent' },
      status: 'pending' as const,
    };
    const onChoose = vi.fn();

    render(
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={{ data: [request], status: 'ready' }}
        navigate={vi.fn()}
        offersByRequest={{ data: { [request.id]: [offer] }, status: 'ready' }}
        onChoose={onChoose}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        requests={{ data: [], status: 'empty' }}
        role="buyer"
        t={t}
      />,
    );

    expect(screen.getByText(/Verified seed cooperative/u)).toBeTruthy();
    expect(screen.getByText(/Tashkent/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.choose' }));
    expect(onChoose).toHaveBeenCalledWith(request, offer);
  });

  it('reviews each server-separated seller cart with explicit delivery terms', () => {
    const carts: CartViewDto[] = [
      {
        createdAt: '2026-08-09T10:00:00.000Z',
        id: 'cart-a',
        items: [{ listingPublicationId: seed.id, quantity: 2, sourceKind: 'product' }],
        seller: { displayName: 'Seller seller-a', region: 'Samarqand' },
        status: 'open',
        updatedAt: '2026-08-09T10:00:00.000Z',
      },
      {
        createdAt: '2026-08-09T10:00:00.000Z',
        id: 'cart-b',
        items: [{ listingPublicationId: tractor.id, quantity: 1, sourceKind: 'product' }],
        seller: { displayName: 'Seller seller-b', region: 'Tashkent' },
        status: 'open',
        updatedAt: '2026-08-09T10:00:00.000Z',
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

  it('starts the explicitly selected mock-backed verification flow', () => {
    const onStart = vi.fn();
    render(
      <MarketplaceVerification
        navigate={vi.fn()}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={onStart}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{
          data: {
            contractArtifactStorage: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
            directPayment: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
            factoring: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
            notificationDelivery: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
            oneId: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
            promotionBilling: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
            qualifiedSignature: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
            verificationDocuments: {
              mode: 'mock',
              providerName: 'mock',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 1000,
            },
          },
          status: 'ready',
        }}
        t={t}
        verification={{ data: null, status: 'empty' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /agritech.marketplace.account.role.seller/u }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verify.start' }));
    expect(onStart).toHaveBeenCalledWith('seller');
  });

  it('retries a failed verification identity load without reloading the browser', () => {
    const onRetry = vi.fn();

    render(
      <MarketplaceVerification
        navigate={vi.fn()}
        onLinkIdentity={vi.fn()}
        onRetry={onRetry}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: null, status: 'error' }}
        t={t}
        verification={{ data: null, status: 'error' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('links identity, uploads user-selected evidence, and submits only after every explicit step', () => {
    const onLinkIdentity = vi.fn();
    const onSubmit = vi.fn();
    const onUploadDocument = vi.fn();
    const baseVerification = {
      createdAt: '2026-08-09T10:00:00.000Z',
      documents: [],
      id: 'verification-explicit',
      identityAssurance: 'mock' as const,
      level: 'basic' as const,
      oneIdLinked: false,
      providerMode: 'mock' as const,
      revision: 2,
      role: 'buyer' as const,
      simulation: true,
      status: 'none' as const,
      step: 'identity' as const,
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const props = {
      navigate: vi.fn(),
      onLinkIdentity,
      onRetry: vi.fn(),
      onStart: vi.fn(),
      onSubmit,
      onUploadDocument,
      readiness: { data: readyVerificationProviders, status: 'ready' as const },
      t,
    };
    const view = render(
      <MarketplaceVerification {...props} verification={{ data: baseVerification, status: 'ready' }} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verify.linkIdentity' }));
    expect(onLinkIdentity).toHaveBeenCalledWith(baseVerification);
    const evidence = new File(['identity evidence'], 'identity.pdf', { type: 'application/pdf' });
    const identityInput = screen.getAllByLabelText(/agritech.marketplace.verify.uploadDocument/u)[0];
    if (!identityInput) {
      throw new Error('Identity evidence input is unavailable.');
    }
    Object.defineProperty(identityInput, 'files', { configurable: true, value: [evidence] });
    fireEvent.change(identityInput);
    expect(onUploadDocument).toHaveBeenCalledWith(baseVerification, 'id', evidence);
    expect(screen.getByRole('button', { name: 'agritech.marketplace.verify.submit' }).hasAttribute('disabled')).toBe(
      true,
    );

    const completeVerification = {
      ...baseVerification,
      documents: [
        {
          fileName: 'identity.pdf',
          kind: 'id',
          mimeType: 'application/pdf',
          providerMode: 'mock' as const,
          simulation: true,
        },
        {
          fileName: 'business.pdf',
          kind: 'business',
          mimeType: 'application/pdf',
          providerMode: 'mock' as const,
          simulation: true,
        },
      ],
      oneIdLinked: true,
      revision: 5,
      step: 'documents' as const,
    };
    view.rerender(
      <MarketplaceVerification {...props} verification={{ data: completeVerification, status: 'ready' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verify.submit' }));
    expect(onSubmit).toHaveBeenCalledWith(completeVerification);
  });

  it('resumes a rejected verification at its current role before replacement uploads', () => {
    const onStart = vi.fn();
    const rejected = {
      createdAt: '2026-08-09T10:00:00.000Z',
      documents: [],
      id: 'verification-rejected',
      identityAssurance: 'mock' as const,
      level: 'basic' as const,
      oneIdLinked: true,
      providerMode: 'mock' as const,
      rejectionReason: 'documents_unreadable' as const,
      revision: 7,
      role: 'seller' as const,
      simulation: true,
      status: 'rejected' as const,
      step: 'review' as const,
      updatedAt: '2026-08-09T10:00:00.000Z',
    };

    render(
      <MarketplaceVerification
        navigate={vi.fn()}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={onStart}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: readyVerificationProviders, status: 'ready' }}
        t={t}
        verification={{ data: rejected, status: 'ready' }}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('agritech.marketplace.verify.simulationDisclosure');
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verify.resume' }));
    expect(onStart).toHaveBeenCalledWith('seller');
  });

  it('lets only the current unsigned party record contract consent', () => {
    const contract: ContractViewDto = {
      actorParty: 'buyer',
      amountUzs: 2_500_000,
      buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryTerms: 'pickup',
      deliveryPriceUzs: 0,
      factoringEnabled: false,
      id: 'contract-1',
      revision: 1,
      lines: [
        {
          lineTotalUzs: 2_500_000,
          name: seed.name,
          quantity: 2,
          sourceKind: 'product',
          sourcePublicationId: seed.id,
          sourceRevision: 1,
          unit: seed.unit,
          unitPriceUzs: 1_250_000,
        },
      ],
      sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: seed.name,
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onSign = vi.fn();

    render(
      <MarketplaceContract
        contract={contract}
        identityStatus="verified"
        lifecycle={{ data: contractLifecycle(contract.id), status: 'ready' }}
        locale="en"
        navigate={vi.fn()}
        onDownloadArtifact={vi.fn()}
        onAdvanceLifecycle={vi.fn()}
        onOpenDispute={vi.fn()}
        onQuote={vi.fn()}
        onRefreshArtifact={vi.fn()}
        onRetry={vi.fn()}
        onSign={onSign}
        onUploadDisputeEvidence={vi.fn()}
        status="ready"
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /agritech.marketplace.contract.signOwnParty/u }));
    expect(onSign).toHaveBeenCalledWith(contract);
    expect(screen.getByText('Buyer cooperative')).toBeTruthy();
    expect(screen.getByText('Seed cooperative')).toBeTruthy();
    expect(screen.queryByText('buyer-1')).toBeNull();
    expect(screen.getByText('agritech.marketplace.contract.settlement.direct')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.contract.settlement.description')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.contract.settlement.awaiting')).toBeTruthy();
  });

  it('exposes contract artifact, dispute, and evidence controls on the contract surface', () => {
    const contract: ContractViewDto = {
      actorParty: 'buyer',
      amountUzs: 2_500_000,
      buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
      buyerSignedAt: '2026-08-09T10:02:00.000Z',
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryPriceUzs: 0,
      deliveryTerms: 'pickup',
      factoringEnabled: false,
      id: 'contract-evidence',
      lines: [],
      revision: 4,
      sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
      sellerSignedAt: '2026-08-09T10:03:00.000Z',
      signedAt: '2026-08-09T10:03:00.000Z',
      sourceType: 'cart_checkout',
      status: 'active',
      subject: seed.name,
      updatedAt: '2026-08-09T10:03:00.000Z',
    };
    const lifecycle = contractLifecycle(contract.id);
    lifecycle.artifact = {
      byteSize: 2_048,
      checksumSha256: 'checksum',
      createdAt: '2026-08-09T10:01:00.000Z',
      mediaType: 'application/pdf',
      providerMode: 'mock',
      providerName: 'mock-artifact-store',
      simulation: true,
      snapshotFingerprint: 'snapshot',
      snapshotRevision: 1,
      templateVersion: 'dehqonhub-contract-v1',
      watermark: null,
    };
    const onDownloadArtifact = vi.fn();
    const onOpenDispute = vi.fn();
    const onRefreshArtifact = vi.fn();
    const onUploadDisputeEvidence = vi.fn();

    const view = render(
      <MarketplaceContract
        contract={contract}
        identityStatus="verified"
        lifecycle={{ data: lifecycle, status: 'ready' }}
        locale="en"
        navigate={vi.fn()}
        onDownloadArtifact={onDownloadArtifact}
        onAdvanceLifecycle={vi.fn()}
        onOpenDispute={onOpenDispute}
        onQuote={vi.fn()}
        onRefreshArtifact={onRefreshArtifact}
        onRetry={vi.fn()}
        onSign={vi.fn()}
        onUploadDisputeEvidence={onUploadDisputeEvidence}
        status="ready"
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.contract.refreshArtifact' }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.contract.downloadArtifact' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.contract.disputeReason'), {
      target: { value: 'quality_issue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.contract.openDispute' }));
    expect(onRefreshArtifact).toHaveBeenCalledWith(contract);
    expect(onDownloadArtifact).toHaveBeenCalledWith(contract);
    expect(onOpenDispute).toHaveBeenCalledWith(contract, 'quality_issue');
    expect(screen.getByText('mock-artifact-store')).toBeTruthy();
    expect(screen.getAllByText('agritech.marketplace.contract.simulationDisclosure').length).toBeGreaterThan(0);

    const disputedLifecycle = {
      ...lifecycle,
      dispute: {
        createdAt: '2026-08-09T10:04:00.000Z',
        openedByParty: 'buyer' as const,
        reason: 'quality_issue' as const,
        status: 'open' as const,
      },
    };
    view.rerender(
      <MarketplaceContract
        contract={contract}
        identityStatus="verified"
        lifecycle={{ data: disputedLifecycle, status: 'ready' }}
        locale="en"
        navigate={vi.fn()}
        onDownloadArtifact={onDownloadArtifact}
        onAdvanceLifecycle={vi.fn()}
        onOpenDispute={onOpenDispute}
        onQuote={vi.fn()}
        onRefreshArtifact={onRefreshArtifact}
        onRetry={vi.fn()}
        onSign={vi.fn()}
        onUploadDisputeEvidence={onUploadDisputeEvidence}
        status="ready"
        t={t}
      />,
    );
    const evidence = new File(['evidence'], 'quality-photo.png', { type: 'image/png' });
    const evidenceInput = screen.getByLabelText('agritech.marketplace.contract.disputeEvidence');
    Object.defineProperty(evidenceInput, 'files', { configurable: true, value: [evidence] });
    fireEvent.change(evidenceInput);
    const uploadButton = screen.getByRole('button', { name: 'agritech.marketplace.contract.uploadEvidence' });
    expect(uploadButton.hasAttribute('disabled')).toBe(false);
    fireEvent.submit(uploadButton.closest('form')!);
    expect(onUploadDisputeEvidence).toHaveBeenCalledWith(contract, evidence);
  });

  it('distinguishes dashboard, contract, sample, and lifecycle failures from empty data and retries in place', () => {
    const onRetry = vi.fn();
    const account = render(
      <MarketplaceAccount
        contracts={{ data: [], status: 'error' }}
        dashboard={{ data: null, status: 'error' }}
        locale="en"
        navigate={vi.fn()}
        onRetry={onRetry}
        samples={{ data: [], status: 'error' }}
        t={t}
        verification={{ data: null, status: 'empty' }}
      />,
    );

    expect(screen.getByText('agritech.marketplace.account.dashboardUnavailable')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.account.contractsUnavailable')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.samples.unavailable')).toBeTruthy();
    expect(screen.queryByLabelText('agritech.marketplace.account.dashboard')).toBeNull();
    for (const retry of screen.getAllByRole('button', { name: 'ui.runtime.retry' })) {
      fireEvent.click(retry);
    }
    expect(onRetry).toHaveBeenCalledTimes(3);

    account.unmount();
    const contract: ContractViewDto = {
      actorParty: 'buyer',
      amountUzs: 2_500_000,
      buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryPriceUzs: 0,
      deliveryTerms: 'pickup',
      factoringEnabled: false,
      id: 'contract-lifecycle-error',
      lines: [],
      revision: 1,
      sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: seed.name,
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    render(
      <MarketplaceContract
        contract={contract}
        identityStatus="verified"
        lifecycle={{ data: null, status: 'error' }}
        locale="en"
        navigate={vi.fn()}
        onAdvanceLifecycle={vi.fn()}
        onDownloadArtifact={vi.fn()}
        onOpenDispute={vi.fn()}
        onQuote={vi.fn()}
        onRefreshArtifact={vi.fn()}
        onRetry={onRetry}
        onSign={vi.fn()}
        onUploadDisputeEvidence={vi.fn()}
        status="ready"
        t={t}
      />,
    );
    expect(screen.getByText('agritech.marketplace.error')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledTimes(4);
  });

  it('blocks consent and lets the listed seller quote pending delivery', () => {
    const contract: ContractViewDto = {
      actorParty: 'seller',
      amountUzs: 2_500_000,
      buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryTerms: 'seller_delivery',
      factoringEnabled: false,
      id: 'contract-delivery',
      revision: 1,
      lines: [],
      sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: seed.name,
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onQuote = vi.fn();
    render(
      <MarketplaceContract
        contract={contract}
        identityStatus="verified"
        lifecycle={{ data: contractLifecycle(contract.id), status: 'ready' }}
        locale="en"
        navigate={vi.fn()}
        onDownloadArtifact={vi.fn()}
        onAdvanceLifecycle={vi.fn()}
        onOpenDispute={vi.fn()}
        onQuote={onQuote}
        onRefreshArtifact={vi.fn()}
        onRetry={vi.fn()}
        onSign={vi.fn()}
        onUploadDisputeEvidence={vi.fn()}
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
      actorParty: 'buyer',
      amountUzs: 2_500_000,
      buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryPriceUzs: 0,
      deliveryTerms: 'pickup',
      factoringEnabled: false,
      id: 'contract-identity-error',
      revision: 1,
      lines: [],
      sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: seed.name,
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onRetry = vi.fn();

    render(
      <MarketplaceContract
        contract={contract}
        identityStatus="error"
        lifecycle={{ data: contractLifecycle(contract.id), status: 'ready' }}
        locale="en"
        navigate={vi.fn()}
        onDownloadArtifact={vi.fn()}
        onAdvanceLifecycle={vi.fn()}
        onOpenDispute={vi.fn()}
        onQuote={vi.fn()}
        onRefreshArtifact={vi.fn()}
        onRetry={onRetry}
        onSign={vi.fn()}
        onUploadDisputeEvidence={vi.fn()}
        status="ready"
        t={t}
      />,
    );

    expect(screen.queryByRole('button', { name: /agritech.marketplace.contract.signOwnParty/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each(['pending', 'rejected'] as const)(
    'hides contract mutations while current verification is %s',
    (identityStatus) => {
      const draft: ContractViewDto = {
        actorParty: 'buyer',
        amountUzs: 2_500_000,
        buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
        createdAt: '2026-08-09T10:00:00.000Z',
        deliveryPriceUzs: 0,
        deliveryTerms: 'pickup',
        factoringEnabled: false,
        id: `contract-${identityStatus}`,
        lines: [],
        revision: 1,
        sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
        sourceType: 'cart_checkout',
        status: 'draft',
        subject: seed.name,
        updatedAt: '2026-08-09T10:00:00.000Z',
      };
      const lifecycle = contractLifecycle(draft.id);
      lifecycle.artifact = {
        byteSize: 2_048,
        checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        createdAt: '2026-08-09T10:01:00.000Z',
        mediaType: 'application/pdf',
        providerMode: 'mock',
        providerName: 'mock-artifact-store',
        simulation: true,
        snapshotFingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        snapshotRevision: 1,
        templateVersion: 'dehqonhub-contract-v1',
        watermark: 'MOCK PROVIDER — NOT A LEGAL CONTRACT',
      };
      const view = render(
        <MarketplaceContract
          contract={draft}
          identityStatus={identityStatus}
          lifecycle={{ data: lifecycle, status: 'ready' }}
          locale="en"
          navigate={vi.fn()}
          onAdvanceLifecycle={vi.fn()}
          onDownloadArtifact={vi.fn()}
          onOpenDispute={vi.fn()}
          onQuote={vi.fn()}
          onRefreshArtifact={vi.fn()}
          onRetry={vi.fn()}
          onSign={vi.fn()}
          onUploadDisputeEvidence={vi.fn()}
          status="ready"
          t={t}
        />,
      );

      expect(screen.queryByRole('button', { name: 'agritech.marketplace.contract.signOwnParty' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'agritech.marketplace.contract.refreshArtifact' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'agritech.marketplace.contract.downloadArtifact' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'agritech.marketplace.contract.openDispute' })).toBeNull();

      view.rerender(
        <MarketplaceContract
          contract={{
            ...draft,
            buyerSignedAt: '2026-08-09T10:02:00.000Z',
            sellerSignedAt: '2026-08-09T10:03:00.000Z',
            signedAt: '2026-08-09T10:03:00.000Z',
            status: 'active',
          }}
          identityStatus={identityStatus}
          lifecycle={{ data: lifecycle, status: 'ready' }}
          locale="en"
          navigate={vi.fn()}
          onAdvanceLifecycle={vi.fn()}
          onDownloadArtifact={vi.fn()}
          onOpenDispute={vi.fn()}
          onQuote={vi.fn()}
          onRefreshArtifact={vi.fn()}
          onRetry={vi.fn()}
          onSign={vi.fn()}
          onUploadDisputeEvidence={vi.fn()}
          status="ready"
          t={t}
        />,
      );
      expect(screen.queryByRole('button', { name: 'agritech.marketplace.contract.settlement.advance' })).toBeNull();
    },
  );

  it('keeps grounded AI informational and returns focus after closing', async () => {
    const onAsk = vi.fn().mockResolvedValue(aiAnswer('ai-1'));
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

  it('mutates an AI starter cart only after explicit confirmation', async () => {
    const answer = aiAnswer('ai-starter-cart');
    answer.response.starterCartPreview = {
      sellerPartitions: [{ listingPublicationIds: [seed.id], sellerPublicId: seed.supplierId }],
      status: 'requires_confirmation',
    };
    const onConfirmStarterCart = vi.fn().mockResolvedValue(true);
    render(
      <MarketplaceAi
        locale="en"
        onAsk={vi.fn().mockResolvedValue(answer)}
        onConfirmStarterCart={onConfirmStarterCart}
        onOpenProduct={vi.fn()}
        products={[seed]}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.open' }));
    const question = screen.getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' });
    fireEvent.change(question, { target: { value: 'seed' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));
    const confirm = await screen.findByRole('button', {
      name: /agritech.marketplace.ai.starterCart.confirm/u,
    });
    expect(onConfirmStarterCart).not.toHaveBeenCalled();

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(onConfirmStarterCart).toHaveBeenCalledWith(answer);
      expect(screen.getByText('agritech.marketplace.ai.starterCart.confirmed')).toBeTruthy();
    });
  });

  it('keeps AI starter-cart confirmation unavailable without a verified buyer capability', async () => {
    const answer = aiAnswer('ai-unverified-cart');
    answer.response.starterCartPreview = {
      sellerPartitions: [{ listingPublicationIds: [seed.id], sellerPublicId: seed.supplierId }],
      status: 'requires_confirmation',
    };
    render(
      <MarketplaceAi
        canConfirmStarterCart={false}
        locale="en"
        onAsk={vi.fn().mockResolvedValue(answer)}
        onConfirmStarterCart={vi.fn()}
        onOpenProduct={vi.fn()}
        products={[seed]}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.open' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' }), {
      target: { value: 'seed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));
    await screen.findByText('agritech.marketplace.ai.result.recommendation');
    expect(screen.queryByRole('button', { name: /agritech.marketplace.ai.starterCart.confirm/u })).toBeNull();
  });

  it('renders grounded AI results through the current locale translator', async () => {
    const onAsk = vi.fn().mockResolvedValue(aiAnswer('ai-locale'));
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
