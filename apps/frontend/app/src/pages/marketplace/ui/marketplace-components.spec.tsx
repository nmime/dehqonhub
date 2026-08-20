// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-ONBOARDING-023 REQ-AGRITECH-DEMO-024
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractLifecycleDto,
  ContractViewDto,
  MarketplaceAiConsultationDto,
  MarketplaceProviderReadinessDto,
  MarketplaceRoleDashboardDto,
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
import {
  MarketplaceCatalog,
  MarketplaceHome,
  MarketplaceProductDetail,
  MarketplaceSellerProfile,
} from './marketplace-discovery';
import { MarketplaceDemoBanner } from './marketplace-demo-banner';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceProductCard, ProductMedia } from './marketplace-product-card';
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
  provenance: 'live',
  rating: { average: 4.6, count: 12 },
  region: 'Samarqand',
  sampleAvailable: true,
  section: category === 'equipment' || category === 'irrigation' ? 'equipment' : 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId,
  supplierName: `Seller ${supplierId}`,
  transactional: true,
  unit: 't',
});

const seed = product('seed-1', 'seller-a', 'seed', 'Certified corn seed');
const tractor = product('equipment-1', 'seller-b', 'equipment', 'Compact tractor');
const otherInput = product('input-1', 'seller-c', 'other', 'Specialty soil input');
const fertilizer = product('fertilizer-1', 'seller-d', 'fertilizer', 'Granular fertilizer');
const pesticide = product('pesticide-1', 'seller-e', 'pesticide', 'Crop protection concentrate');

const demoSeed: MarketplaceListing = {
  ...seed,
  id: 'demo-seed-1',
  provenance: 'demo',
  supplierId: 'demo-seller',
  transactional: false,
};

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

interface LifecycleCoverageScenario {
  actorParty: ContractViewDto['actorParty'];
  alreadyConsented?: boolean;
  factoring: boolean;
  fulfillment: ContractLifecycleDto['fulfillment']['status'];
  hasAction?: boolean;
  settlement: ContractLifecycleDto['settlement']['status'];
}

const configureLifecycleCoverage = (
  lifecycle: ContractLifecycleDto,
  scenario: LifecycleCoverageScenario,
  index: number,
) => {
  lifecycle.fulfillment.status = scenario.fulfillment;
  lifecycle.settlement = {
    ...lifecycle.settlement,
    kind: scenario.factoring ? 'FactoringSettlementDto' : 'DirectPaymentSettlementDto',
    status: scenario.settlement,
  } as ContractLifecycleDto['settlement'];
  if (scenario.alreadyConsented) {
    Object.assign(
      lifecycle.settlement,
      scenario.actorParty === 'buyer'
        ? { buyerConsentedAt: '2026-08-09T10:01:00.000Z' }
        : { sellerConsentedAt: '2026-08-09T10:01:00.000Z' },
    );
  }
  if (index === 0) {
    lifecycle.settlement.simulation = false;
    lifecycle.timeline = [
      {
        actorParty: 'seller',
        category: 'fulfillment',
        createdAt: '2026-08-09T10:01:00.000Z',
        eventType: 'fulfillment_ready',
        providerMode: 'mock',
        sequence: 1,
        simulation: true,
      },
    ];
    lifecycle.disputeEvidence = [
      {
        byteSize: 128,
        checksumSha256: 'checksum',
        createdAt: '2026-08-09T10:00:00.000Z',
        fileName: 'delivery-proof.pdf',
        id: 'evidence-1',
        mediaType: 'application/pdf',
        providerMode: 'mock',
        providerName: 'mock-storage',
        revision: 1,
        simulation: true,
        uploadedByParty: 'buyer',
      },
    ];
  } else if (index === 1) {
    lifecycle.settlement.simulation = false;
    lifecycle.timeline = [
      {
        actorParty: 'seller',
        category: 'fulfillment',
        createdAt: '2026-08-09T10:01:00.000Z',
        eventType: 'provider_specific_event',
        providerMode: 'live',
        sequence: 1,
        simulation: false,
      },
    ];
  }
};

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

const homeProps = () => ({
  favoriteIds: new Set<string>(),
  locale: 'en' as const,
  navigate: vi.fn(),
  onAdd: vi.fn(),
  onFavorite: vi.fn(),
  onOpen: vi.fn(),
  t,
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('DehqonHub marketplace components', () => {
  it('uses the approved Lucide line-icon set without text or emoji fallbacks', () => {
    const { container } = render(<MarketplaceIcon name="cart" />);
    const icon = container.querySelector('[data-marketplace-icon="cart"]');

    expect(icon?.classList.contains('lucide-shopping-cart')).toBe(true);
    expect(icon?.getAttribute('stroke-width')).toBe('1.8');
    expect(icon?.textContent).toBe('');
  });

  it('keeps governed demo content browseable with a local preview cart boundary', () => {
    const onAdd = vi.fn();
    const onFavorite = vi.fn();
    const { container } = render(
      <MarketplaceProductCard
        favorite={false}
        locale="en"
        onAdd={onAdd}
        onFavorite={onFavorite}
        onOpen={vi.fn()}
        product={demoSeed}
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.access.demoBadge')).toBeTruthy();
    const favorite = screen.getByRole('button', { name: 'agritech.marketplace.product.addFavorite' });
    expect(favorite.hasAttribute('disabled')).toBe(false);
    const previewCart = screen.getByRole('button', { name: 'agritech.marketplace.product.addToPreviewCart' });
    expect(previewCart.hasAttribute('disabled')).toBe(false);
    const provenance = screen.getByText('agritech.marketplace.access.demo');
    expect(provenance.className).toBe('dh-sr-only');
    expect(previewCart.getAttribute('aria-describedby')).toBe(provenance.id);
    expect(container.querySelector('.dh-product-card .dh-state-inline')).toBeNull();
    fireEvent.click(previewCart);
    expect(onAdd).toHaveBeenCalledWith(demoSeed);
    fireEvent.click(favorite);
    expect(onFavorite).toHaveBeenCalledWith(demoSeed);
  });

  it('announces a restricted catalog action without repeating the reason under every card', () => {
    const { container } = render(
      <MarketplaceProductCard
        canTransact={false}
        favorite={false}
        locale="en"
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        product={seed}
        t={t}
        transactionHint="verification-needed"
      />,
    );

    const cartAction = screen.getByRole('button', { name: 'agritech.marketplace.product.addToPreviewCart' });
    const reason = screen.getByText('verification-needed');
    expect(reason.className).toBe('dh-sr-only');
    expect(cartAction.getAttribute('aria-describedby')).toBe(reason.id);
    // No visible reason block and no per-card recovery control: the owning page
    // renders one notice with that action above the grid.
    expect(container.querySelector('.dh-product-card .dh-state-inline')).toBeNull();
    expect(container.querySelector('.dh-product-card .dh-text-button')).toBeNull();
  });

  it('publishes the three guarded reviewer identities as labelled demo accounts with copy controls', async () => {
    const clipboard = { writeText: vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    const navigate = vi.fn();

    try {
      render(<MarketplaceDemoBanner navigate={navigate} t={t} />);

      // The demo nature is visible copy on the banner itself, not a footnote.
      expect(screen.getByText('agritech.marketplace.demo.reviewerLabel')).toBeTruthy();
      expect(screen.getByText('agritech.marketplace.demo.reviewerNotice')).toBeTruthy();
      // A reviewer is told that a request, competing offers, and a signed
      // contract already exist between the buyer and seller identities.
      expect(screen.getByText('agritech.marketplace.demo.prepared')).toBeTruthy();
      expect(screen.getByText('dehqon@demo.dehqonhub.uz')).toBeTruthy();
      expect(screen.getByText('sotuvchi@demo.dehqonhub.uz')).toBeTruthy();
      expect(screen.getByText('xaridor@demo.dehqonhub.uz')).toBeTruthy();
      // Each role states what it is for, and the farmer identity is stated as a
      // dashboard role rather than a trading party.
      expect(screen.getByText('agritech.marketplace.demo.purpose.farmer')).toBeTruthy();
      expect(screen.getByText('agritech.marketplace.demo.purpose.seller')).toBeTruthy();
      expect(screen.getByText('agritech.marketplace.demo.purpose.buyer')).toBeTruthy();

      const copyControls = screen.getAllByRole('button', { name: /^agritech\.marketplace\.demo\.copy:/u });
      expect(copyControls).toHaveLength(3);
      fireEvent.click(copyControls[0]!);
      await waitFor(() => {
        expect(screen.getByText('agritech.marketplace.demo.copied')).toBeTruthy();
      });
      expect(clipboard.writeText).toHaveBeenCalledWith('dehqon@demo.dehqonhub.uz / DemoDehqon2026');

      fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.demo.signIn' }));
      expect(navigate).toHaveBeenCalledWith('/auth');
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('keeps reviewer entry on a live-only home while the deployment flag stays enabled', () => {
    // The catalog now serves real transactional listings, so provenance can no
    // longer decide whether the commission finds its accounts.
    render(<MarketplaceHome {...homeProps()} products={[seed, tractor]} />);

    expect(screen.getByRole('heading', { level: 2, name: 'agritech.marketplace.demo.title' })).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.demo.reviewerLabel')).toBeTruthy();
    expect(screen.getByText('xaridor@demo.dehqonhub.uz')).toBeTruthy();
  });

  it('removes reviewer entry when a deployment turns the reviewer-access flag off', () => {
    vi.stubGlobal('__APP_RUNTIME_CONFIG__', { reviewerAccessEnabled: false });

    try {
      render(<MarketplaceHome {...homeProps()} products={[seed, demoSeed]} />);

      expect(screen.queryByRole('heading', { level: 2, name: 'agritech.marketplace.demo.title' })).toBeNull();
      expect(screen.queryByText('xaridor@demo.dehqonhub.uz')).toBeNull();
      expect(screen.queryByText('agritech.marketplace.demo.reviewerLabel')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
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
    const view = render(
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

    view.rerender(
      <MarketplaceSellerProfile
        catalog={{ data: [demoSeed], status: 'ready' }}
        favoriteIds={new Set()}
        locale="en"
        navigate={vi.fn()}
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        seller={{
          data: {
            displayName: 'DehqonHub demo cooperative',
            id: demoSeed.supplierId,
            provenance: 'demo',
            region: 'Samarqand',
            verified: false,
          },
          status: 'ready',
        }}
        t={t}
      />,
    );
    expect(screen.getAllByText('agritech.marketplace.access.demoBadge').length).toBeGreaterThan(0);
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

  it('keeps live and demo product details browseable while explaining restricted transactions', () => {
    const onTransactionAction = vi.fn();
    const common = {
      canReplyToReviews: false,
      canReportReviews: false,
      canReview: false,
      favoriteIds: new Set<string>(),
      locale: 'en' as const,
      navigate: vi.fn(),
      onAdd: vi.fn(),
      onFavorite: vi.fn(),
      onOpen: vi.fn(),
      onReview: vi.fn(),
      onReplyToReview: vi.fn(),
      onReportReview: vi.fn(),
      onRetry: vi.fn(),
      onSample: vi.fn(),
      reviews: { data: [], status: 'empty' as const },
      sampleUsage: {
        data: { limit: 5, period: '2026', policyVersion: 1, remaining: 5, used: 0 },
        status: 'ready' as const,
      },
      similar: [],
      t,
    };
    const view = render(
      <MarketplaceProductDetail
        {...common}
        canTransact={false}
        onTransactionAction={onTransactionAction}
        product={seed}
        transactionActionLabel="verify-now"
        transactionHint="verification-needed"
      />,
    );

    expect(screen.getByText('verification-needed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'verify-now' }));
    expect(onTransactionAction).toHaveBeenCalledOnce();

    view.rerender(<MarketplaceProductDetail {...common} canTransact={false} product={seed} />);
    expect(screen.queryByRole('button', { name: 'verify-now' })).toBeNull();

    view.rerender(
      <MarketplaceProductDetail
        {...common}
        canTransact
        onTransactionAction={onTransactionAction}
        product={demoSeed}
        transactionActionLabel="verify-now"
        transactionHint="ignored-live-hint"
      />,
    );
    expect(screen.getAllByText('agritech.marketplace.access.demoBadge').length).toBeGreaterThan(0);
    expect(screen.getByText('agritech.marketplace.access.demo')).toBeTruthy();
    expect(screen.queryByText('ignored-live-hint')).toBeNull();
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

    // Four stars, chosen through the radio the star glyph decorates.
    fireEvent.click(screen.getAllByRole('radio')[3]!);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.comment'), {
      target: { value: 'Reliable quality' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' }));

    expect(onReview).toHaveBeenCalledWith(seed, 4, 'Reliable quality');
    await waitFor(() => {
      expect(screen.getByText('agritech.marketplace.reviews.yourReview')).toBeTruthy();
    });
    // One review per purchase: the entry is gone rather than offering a second
    // submission the server would answer with a conflict.
    expect(screen.queryByLabelText('agritech.marketplace.reviews.comment')).toBeNull();
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

    fireEvent.click(screen.getAllByRole('radio')[4]!);
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
        feed="incoming"
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

  it('keeps restricted request and offer controls visible, disabled, and explained', () => {
    const onBuyerAccessAction = vi.fn();
    const onSellerAccessAction = vi.fn();
    const request: BuyerRequestViewDto = {
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-unverified',
      moderationStatus: 'approved',
      publicationId: 'request-unverified-publication',
      publicationStatus: 'published',
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
    const restricted = (feed: 'incoming' | 'mine') => (
      <MarketplaceRequests
        buyerAccessActionLabel="buyer-next"
        buyerAccessHint="buyer-prerequisite"
        feed={feed}
        isVerified={false}
        locale="en"
        myRequests={{ data: [request], status: 'ready' }}
        navigate={vi.fn()}
        offersByRequest={{ data: { [request.id]: [offer] }, status: 'ready' }}
        onBuyerAccessAction={onBuyerAccessAction}
        onChoose={vi.fn()}
        onCreate={vi.fn()}
        onOffer={vi.fn()}
        onRetry={vi.fn()}
        onSellerAccessAction={onSellerAccessAction}
        requests={{ data: [{ ...request, id: 'public-request-unverified' }], status: 'ready' }}
        role="seller"
        sellerAccessActionLabel="seller-next"
        sellerAccessHint="seller-prerequisite"
        t={t}
      />
    );
    const restrictedView = render(restricted('incoming'));

    expect(screen.getByText('buyer-prerequisite')).toBeTruthy();
    expect(screen.getByText('seller-prerequisite')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0]?.hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'buyer-next' }));
    fireEvent.click(screen.getByRole('button', { name: 'seller-next' }));
    expect(onBuyerAccessAction).toHaveBeenCalledOnce();
    expect(onSellerAccessAction).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('agritech.marketplace.orders.requestTitle')).toBeNull();

    restrictedView.rerender(restricted('mine'));
    expect(screen.getByRole('button', { name: 'agritech.marketplace.orders.choose' }).hasAttribute('disabled')).toBe(
      true,
    );
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
        feed="incoming"
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
      moderationStatus: 'approved',
      publicationId: 'request-owned-publication',
      publicationStatus: 'published',
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
      moderationStatus: 'approved',
      publicationId: 'request-with-offer-publication',
      publicationStatus: 'published',
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
      disputeEvidence: [
        {
          byteSize: 64,
          checksumSha256: 'second-checksum',
          createdAt: '2026-08-09T10:05:00.000Z',
          fileName: 'inspection.txt',
          id: 'evidence-without-simulation',
          mediaType: 'text/plain',
          providerMode: 'live' as const,
          providerName: 'document-store',
          revision: 1,
          simulation: false,
          uploadedByParty: 'buyer' as const,
        },
      ],
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
    fireEvent.submit(evidenceInput.closest('form')!);
    expect(onUploadDisputeEvidence).not.toHaveBeenCalled();
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

    // Each cabinet section owns its own failure. The overview reports the dashboard
    // read; the buying and account sections report the contract and sample reads
    // where those panels actually live, and each offers its own retry in place.
    expect(screen.getByText('agritech.marketplace.account.dashboardUnavailable')).toBeTruthy();
    expect(screen.queryByLabelText('agritech.marketplace.account.dashboard')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));

    account.rerender(
      <MarketplaceAccount
        cabinetSection="buying"
        contracts={{ data: [], status: 'error' }}
        dashboard={{ data: null, status: 'error' }}
        locale="en"
        myRequests={{ data: [], status: 'error' }}
        navigate={vi.fn()}
        onRetry={onRetry}
        samples={{ data: [], status: 'error' }}
        t={t}
        verification={{ data: null, status: 'empty' }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.account.contractsUnavailable')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.orders.unavailable')).toBeTruthy();

    account.rerender(
      <MarketplaceAccount
        cabinetSection="account"
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
    expect(screen.getByText('agritech.marketplace.samples.unavailable')).toBeTruthy();
    for (const retry of screen.getAllByRole('button', { name: 'ui.runtime.retry' })) {
      fireEvent.click(retry);
    }
    expect(onRetry).toHaveBeenCalledTimes(2);

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
    // One retry from the cabinet overview, one from its account section, one here.
    expect(onRetry).toHaveBeenCalledTimes(3);
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

  it('exercises the remaining cart, request, verification, account, and lifecycle state transitions', () => {
    const navigate = vi.fn();
    const cart: CartViewDto = {
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'cart-coverage',
      items: [
        { listingPublicationId: seed.id, quantity: 2, sourceKind: 'product' },
        { listingPublicationId: 'missing-listing', quantity: 1, sourceKind: 'product' },
      ],
      seller: { displayName: 'Seed cooperative', region: 'Samarqand' },
      status: 'open',
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const onUpdate = vi.fn();
    const cartView = render(
      <MarketplaceCart
        carts={{ data: [], status: 'loading' }}
        locale="en"
        navigate={navigate}
        onCheckout={vi.fn()}
        onUpdate={onUpdate}
        products={[seed]}
        t={t}
      />,
    );
    cartView.rerender(
      <MarketplaceCart
        carts={{ data: [], status: 'error' }}
        locale="en"
        navigate={navigate}
        onCheckout={vi.fn()}
        onUpdate={onUpdate}
        products={[seed]}
        t={t}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    cartView.rerender(
      <MarketplaceCart
        carts={{ data: [], status: 'empty' }}
        locale="en"
        navigate={navigate}
        onCheckout={vi.fn()}
        onUpdate={onUpdate}
        products={[seed]}
        t={t}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.hero.cta' }));
    cartView.rerender(
      <MarketplaceCart
        carts={{ data: [cart], status: 'ready' }}
        locale="en"
        navigate={navigate}
        onCheckout={vi.fn()}
        onUpdate={onUpdate}
        products={[seed]}
        t={t}
      />,
    );
    const onCheckoutAction = vi.fn();
    cartView.rerender(
      <MarketplaceCart
        canCheckout={false}
        carts={{ data: [cart], status: 'ready' }}
        checkoutActionLabel="complete-verification"
        checkoutHint="checkout-restricted"
        locale="en"
        navigate={navigate}
        onCheckout={vi.fn()}
        onCheckoutAction={onCheckoutAction}
        onUpdate={onUpdate}
        products={[seed]}
        t={t}
      />,
    );
    expect(screen.getByText('checkout-restricted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'complete-verification' }));
    expect(onCheckoutAction).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.cart.decrease' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.cart.increase' })[0]!);
    expect(onUpdate).toHaveBeenNthCalledWith(1, cart.id, seed.id, 1);
    expect(onUpdate).toHaveBeenNthCalledWith(2, cart.id, seed.id, 3);
    cartView.unmount();

    const publicRequest = {
      budgetUzs: 4_000_000,
      buyerDisplayName: 'Regional buyer',
      createdAt: '2026-08-09T10:00:00.000Z',
      deadline: '2026-09-01',
      id: 'request-coverage',
      product: 'Corn seed',
      region: 'Samarqand',
      requirements: 'Certified only',
      status: 'open' as const,
      title: 'Need corn seed',
      updatedAt: '2026-08-09T10:00:00.000Z',
      volume: '5 t',
    };
    const ownedRequest: BuyerRequestViewDto = {
      ...publicRequest,
      id: 'owned-coverage',
      moderationStatus: 'approved',
      publicationId: 'owned-coverage-publication',
      publicationStatus: 'published',
      status: 'offering',
    };
    const unpublishedOwnedRequest: BuyerRequestViewDto = {
      ...publicRequest,
      id: 'owned-coverage-unpublished',
      status: 'open',
    };
    const onCreate = vi.fn();
    const onOffer = vi.fn();
    const requestPanel = (overrides: Partial<Parameters<typeof MarketplaceRequests>[0]>) => (
      <MarketplaceRequests
        isVerified
        locale="en"
        myRequests={{ data: [], status: 'loading' }}
        navigate={navigate}
        offersByRequest={{ data: {}, status: 'loading' }}
        onChoose={vi.fn()}
        onCreate={onCreate}
        onOffer={onOffer}
        onRetry={vi.fn()}
        requests={{ data: [], status: 'loading' }}
        role="farmer"
        t={t}
        {...overrides}
      />
    );
    const requestView = render(requestPanel({ feed: 'mine' }));
    requestView.rerender(
      requestPanel({
        feed: 'mine',
        myRequests: { data: [ownedRequest], status: 'ready' },
        offersByRequest: { data: { [ownedRequest.id]: [] }, status: 'empty' },
        requests: { data: [publicRequest], status: 'ready' },
      }),
    );
    expect(screen.getByText('agritech.marketplace.orders.noOffers')).toBeTruthy();
    requestView.rerender(
      requestPanel({
        feed: 'incoming',
        myRequests: { data: [ownedRequest], status: 'ready' },
        offersByRequest: { data: { [ownedRequest.id]: [] }, status: 'empty' },
        requests: { data: [publicRequest], status: 'ready' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.price'), { target: { value: '3000000' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.product.delivery'), {
      target: { value: 'seller_delivery' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.contract.deliveryPrice'), {
      target: { value: '250000' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: 'Truck delivery' },
    });
    fireEvent.click(
      within(screen.getByLabelText('agritech.marketplace.orders.price').closest('form')!).getByRole('button', {
        name: 'agritech.marketplace.cancel',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.makeOffer' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.price'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: 'Temporary note' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deliveryNote'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.submitOffer' }));
    expect(onOffer).toHaveBeenCalledWith(publicRequest, expect.objectContaining({ priceUzs: 1 }));

    // The wizard keeps every fieldset mounted, so each field is reachable whichever
    // step is on screen, and nothing typed earlier is dropped on the way to publish.
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0]!);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.requestTitle'), {
      target: { value: 'Complete request' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.product'), { target: { value: 'Seed' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.volume'), { target: { value: '10 t' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.next' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.region'), { target: { value: 'Buxoro' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deadline'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.next' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.budget'), { target: { value: '7000000' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.requirements'), {
      target: { value: 'Certified' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.previous' }));
    fireEvent.click(
      within(screen.getByLabelText('agritech.marketplace.orders.requestTitle').closest('form')!).getByRole('button', {
        name: 'agritech.marketplace.cancel',
      }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' })[0]!);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.product'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.volume'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deadline'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.budget'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.requirements'), { target: { value: '' } });
    fireEvent.submit(screen.getByLabelText('agritech.marketplace.orders.requestTitle').closest('form')!);
    expect(onCreate).toHaveBeenLastCalledWith(expect.objectContaining({ deadline: undefined }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.close' }));

    const requestOffer = (id: string, priceUzs: number): OfferViewDto => ({
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryTerms: 'pickup',
      id,
      priceUzs,
      requestPublicId: 'owned-coverage-publication',
      seller: { displayName: `Seller ${id}`, region: 'Tashkent' },
      status: 'pending',
    });
    const walkedOffers = {
      data: {
        [ownedRequest.id]: [
          {
            ...requestOffer('expensive', 3_000_000),
            deliveryDays: 4,
            deliveryPriceUzs: 250_000,
            status: 'accepted' as const,
          },
          requestOffer('cheap', 1_000_000),
        ],
      },
      status: 'ready' as const,
    };
    requestView.rerender(
      requestPanel({
        feed: 'incoming',
        myRequests: { data: [ownedRequest], status: 'ready' },
        offersByRequest: walkedOffers,
        requests: { data: [], status: 'error' },
      }),
    );
    expect(screen.getByText('agritech.marketplace.orders.unavailable')).toBeTruthy();
    requestView.rerender(
      requestPanel({
        feed: 'mine',
        myRequests: { data: [ownedRequest], status: 'ready' },
        offersByRequest: walkedOffers,
        requests: { data: [], status: 'error' },
      }),
    );
    expect(screen.getByText(/Seller cheap/u)).toBeTruthy();
    requestView.rerender(
      requestPanel({
        feed: 'mine',
        myRequests: { data: [], status: 'error' },
        offersByRequest: { data: {}, status: 'empty' },
        requests: { data: [], status: 'empty' },
        role: 'buyer',
      }),
    );
    expect(screen.getByText('agritech.marketplace.orders.unavailable')).toBeTruthy();
    requestView.rerender(
      requestPanel({
        feed: 'mine',
        myRequests: { data: [], status: 'empty' },
        offersByRequest: { data: {}, status: 'empty' },
        requests: { data: [], status: 'empty' },
        role: 'buyer',
      }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' }).at(-1)!);
    requestView.rerender(
      requestPanel({
        feed: 'mine',
        isVerified: false,
        myRequests: { data: [], status: 'empty' },
        offersByRequest: { data: {}, status: 'empty' },
        requests: { data: [], status: 'empty' },
        role: 'buyer',
      }),
    );
    requestView.rerender(
      requestPanel({
        buyerAccessHint: 'buyer-prerequisite',
        feed: 'incoming',
        isVerified: false,
        myRequests: { data: [], status: 'empty' },
        offersByRequest: { data: {}, status: 'empty' },
        requests: { data: [publicRequest], status: 'ready' },
        role: 'seller',
        sellerAccessHint: 'seller-prerequisite',
      }),
    );
    expect(screen.getByText('buyer-prerequisite')).toBeTruthy();
    expect(screen.getByText('seller-prerequisite')).toBeTruthy();
    fireEvent.submit(screen.getByLabelText('agritech.marketplace.orders.requestTitle').closest('form')!);
    expect(navigate).toHaveBeenCalledWith('/verification');

    // A single request is its own view: facts, the five-stage scale, and the offers.
    requestView.rerender(
      requestPanel({
        myRequests: { data: [ownedRequest], status: 'ready' },
        offersByRequest: walkedOffers,
        requestId: ownedRequest.id,
        requests: { data: [], status: 'empty' },
        role: 'buyer',
      }),
    );
    expect(screen.getByRole('heading', { level: 1, name: ownedRequest.title })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'agritech.marketplace.orders.progress' })).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.orders.howItWorksHint')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.orders.backToMine' }));
    expect(navigate).toHaveBeenCalledWith('/requests');
    requestView.rerender(
      requestPanel({
        myRequests: { data: [ownedRequest], status: 'ready' },
        offersByRequest: { data: {}, status: 'empty' },
        requestId: 'missing-request',
        requests: { data: [], status: 'empty' },
        role: 'buyer',
      }),
    );
    expect(screen.getByText('agritech.marketplace.orders.notFound')).toBeTruthy();

    // An unpublished request says it is awaiting moderation instead of reading as a
    // published request with no offers.
    requestView.rerender(
      requestPanel({
        myRequests: { data: [unpublishedOwnedRequest], status: 'ready' },
        offersByRequest: { data: {}, status: 'empty' },
        requestId: unpublishedOwnedRequest.id,
        requests: { data: [], status: 'empty' },
        role: 'buyer',
      }),
    );
    expect(screen.getByText('agritech.marketplace.orders.awaitingModeration')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.orders.awaitingModerationHint')).toBeTruthy();
    requestView.unmount();

    const verified = {
      createdAt: '2026-08-09T10:00:00.000Z',
      documents: [],
      id: 'verification-terminal',
      identityAssurance: 'mock' as const,
      level: 'verified' as const,
      oneIdLinked: true,
      providerMode: 'mock' as const,
      revision: 2,
      role: 'buyer' as const,
      simulation: false,
      status: 'verified' as const,
      step: 'complete' as const,
      updatedAt: '2026-08-09T10:00:00.000Z',
    };
    const verificationView = render(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: readyVerificationProviders, status: 'ready' }}
        t={t}
        verification={{ data: verified, status: 'ready' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.account.title' }));
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: readyVerificationProviders, status: 'ready' }}
        t={t}
        verification={{ data: { ...verified, simulation: true }, status: 'ready' }}
      />,
    );
    expect(screen.getByText(/agritech\.marketplace\.verify\.simulationDisclosure/u)).toBeTruthy();
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: readyVerificationProviders, status: 'ready' }}
        t={t}
        verification={{ data: { ...verified, simulation: true, status: 'pending', step: 'review' }, status: 'ready' }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.verify.noFixedReviewTime')).toBeTruthy();
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: readyVerificationProviders, status: 'ready' }}
        t={t}
        verification={{
          data: { ...verified, simulation: false, status: 'pending', step: 'review' },
          status: 'ready',
        }}
      />,
    );
    expect(screen.queryByText('agritech.marketplace.verify.simulationDisclosure')).toBeNull();
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: readyVerificationProviders, status: 'ready' }}
        t={t}
        verification={{ data: { ...verified, status: 'unexpected' as never }, status: 'ready' }}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: null, status: 'loading' }}
        t={t}
        verification={{ data: null, status: 'loading' }}
      />,
    );
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: readyVerificationProviders, status: 'ready' }}
        t={t}
        verification={{
          data: { ...verified, level: 'basic', status: 'none', step: 'identity' },
          status: 'ready',
        }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.account.role.none')).toBeTruthy();
    const emptyUpload = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(emptyUpload, 'files', { configurable: true, value: [] });
    fireEvent.change(emptyUpload);
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: null, status: 'idle' }}
        t={t}
        verification={{ data: { ...verified, level: 'basic', status: 'none', step: 'identity' }, status: 'ready' }}
      />,
    );
    expect(screen.getByRole('status')).toBeTruthy();
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: null, status: 'error' }}
        t={t}
        verification={{ data: { ...verified, level: 'basic', status: 'none', step: 'identity' }, status: 'ready' }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.verify.providerUnavailableDescription')).toBeTruthy();
    const unavailableProviders: MarketplaceProviderReadinessDto = {
      ...readyVerificationProviders,
      oneId: { ...readyVerificationProviders.oneId, ready: false },
      verificationDocuments: { ...readyVerificationProviders.verificationDocuments, ready: false },
    };
    verificationView.rerender(
      <MarketplaceVerification
        navigate={navigate}
        onLinkIdentity={vi.fn()}
        onRetry={vi.fn()}
        onStart={vi.fn()}
        onSubmit={vi.fn()}
        onUploadDocument={vi.fn()}
        readiness={{ data: unavailableProviders, status: 'ready' }}
        t={t}
        verification={{
          data: {
            ...verified,
            level: 'basic',
            oneIdLinked: false,
            rejectionReason: undefined,
            simulation: false,
            status: 'rejected',
            step: 'identity',
          },
          status: 'ready',
        }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.verify.rejectedDescription')).toBeTruthy();
    verificationView.unmount();

    const contract: ContractViewDto = {
      actorParty: 'buyer',
      amountUzs: 2_500_000,
      buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
      createdAt: '2026-08-09T10:00:00.000Z',
      deliveryPriceUzs: 0,
      deliveryTerms: 'pickup',
      factoringEnabled: false,
      id: 'account-contract',
      lines: [],
      revision: 1,
      sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
      sourceType: 'cart_checkout',
      status: 'active',
      subject: seed.name,
      updatedAt: '2026-08-09T10:03:00.000Z',
    };
    // The cabinet aggregates only what the dashboard actually returns, so the
    // fixture carries the real activity window and recent-deal members rather than
    // a partial object the panels would have to guess around.
    const buyerDashboard: MarketplaceRoleDashboardDto = {
      buyer: {
        activeDeals: 2,
        completedDeals: 3,
        completedSpendUzs: 5_000_000,
        openCarts: 1,
        openPurchaseRequests: 4,
      },
      generatedAt: '2026-08-19T10:00:00.000Z',
      monthlyActivity: [
        { completedPurchases: 1, completedSales: 0, month: '2026-07', purchaseSpendUzs: 2_000_000, salesRevenueUzs: 0 },
        { completedPurchases: 2, completedSales: 0, month: '2026-08', purchaseSpendUzs: 3_000_000, salesRevenueUzs: 0 },
      ],
      recentDeals: [
        {
          amountUzs: 2_500_000,
          contractId: contract.id,
          counterpartyName: 'Seed cooperative',
          side: 'buyer',
          status: 'active',
          updatedAt: '2026-08-09T10:03:00.000Z',
        },
      ],
      role: 'buyer',
    };
    const sellerDashboard: MarketplaceRoleDashboardDto = {
      generatedAt: '2026-08-19T10:00:00.000Z',
      monthlyActivity: buyerDashboard.monthlyActivity.map((month) => ({
        ...month,
        completedPurchases: 0,
        completedSales: month.completedPurchases,
        purchaseSpendUzs: 0,
        salesRevenueUzs: month.purchaseSpendUzs,
      })),
      recentDeals: [],
      role: 'seller',
      seller: {
        activeDeals: 1,
        activeListings: 4,
        completedDeals: 2,
        completedRevenueUzs: 5_000_000,
        offerConversionBps: 3333,
        pendingOffers: 3,
        topListings: [],
      },
    };
    const account = render(
      <MarketplaceAccount
        contracts={{ data: [contract], status: 'ready' }}
        dashboard={{ data: buyerDashboard, status: 'ready' }}
        locale="en"
        navigate={navigate}
        onRetry={vi.fn()}
        samples={{ data: [], status: 'loading' }}
        t={t}
        verification={{ data: null, status: 'empty' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verification' }));
    expect(screen.getByLabelText('agritech.marketplace.account.dashboard')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Seed cooperative/u }));
    expect(navigate).toHaveBeenCalledWith(`/contracts/${contract.id}`);

    account.rerender(
      <MarketplaceAccount
        cabinetSection="buying"
        contracts={{ data: [contract], status: 'ready' }}
        dashboard={{ data: buyerDashboard, status: 'ready' }}
        locale="en"
        myRequests={{ data: [], status: 'empty' }}
        navigate={navigate}
        onRetry={vi.fn()}
        samples={{ data: [], status: 'empty' }}
        t={t}
        verification={{ data: verified, status: 'ready' }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.orders.empty')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(seed.name, 'u') })[0]!);
    expect(navigate).toHaveBeenCalledWith(`/contracts/${contract.id}`);

    // The same contract is the buyer's; a seller-scoped panel must not claim it.
    account.rerender(
      <MarketplaceAccount
        cabinetSection="selling"
        contracts={{ data: [contract], status: 'ready' }}
        dashboard={{ data: sellerDashboard, status: 'ready' }}
        locale="en"
        navigate={navigate}
        onRetry={vi.fn()}
        publicRequests={{ data: [], status: 'empty' }}
        samples={{ data: [], status: 'empty' }}
        t={t}
        verification={{ data: verified, status: 'ready' }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.cabinet.selling.noContracts')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.cabinet.stat.pendingOffers')).toBeTruthy();

    account.rerender(
      <MarketplaceAccount
        cabinetSection="account"
        contracts={{ data: [], status: 'empty' }}
        dashboard={{ data: null, status: 'loading' }}
        locale="en"
        navigate={navigate}
        onRetry={vi.fn()}
        samples={{
          data: [
            {
              actorRole: 'requester',
              createdAt: '2026-08-09T10:00:00.000Z',
              delivery: { itemPriceUzs: 0, method: 'pickup', requesterPays: true },
              id: 'account-sample',
              listing: {
                id: seed.id,
                kind: 'product',
                rating: { average: 4.6, count: 12 },
                sampleAvailable: true,
                seller: { displayName: 'Seed cooperative', id: seed.supplierId },
                title: seed.name,
              },
              policyVersion: 1,
              revision: 1,
              seasonKey: '2026-Q1',
              status: 'received',
              updatedAt: '2026-08-09T10:00:00.000Z',
            },
          ],
          status: 'ready',
        }}
        t={t}
        verification={{ data: verified, status: 'ready' }}
      />,
    );
    expect(screen.getByText(seed.name)).toBeTruthy();
    account.unmount();

    const lifecycleCases: LifecycleCoverageScenario[] = [
      { actorParty: 'seller', factoring: false, fulfillment: 'ready', settlement: 'awaiting_buyer_confirmation' },
      { actorParty: 'seller', factoring: false, fulfillment: 'in_progress', settlement: 'awaiting_buyer_confirmation' },
      { actorParty: 'buyer', factoring: false, fulfillment: 'delivered', settlement: 'awaiting_buyer_confirmation' },
      { actorParty: 'seller', factoring: false, fulfillment: 'completed', settlement: 'buyer_confirmed' },
      { actorParty: 'buyer', factoring: true, fulfillment: 'completed', settlement: 'ready_to_request' },
      { actorParty: 'seller', factoring: true, fulfillment: 'completed', settlement: 'approved' },
      { actorParty: 'buyer', factoring: true, fulfillment: 'completed', settlement: 'seller_paid' },
      { actorParty: 'buyer', factoring: true, fulfillment: 'completed', settlement: 'buyer_repaid' },
      {
        actorParty: 'buyer',
        factoring: true,
        fulfillment: 'completed',
        settlement: 'awaiting_consents',
      },
      {
        actorParty: 'seller',
        factoring: true,
        fulfillment: 'completed',
        settlement: 'awaiting_consents',
      },
      {
        actorParty: 'buyer',
        alreadyConsented: true,
        factoring: true,
        fulfillment: 'completed',
        hasAction: false,
        settlement: 'awaiting_consents',
      },
      {
        actorParty: 'seller',
        alreadyConsented: true,
        factoring: true,
        fulfillment: 'completed',
        hasAction: false,
        settlement: 'awaiting_consents',
      },
      {
        actorParty: 'seller',
        factoring: false,
        fulfillment: 'completed',
        hasAction: false,
        settlement: 'awaiting_buyer_confirmation',
      },
      {
        actorParty: 'seller',
        factoring: true,
        fulfillment: 'completed',
        hasAction: false,
        settlement: 'rejected',
      },
    ];
    for (const [index, scenario] of lifecycleCases.entries()) {
      const lifecycle = contractLifecycle(`lifecycle-${index}`);
      configureLifecycleCoverage(lifecycle, scenario, index);
      const onAdvanceLifecycle = vi.fn();
      const lifecycleView = render(
        <MarketplaceContract
          contract={{
            ...contract,
            actorParty: scenario.actorParty,
            factoringEnabled: scenario.factoring,
            id: lifecycle.contractId,
          }}
          identityStatus="verified"
          lifecycle={{ data: lifecycle, status: 'ready' }}
          locale="en"
          navigate={navigate}
          onAdvanceLifecycle={onAdvanceLifecycle}
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
      const advance = screen.queryByRole('button', { name: 'agritech.marketplace.contract.settlement.advance' });
      if (scenario.hasAction === false) {
        expect(advance).toBeNull();
      } else {
        fireEvent.click(advance!);
        expect(onAdvanceLifecycle).toHaveBeenCalledOnce();
      }
      lifecycleView.unmount();
    }

    const contractStates = render(
      <MarketplaceContract
        identityStatus="verified"
        lifecycle={{ data: null, status: 'empty' }}
        locale="en"
        navigate={navigate}
        onAdvanceLifecycle={vi.fn()}
        onDownloadArtifact={vi.fn()}
        onOpenDispute={vi.fn()}
        onQuote={vi.fn()}
        onRefreshArtifact={vi.fn()}
        onRetry={vi.fn()}
        onSign={vi.fn()}
        onUploadDisputeEvidence={vi.fn()}
        status="loading"
        t={t}
      />,
    );
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();
    contractStates.rerender(
      <MarketplaceContract
        identityStatus="verified"
        lifecycle={{ data: null, status: 'empty' }}
        locale="en"
        navigate={navigate}
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
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.back' }));
    const legacyContract: ContractViewDto = { ...contract, status: 'legacy_review_required' };
    contractStates.rerender(
      <MarketplaceContract
        contract={legacyContract}
        identityStatus="verified"
        lifecycle={{ data: contractLifecycle(legacyContract.id), status: 'ready' }}
        locale="en"
        navigate={navigate}
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
    expect(screen.getByText('agritech.marketplace.contract.legacyReviewRequiredDescription')).toBeTruthy();
    fireEvent.click(document.querySelector<HTMLButtonElement>('.dh-contract-page .dh-back')!);

    const quoteContract: ContractViewDto = {
      ...contract,
      actorParty: 'seller',
      deliveryPriceUzs: undefined,
      deliveryTerms: 'seller_delivery',
      id: 'contract-full-quote',
      status: 'draft',
    };
    const onQuote = vi.fn();
    contractStates.rerender(
      <MarketplaceContract
        contract={quoteContract}
        identityStatus="verified"
        lifecycle={{ data: contractLifecycle(quoteContract.id), status: 'ready' }}
        locale="en"
        navigate={navigate}
        onAdvanceLifecycle={vi.fn()}
        onDownloadArtifact={vi.fn()}
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
    fireEvent.change(screen.getByLabelText('agritech.marketplace.contract.deliveryPrice'), {
      target: { value: '250000' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: 'Refrigerated truck' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deliveryNote'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.timing'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.orders.deliveryNote'), {
      target: { value: 'Refrigerated truck' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.contract.saveDeliveryQuote' }));
    expect(onQuote).toHaveBeenCalledWith(quoteContract, {
      deliveryDays: 3,
      deliveryNote: 'Refrigerated truck',
      deliveryPriceUzs: 250_000,
    });
    const agreementContract: ContractViewDto = {
      ...contract,
      deliveryDays: 5,
      deliveryNote: undefined,
      deliveryPriceUzs: undefined,
      deliveryTerms: 'by_agreement',
      id: 'contract-by-agreement',
      sourceType: undefined,
    };
    contractStates.rerender(
      <MarketplaceContract
        contract={agreementContract}
        identityStatus="verified"
        lifecycle={{ data: contractLifecycle(agreementContract.id), status: 'ready' }}
        locale="en"
        navigate={navigate}
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
    expect(screen.getByText('agritech.marketplace.contract.source.direct')).toBeTruthy();
    contractStates.rerender(
      <MarketplaceContract
        contract={contract}
        identityStatus="verified"
        lifecycle={{ data: null, status: 'empty' }}
        locale="en"
        navigate={navigate}
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
    expect(screen.getByText('agritech.marketplace.contract.settlement.notStarted')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.contract.settlement.notStartedDescription')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.error')).toBeNull();
    contractStates.unmount();
  });

  it('keeps grounded AI informational and returns focus after closing', async () => {
    const noMatch = aiAnswer('ai-no-match');
    noMatch.response.recommendations = [];
    const onAsk = vi
      .fn()
      .mockResolvedValueOnce(aiAnswer('ai-1'))
      .mockRejectedValueOnce(new Error('assistant unavailable'))
      .mockResolvedValueOnce(noMatch);
    const onOpenProduct = vi.fn();

    render(<MarketplaceAi locale="en" onAsk={onAsk} onOpenProduct={onOpenProduct} products={[seed]} t={t} />);

    const launcher = screen.getByRole('button', { name: 'agritech.marketplace.ai.open' });
    fireEvent.click(launcher);
    const question = screen.getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' });
    expect(document.activeElement).toBe(question);
    fireEvent.change(question, { target: { value: 'seed' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));

    expect(await screen.findByText('agritech.marketplace.ai.result.recommendation')).toBeTruthy();
    fireEvent.submit(question.closest('form')!);
    expect(onAsk).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.q.beginner' }));
    expect(await screen.findByText('agritech.marketplace.ai.unavailable')).toBeTruthy();
    expect(screen.queryByText('Unlocalized server explanation')).toBeNull();
    fireEvent.change(question, { target: { value: 'unavailable crop' } });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.ai.send' }));
    expect(await screen.findByText('agritech.marketplace.ai.noMatch')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(seed.name, 'u') })[0]!);
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

      const launcher = screen.getByRole('button', { name: 'agritech.marketplace.ai.open' });
      fireEvent.click(launcher);
      const dialog = screen.getByRole('dialog', { name: 'agritech.marketplace.ai.title' });
      const input = within(dialog).getByRole('textbox', { name: 'agritech.marketplace.ai.placeholder' });
      const closeButton = within(dialog).getByRole('button', { name: 'agritech.marketplace.ai.close' });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(document.activeElement).toBe(input);

      fireEvent.keyDown(globalThis, { key: 'ArrowDown' });
      fireEvent.keyDown(globalThis, { key: 'Tab' });
      expect(document.activeElement).toBe(closeButton);
      fireEvent.keyDown(globalThis, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(input);
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
      launcher.focus();
      fireEvent.keyDown(globalThis, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(focusable.at(-1));
      focusable[0]?.focus();
      fireEvent.keyDown(globalThis, { key: 'Tab' });
      focusable.at(-1)?.focus();
      fireEvent.keyDown(globalThis, { key: 'Tab' });
      expect(document.activeElement).toBe(focusable[0]);
      for (const element of dialog.querySelectorAll<HTMLElement>('button, input')) {
        element.hidden = true;
      }
      fireEvent.keyDown(globalThis, { key: 'Tab' });
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

    cleanup();
    const defaultAnswer = aiAnswer('ai-default-confirmation');
    defaultAnswer.response.starterCartPreview = {
      sellerPartitions: [{ listingPublicationIds: [seed.id], sellerPublicId: seed.supplierId }],
      status: 'requires_confirmation',
    };
    render(
      <MarketplaceAi
        locale="en"
        onAsk={vi.fn().mockResolvedValue(defaultAnswer)}
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
    const defaultConfirm = await screen.findByRole('button', {
      name: /agritech.marketplace.ai.starterCart.confirm/u,
    });
    fireEvent.click(defaultConfirm);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /agritech.marketplace.ai.starterCart.confirm/u })).toBeTruthy();
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
