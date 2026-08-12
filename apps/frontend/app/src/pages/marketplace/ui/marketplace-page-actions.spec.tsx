// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-EXPERIENCE-026
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractLifecycleDto,
  ContractViewDto,
  MarketplaceAiConsultationDto,
  MarketplaceReviewDto,
  MarketplaceSampleDto,
  OfferViewDto,
  VerificationViewDto,
} from '@app/frontend-api-client';
import type { MarketplaceData } from '../model/use-marketplace-data';
import type {
  MarketplaceContractDeliveryQuoteInput,
  MarketplaceContractLifecycleAction,
  MarketplaceCreateRequestInput,
  MarketplaceOfferInput,
} from './marketplace-commerce';
import { MarketplacePage, type MarketplacePageProps } from './marketplace-page';
import type { MarketplaceListing, MarketplaceRequestFeedItem } from './marketplace-ui';

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
    requestOptions: { headers: { 'x-test': 'marketplace-page-actions' } },
    views: {} as Record<string, unknown>,
  };
});

vi.mock('@app/frontend-runtime', () => ({
  observer: <T,>(component: T): T => component,
  useI18n: () => ({ locale: 'en', t: (key: string) => key }),
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
  MarketplaceCatalog: (props: unknown) => {
    testState.views.catalog = props;
    return <div data-testid="catalog-view" />;
  },
  MarketplaceEmpty: (props: unknown) => {
    testState.views.empty = props;
    return <div data-testid="empty-view" />;
  },
  MarketplaceFavorites: (props: unknown) => {
    testState.views.favorites = props;
    return <div data-testid="favorites-view" />;
  },
  MarketplaceHome: (props: unknown) => {
    testState.views.home = props;
    return <div data-testid="home-view" />;
  },
  MarketplaceProductDetail: (props: unknown) => {
    testState.views.product = props;
    return <div data-testid="product-view" />;
  },
  MarketplaceSellerProfile: (props: unknown) => {
    testState.views.seller = props;
    return <div data-testid="seller-view" />;
  },
  MarketplaceSkeleton: () => <div data-testid="marketplace-skeleton" />,
}));

vi.mock('./marketplace-commerce', () => ({
  MarketplaceAccount: (props: unknown) => {
    testState.views.account = props;
    return <div data-testid="account-view">{(props as { management?: React.ReactNode }).management}</div>;
  },
  MarketplaceCart: (props: unknown) => {
    testState.views.cart = props;
    return <div data-testid="cart-view" />;
  },
  MarketplaceContract: (props: unknown) => {
    testState.views.contract = props;
    return <div data-testid="contract-view" />;
  },
  MarketplaceRequests: (props: unknown) => {
    testState.views.requests = props;
    return <div data-testid="requests-view" />;
  },
  MarketplaceVerification: (props: unknown) => {
    testState.views.verification = props;
    return <div data-testid="verification-view" />;
  },
}));

vi.mock('./marketplace-management', () => ({
  MarketplaceUserManagement: (props: unknown) => {
    testState.views.management = props;
    return <div data-testid="management-view" />;
  },
}));

vi.mock('./marketplace-ai', () => ({
  MarketplaceAi: (props: unknown) => {
    testState.views.ai = props;
    return <div data-testid="ai-view" />;
  },
}));

const now = '2026-08-09T10:00:00.000Z';

const product: MarketplaceListing = {
  category: 'seed',
  description: 'Certified corn seed',
  id: 'listing-publication-1',
  images: [],
  kind: 'product',
  name: 'Corn seed',
  priceUzs: 1_250_000,
  promoted: false,
  provenance: 'live',
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-public-1',
  supplierName: 'Seed cooperative',
  transactional: true,
  unit: 't',
};

const request: BuyerRequestViewDto = {
  createdAt: now,
  id: 'request-public-1',
  region: 'Samarqand',
  status: 'offering',
  title: 'Need certified corn seed',
  updatedAt: now,
};

const offer: OfferViewDto = {
  createdAt: now,
  deliveryPriceUzs: 250_000,
  deliveryTerms: 'seller_delivery',
  id: 'offer-1',
  priceUzs: 4_500_000,
  requestPublicId: request.id,
  seller: { displayName: 'Seed cooperative', region: 'Tashkent' },
  status: 'pending',
};

const cart: CartViewDto = {
  createdAt: now,
  id: 'cart-1',
  items: [{ listingPublicationId: product.id, quantity: 1, sourceKind: 'product' }],
  seller: { displayName: product.supplierName, region: product.region },
  status: 'open',
  updatedAt: now,
};

const contract: ContractViewDto = {
  actorParty: 'buyer',
  amountUzs: product.priceUzs,
  buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
  buyerSignedAt: now,
  createdAt: now,
  deliveryPriceUzs: 0,
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  id: 'contract-active',
  lines: [
    {
      lineTotalUzs: product.priceUzs,
      name: product.name,
      quantity: 1,
      sourceKind: 'product',
      sourcePublicationId: product.id,
      sourceRevision: 1,
      unit: product.unit,
      unitPriceUzs: product.priceUzs,
    },
  ],
  revision: 3,
  sellerPartySnapshot: { legalName: product.supplierName, region: 'Tashkent' },
  sellerSignedAt: now,
  signedAt: now,
  sourceType: 'cart_checkout',
  status: 'active',
  subject: product.name,
  updatedAt: now,
};

const completedContract: ContractViewDto = {
  ...contract,
  id: 'contract-completed',
  status: 'completed',
};

const review: MarketplaceReviewDto = {
  assetReferences: [],
  comment: 'Reliable seed quality',
  createdAt: now,
  id: 'review-1',
  listingPublicationId: product.id,
  rating: 5,
  revision: 2,
  updatedAt: now,
  verifiedDeal: true,
};

const consultation: MarketplaceAiConsultationDto = {
  answer: 'catalog_match',
  createdAt: now,
  id: 'consultation-1',
  kind: 'recommendation',
  listingPublicationIds: [product.id],
  question: 'Which seed is available?',
  response: {
    explanationCodes: ['grounded_at_consultation_time'],
    recommendations: [],
    starterCartPreview: { sellerPartitions: [], status: 'unavailable' },
  },
  updatedAt: now,
};

const sample: MarketplaceSampleDto = {
  actorRole: 'seller',
  createdAt: now,
  delivery: { itemPriceUzs: 0, method: 'pickup', requesterPays: true },
  id: 'sample-1',
  listing: {
    id: product.id,
    kind: 'product',
    sampleAvailable: true,
    seller: { displayName: product.supplierName, id: product.supplierId },
    title: product.name,
  },
  policyVersion: 1,
  revision: 4,
  seasonKey: '2026-Q1',
  status: 'requested',
  updatedAt: now,
};

const verification: VerificationViewDto = {
  createdAt: now,
  documents: [],
  id: 'verification-1',
  identityAssurance: 'mock',
  level: 'verified',
  oneIdLinked: true,
  providerMode: 'mock',
  revision: 5,
  role: 'farmer',
  simulation: true,
  status: 'verified',
  step: 'complete',
  updatedAt: now,
};

const lifecycle = (contractId: string): ContractLifecycleDto => ({
  artifact: {
    contractId,
    createdAt: now,
    documentKey: `contracts/${contractId}.pdf`,
    providerMode: 'mock',
    revision: 1,
    simulation: true,
    updatedAt: now,
  },
  contractId,
  disputeEvidence: [],
  fulfillment: { createdAt: now, revision: 1, status: 'awaiting_settlement', updatedAt: now },
  notificationIntents: [],
  reputationSignals: [],
  reviewEligibility: { eligible: false, sourceCount: 0 },
  settlement: {
    amountUzs: product.priceUzs,
    createdAt: now,
    currency: 'UZS',
    kind: 'DirectPaymentSettlementDto',
    latestProviderMode: 'mock',
    reconciliationState: 'clear',
    revision: 1,
    simulation: true,
    status: 'awaiting_buyer_confirmation',
    updatedAt: now,
  },
  settlementEvents: [],
  signatures: [],
  timeline: [],
});

const ready = <T,>(data: T) => ({ data, status: 'ready' as const });
const empty = <T,>(data: T) => ({ data, status: 'empty' as const });

const buildMarketplaceData = (refresh: ReturnType<typeof vi.fn>): MarketplaceData => ({
  aiConsultations: ready([consultation]),
  auth: 'signed-in',
  carts: ready([cart]),
  catalog: ready([product]),
  contracts: ready([contract, completedContract]),
  dashboard: empty(null),
  favorites: ready([
    {
      createdAt: now,
      listing: {
        id: product.id,
        kind: 'product',
        sampleAvailable: true,
        seller: { displayName: product.supplierName, id: product.supplierId },
        title: product.name,
      },
    },
  ]),
  myRequests: ready([request]),
  notifications: empty([]),
  offersByRequest: ready({ [request.id]: [offer] }),
  ownedListingPublications: ready([
    {
      id: product.id,
      kind: 'listing',
      moderationStatus: 'approved',
      revision: 3,
      section: 'seeds',
      sellerPublicId: product.supplierId,
      sourceKind: 'product',
      status: 'published',
      title: product.name,
      updatedAt: now,
    },
  ]),
  ownedRequestPublications: ready([
    {
      buyerDisplayName: 'Buyer cooperative',
      id: request.id,
      kind: 'request',
      moderationStatus: 'approved',
      revision: 1,
      status: 'published',
      title: request.title,
      updatedAt: now,
    },
  ]),
  partners: ready([
    {
      createdAt: now,
      id: 'buyer-partner',
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
    {
      createdAt: now,
      id: 'supplier-partner',
      kind: 'supplier',
      legalName: product.supplierName,
      ownerUserId: 'supplier-user',
      phone: '+998901234568',
      region: 'Tashkent',
      status: 'approved',
      taxId: '987654321',
      tenantId: 'tenant-1',
      updatedAt: now,
    },
  ]),
  produceListings: ready([
    {
      availableFrom: now,
      availableQuantityKg: 500,
      availableUntil: '2026-09-09T10:00:00.000Z',
      createdAt: now,
      crop: 'Corn',
      farmerId: 'supplier-user',
      grade: 'A',
      id: 'produce-1',
      pricePerKgUzs: 5_000,
      quantityKg: 500,
      region: 'Samarqand',
      sampleAvailable: true,
      status: 'active',
      tenantId: 'tenant-1',
      updatedAt: now,
    },
  ]),
  promotionPlans: ready([{ code: 'catalog_7d', currency: 'UZS', durationDays: 7, priceUzs: 100_000 }]),
  promotions: ready([
    {
      activatedAt: now,
      activationReference: 'activation-reference-1',
      createdAt: now,
      currency: 'UZS',
      endsAt: '2026-08-16T10:00:00.000Z',
      id: 'promotion-1',
      listingPublicId: product.id,
      planCode: 'catalog_7d',
      priceUzs: 100_000,
      revision: 1,
      sellerPartnerId: 'supplier-partner',
      startsAt: now,
      status: 'active',
      updatedAt: now,
    },
  ]),
  providerReadiness: ready(
    Object.fromEntries(
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
          providerName: 'test',
          ready: true,
          reconciliation: 'idempotent-retry',
          simulation: true,
          timeoutMs: 5_000,
        },
      ]),
    ) as MarketplaceData['providerReadiness']['data'],
  ),
  refresh,
  requests: ready([request as MarketplaceRequestFeedItem]),
  sampleUsage: ready({ limit: 5, period: '2026', policyVersion: 1, remaining: 4, used: 1 }),
  samples: ready([sample]),
  selectedListing: ready(product),
  seller: empty(null),
  sellerCatalog: ready([product]),
  supplierProducts: ready([
    {
      category: 'seed',
      description: product.description,
      id: 'source-product-1',
      name: product.name,
      partnerId: 'supplier-partner',
      priceUzs: product.priceUzs,
      region: product.region,
      sampleAvailable: true,
      status: 'active',
      stockQuantity: product.stockQuantity,
      unit: product.unit,
    },
  ]),
  verification: ready(verification),
});

const apiSuccess = <T,>(data: T) => ({ data: { data }, response: new Response() });
const apiFailure = (status: number) => ({
  error: { detail: `request failed with ${status}` },
  response: new Response(null, { status }),
});

const deferred = <T = unknown,>() => {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const apiMock = (name: string): ReturnType<typeof vi.fn> => testState.api[name];

const viewProps = <T,>(name: string): T => {
  const props = testState.views[name];
  if (!props) {
    throw new Error(`${name} props were not captured.`);
  }
  return props as T;
};

interface ProductActions {
  onAdd: (listing: MarketplaceListing, quantity?: number) => void;
  onFavorite: (listing: MarketplaceListing) => void;
  onOpen: (listing: MarketplaceListing) => void;
  onTransactionAction?: () => void;
}

interface ProductDetailActions extends ProductActions {
  onReplyToReview: (item: MarketplaceReviewDto, comment: string) => Promise<boolean>;
  onReportReview: (
    item: MarketplaceReviewDto,
    reason: 'abuse' | 'off_topic' | 'privacy' | 'spam',
    comment?: string,
  ) => Promise<boolean>;
  onReview: (listing: MarketplaceListing, rating: number, comment?: string) => Promise<boolean>;
  onSample: (listing: MarketplaceListing) => void;
  product?: MarketplaceListing;
  similar: MarketplaceListing[];
}

interface CartActions {
  onCheckout: (selectedCart: CartViewDto, deliveryTerms: 'by_agreement' | 'pickup' | 'seller_delivery') => void;
  onCheckoutAction?: () => void;
  onUpdate: (cartId: string, listingId: string, quantity: number) => void;
}

interface RequestActions {
  onBuyerAccessAction?: () => void;
  onChoose: (selectedRequest: BuyerRequestViewDto, selectedOffer: OfferViewDto) => void;
  onCreate: (input: MarketplaceCreateRequestInput) => void;
  onOffer: (selectedRequest: MarketplaceRequestFeedItem, input: MarketplaceOfferInput) => void;
  onSellerAccessAction?: () => void;
}

interface VerificationActions {
  onLinkIdentity: (item: VerificationViewDto) => void;
  onStart: (role: 'buyer' | 'farmer' | 'seller') => void;
  onSubmit: (item: VerificationViewDto) => void;
  onUploadDocument: (item: VerificationViewDto, kind: 'business' | 'farm' | 'id' | 'selfie', file: File) => void;
}

interface ContractActions {
  identityStatus: string;
  lifecycle: { data: ContractLifecycleDto | null; status: string };
  onAdvanceLifecycle: (item: ContractViewDto, action: MarketplaceContractLifecycleAction) => void;
  onDownloadArtifact: (item: ContractViewDto) => void;
  onOpenDispute: (
    item: ContractViewDto,
    reason: 'delivery_issue' | 'quality_issue' | 'quantity_issue' | 'other',
  ) => void;
  onQuote: (item: ContractViewDto, input: MarketplaceContractDeliveryQuoteInput) => void;
  onRefreshArtifact: (item: ContractViewDto) => void;
  onRetry: () => void;
  onSign: (item: ContractViewDto) => void;
  onUploadDisputeEvidence: (item: ContractViewDto, evidence: File) => void;
}

interface ManagementActions {
  onBuyerAccessAction?: () => void;
  onActivatePromotion: (listingId: string, plan: 'catalog_7d' | 'catalog_14d' | 'catalog_30d') => void;
  onLoadPromotion: (promotionId: string) => void;
  onPublishListing: (
    sourceId: string,
    sourceKind: 'produce' | 'product',
    section: 'equipment' | 'produce' | 'seeds',
  ) => void;
  onPublishRequest: (requestId: string) => void;
  onSampleFeedback: (item: MarketplaceSampleDto, rating: number, comment?: string) => void;
  onSampleTransition: (
    item: MarketplaceSampleDto,
    action: 'approve' | 'cancel' | 'decline' | 'receive' | 'ship',
    deliveryQuoteUzs?: number,
  ) => void;
  onSellerAccessAction?: () => void;
}

interface AiActions {
  onAsk: (
    question: string,
    kind: 'find_cheaper' | 'generic' | 'recommendation' | 'season_advice',
  ) => Promise<MarketplaceAiConsultationDto>;
  onConfirmStarterCart: (item: MarketplaceAiConsultationDto) => Promise<boolean>;
  onOpenProduct: (listing: MarketplaceListing) => void;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MarketplacePage route action orchestration', () => {
  it('coordinates buyer, seller, contract, engagement, search, and verification commands', async () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    testState.marketplaceData = buildMarketplaceData(refresh);
    testState.views = {};
    for (const mock of testState.apiMocks.values()) {
      mock.mockReset();
    }

    const defaultApiResult = apiSuccess({ id: 'updated-resource' });
    const actionNames = [
      'marketplaceControllerAddFavorite',
      'marketplaceControllerAddReview',
      'marketplaceControllerAddToCart',
      'marketplaceControllerAskAi',
      'marketplaceControllerCheckoutCart',
      'marketplaceControllerChooseOffer',
      'marketplaceControllerConfirmAiStarterCart',
      'marketplaceControllerCreateContractArtifact',
      'marketplaceControllerCreateRequest',
      'marketplaceControllerCreateVerification',
      'marketplaceControllerGetContractArtifact',
      'marketplaceControllerLinkOneId',
      'marketplaceControllerMakeOffer',
      'marketplaceControllerOpenContractDispute',
      'marketplaceControllerRecordSettlementEvent',
      'marketplaceControllerRemoveCartItem',
      'marketplaceControllerRemoveFavorite',
      'marketplaceControllerReplyToReview',
      'marketplaceControllerReportReview',
      'marketplaceControllerRequestSample',
      'marketplaceControllerSignContract',
      'marketplaceControllerStoreContractDisputeEvidence',
      'marketplaceControllerStoreVerificationDocument',
      'marketplaceControllerSubmitSampleFeedback',
      'marketplaceControllerSubmitVerification',
      'marketplaceControllerTransitionContractFulfillment',
      'marketplaceControllerTransitionSample',
      'marketplaceControllerUpdateCartItem',
      'marketplaceControllerUpdateContractDeliveryQuote',
      'marketplacePromotionControllerActivate',
      'marketplacePromotionControllerGet',
      'marketplacePublicationControllerPublishListing',
      'marketplacePublicationControllerPublishRequest',
    ];
    for (const name of actionNames) {
      apiMock(name).mockResolvedValue(defaultApiResult);
    }
    apiMock('marketplacePublicControllerListReviews').mockResolvedValue(
      apiSuccess({ items: [review, { ...review, id: 'review-peer' }] }),
    );
    apiMock('marketplaceControllerGetContractLifecycle').mockResolvedValue(apiSuccess(lifecycle(contract.id)));
    apiMock('marketplaceControllerAddReview').mockResolvedValue(apiSuccess(review));
    apiMock('marketplaceControllerReplyToReview').mockResolvedValue(
      apiSuccess({
        ...review,
        reply: { comment: 'Thank you', createdAt: now, id: 'reply-1', revision: 1, updatedAt: now },
      }),
    );
    apiMock('marketplaceControllerCheckoutCart').mockResolvedValue(apiSuccess({ contractId: 'contract-from-cart' }));
    apiMock('marketplaceControllerChooseOffer').mockResolvedValue(apiSuccess({ contractId: 'contract-from-offer' }));
    apiMock('marketplaceControllerAskAi').mockResolvedValue(apiSuccess(consultation));
    apiMock('marketplaceControllerOpenContractDispute').mockResolvedValue(apiSuccess(lifecycle(contract.id)));
    apiMock('marketplaceControllerRecordSettlementEvent').mockResolvedValue(apiSuccess(lifecycle(contract.id)));
    apiMock('marketplaceControllerTransitionContractFulfillment').mockResolvedValue(apiSuccess(lifecycle(contract.id)));
    apiMock('marketplaceControllerGetContractArtifact').mockResolvedValue(apiSuccess(lifecycle(contract.id).artifact));
    apiMock('marketplacePromotionControllerActivate').mockResolvedValue(
      apiSuccess(testState.marketplaceData.promotions.data[0]),
    );
    apiMock('marketplacePromotionControllerGet').mockResolvedValue(
      apiSuccess(testState.marketplaceData.promotions.data[0]),
    );
    apiMock('marketplaceControllerDownloadContractArtifact').mockResolvedValue({
      data: new Blob(['contract pdf'], { type: 'application/pdf' }),
      response: new Response(),
    });

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:contract');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const renderPage = (props: MarketplacePageProps = {}) => {
      cleanup();
      return render(<MarketplacePage navigate={navigate} {...props} />);
    };

    renderPage();
    const home = viewProps<ProductActions>('home');
    home.onOpen(product);
    home.onAdd(product, 2);
    home.onFavorite(product);
    const ai = viewProps<AiActions>('ai');
    ai.onOpenProduct(product);
    await expect(ai.onAsk('Which seed is available?', 'recommendation')).resolves.toEqual(consultation);
    await expect(ai.onConfirmStarterCart(consultation)).resolves.toBe(true);

    await waitFor(() => {
      expect(apiMock('marketplaceControllerAddToCart')).toHaveBeenCalledWith(
        { actingPartnerId: 'buyer-partner', listingPublicationId: product.id, quantity: 2 },
        expect.any(String),
        testState.requestOptions,
      );
      expect(apiMock('marketplaceControllerRemoveFavorite')).toHaveBeenCalledWith(
        product.id,
        expect.any(String),
        testState.requestOptions,
      );
    });
    expect(navigate).toHaveBeenCalledWith(`/products/${product.id}`);
    expect(apiMock('marketplaceControllerConfirmAiStarterCart')).toHaveBeenCalledWith(
      consultation.id,
      { actingPartnerId: 'buyer-partner', confirmed: true },
      expect.any(String),
      testState.requestOptions,
    );

    testState.marketplaceData = {
      ...testState.marketplaceData,
      favorites: empty([]),
    };
    renderPage();
    viewProps<ProductActions>('home').onFavorite(product);
    await waitFor(() => {
      expect(apiMock('marketplaceControllerAddFavorite')).toHaveBeenCalledOnce();
    });

    renderPage({ productId: product.id, view: 'product' });
    await waitFor(() => {
      expect(apiMock('marketplacePublicControllerListReviews')).toHaveBeenCalledWith(
        product.id,
        testState.requestOptions,
      );
    });
    const productView = viewProps<ProductDetailActions>('product');
    await expect(productView.onReview(product, 5, 'Excellent seed')).resolves.toBe(true);
    await expect(productView.onReview(product, 4)).resolves.toBe(true);
    await expect(productView.onReplyToReview(review, 'Thank you')).resolves.toBe(true);
    await expect(productView.onReportReview(review, 'spam', 'Promotional')).resolves.toBe(true);
    await expect(productView.onReportReview(review, 'privacy')).resolves.toBe(true);
    act(() => {
      productView.onSample(product);
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'agritech.marketplace.samples.confirm' }),
    );
    await waitFor(() => {
      expect(apiMock('marketplaceControllerRequestSample')).toHaveBeenCalledWith(
        { deliveryMethod: 'pickup', listingPublicationId: product.id },
        expect.any(String),
        testState.requestOptions,
      );
    });

    const staleReviewsSuccess = deferred();
    apiMock('marketplacePublicControllerListReviews').mockReset().mockReturnValueOnce(staleReviewsSuccess.promise);
    renderPage({ productId: product.id, view: 'product' });
    await waitFor(() => {
      expect(apiMock('marketplacePublicControllerListReviews')).toHaveBeenCalledOnce();
    });
    renderPage();
    await act(async () => {
      staleReviewsSuccess.resolve(apiSuccess({ items: [review] }));
      await staleReviewsSuccess.promise;
    });

    const staleReviewsFailure = deferred();
    apiMock('marketplacePublicControllerListReviews').mockReturnValueOnce(staleReviewsFailure.promise);
    renderPage({ productId: product.id, view: 'product' });
    await waitFor(() => {
      expect(apiMock('marketplacePublicControllerListReviews')).toHaveBeenCalledTimes(2);
    });
    renderPage();
    await act(async () => {
      staleReviewsFailure.reject(new TypeError('stale review request'));
      await Promise.resolve();
    });
    apiMock('marketplacePublicControllerListReviews').mockResolvedValue(
      apiSuccess({ items: [review, { ...review, id: 'review-peer' }] }),
    );

    renderPage({ view: 'cart' });
    const cartView = viewProps<CartActions>('cart');
    await act(async () => {
      cartView.onUpdate(cart.id, product.id, 3);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    await act(async () => {
      cartView.onUpdate(cart.id, product.id, 0);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    act(() => {
      cartView.onUpdate('missing-cart', product.id, 1);
      cartView.onCheckout(cart, 'seller_delivery');
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'agritech.marketplace.cart.reviewContract',
      }),
    );
    await waitFor(() => {
      expect(apiMock('marketplaceControllerUpdateCartItem')).toHaveBeenCalledWith(
        cart.id,
        product.id,
        { quantity: 3 },
        expect.any(String),
        testState.requestOptions,
      );
      expect(apiMock('marketplaceControllerRemoveCartItem')).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith('/contracts/contract-from-cart');
    });

    renderPage({ view: 'requests' });
    const requests = viewProps<RequestActions>('requests');
    await act(async () => {
      requests.onCreate({ deadline: '2026-09-01', region: 'Tashkent', title: 'Need corn seed' });
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    await act(async () => {
      requests.onOffer(request as MarketplaceRequestFeedItem, {
        deliveryPriceUzs: 250_000,
        deliveryTerms: 'seller_delivery',
        priceUzs: 4_500_000,
      });
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    act(() => {
      requests.onChoose(request, offer);
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'agritech.marketplace.orders.confirmOffer',
      }),
    );
    await waitFor(() => {
      expect(apiMock('marketplaceControllerCreateRequest')).toHaveBeenCalledWith(
        expect.objectContaining({ actingPartnerId: 'buyer-partner', title: 'Need corn seed' }),
        expect.any(String),
        testState.requestOptions,
      );
      expect(apiMock('marketplaceControllerMakeOffer')).toHaveBeenCalledWith(
        request.id,
        expect.objectContaining({ actingPartnerId: 'supplier-partner', priceUzs: 4_500_000 }),
        expect.any(String),
        testState.requestOptions,
      );
      expect(navigate).toHaveBeenCalledWith('/contracts/contract-from-offer');
    });

    renderPage({ view: 'account' });
    const management = viewProps<ManagementActions>('management');
    management.onPublishListing('source-product-1', 'product', 'seeds');
    management.onPublishListing('produce-1', 'produce', 'produce');
    management.onPublishRequest(request.id);
    management.onActivatePromotion(product.id, 'catalog_7d');
    management.onLoadPromotion('promotion-1');
    management.onSampleTransition(sample, 'approve');
    management.onSampleTransition(sample, 'ship', 50_000);
    management.onSampleFeedback(sample, 5, 'Promising sample');
    management.onSampleFeedback(sample, 4);
    await waitFor(() => {
      expect(apiMock('marketplacePublicationControllerPublishListing')).toHaveBeenCalledTimes(2);
      expect(apiMock('marketplacePublicationControllerPublishRequest')).toHaveBeenCalledWith(
        { buyerPartnerId: 'buyer-partner', requestId: request.id },
        expect.any(String),
        testState.requestOptions,
      );
      expect(apiMock('marketplacePromotionControllerActivate')).toHaveBeenCalledWith(
        { actingPartnerId: 'supplier-partner', listingPublicId: product.id, planCode: 'catalog_7d' },
        expect.any(String),
        testState.requestOptions,
      );
      expect(apiMock('marketplaceControllerTransitionSample')).toHaveBeenNthCalledWith(
        2,
        sample.id,
        { action: 'ship', deliveryQuoteUzs: 50_000, expectedRevision: sample.revision },
        expect.any(String),
        testState.requestOptions,
      );
    });

    renderPage({ contractId: contract.id, view: 'contract' });
    await waitFor(() => {
      expect(apiMock('marketplaceControllerGetContractLifecycle')).toHaveBeenCalledWith(
        contract.id,
        testState.requestOptions,
      );
    });
    const contractView = viewProps<ContractActions>('contract');
    act(() => {
      contractView.onSign(contract);
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'agritech.marketplace.contract.signOwnParty',
      }),
    );
    await waitFor(() => {
      expect(apiMock('marketplaceControllerCreateContractArtifact')).toHaveBeenCalledWith(
        contract.id,
        { settlementKind: 'direct_payment' },
        expect.stringMatching(/:artifact$/u),
        testState.requestOptions,
      );
      expect(apiMock('marketplaceControllerSignContract')).toHaveBeenCalledWith(
        contract.id,
        expect.stringMatching(/:signature$/u),
        testState.requestOptions,
      );
    });
    contractView.onQuote(contract, { deliveryPriceUzs: 250_000 });
    contractView.onQuote({ ...contract, actorParty: 'seller' }, { deliveryPriceUzs: 260_000 });
    contractView.onRefreshArtifact(contract);
    contractView.onDownloadArtifact(contract);
    contractView.onOpenDispute(contract, 'quality_issue');
    contractView.onUploadDisputeEvidence(contract, new File(['damaged package'], 'damage.jpg', { type: 'image/jpeg' }));
    contractView.onAdvanceLifecycle(contract, { kind: 'factoring-consent' });
    contractView.onAdvanceLifecycle(contract, { body: { command: 'confirm_buyer_payment' }, kind: 'settlement' });
    contractView.onAdvanceLifecycle(contract, { body: { command: 'start' }, kind: 'fulfillment' });
    contractView.onRetry();
    await waitFor(() => {
      expect(apiMock('marketplaceControllerUpdateContractDeliveryQuote')).toHaveBeenCalledWith(
        contract.id,
        { deliveryPriceUzs: 250_000, expectedRevision: contract.revision },
        expect.any(String),
        testState.requestOptions,
      );
      expect(apiMock('marketplaceControllerOpenContractDispute')).toHaveBeenCalledOnce();
      expect(apiMock('marketplaceControllerStoreContractDisputeEvidence')).toHaveBeenCalledOnce();
      expect(apiMock('marketplaceControllerRecordSettlementEvent')).toHaveBeenCalledOnce();
      expect(apiMock('marketplaceControllerTransitionContractFulfillment')).toHaveBeenCalledOnce();
      expect(createObjectUrl).toHaveBeenCalledOnce();
      expect(anchorClick).toHaveBeenCalledOnce();
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:contract');
    });

    renderPage({ view: 'verification' });
    const verificationView = viewProps<VerificationActions>('verification');
    verificationView.onUploadDocument(
      verification,
      'id',
      new File(['text evidence'], 'identity.txt', { type: 'text/plain' }),
    );
    verificationView.onUploadDocument(
      verification,
      'business',
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'business.pdf', { type: 'application/pdf' }),
    );
    verificationView.onStart('farmer');
    verificationView.onLinkIdentity(verification);
    verificationView.onSubmit(verification);
    await waitFor(() => {
      expect(apiMock('marketplaceControllerCreateVerification')).toHaveBeenCalledWith(
        { expectedRevision: verification.revision, role: 'farmer' },
        expect.any(String),
        testState.requestOptions,
      );
      expect(apiMock('marketplaceControllerLinkOneId')).toHaveBeenCalledOnce();
      expect(apiMock('marketplaceControllerSubmitVerification')).toHaveBeenCalledOnce();
      expect(apiMock('marketplaceControllerStoreVerificationDocument')).not.toHaveBeenCalled();
    });

    renderPage({ view: 'catalog' });
    expect(screen.getByTestId('catalog-view')).toBeTruthy();
    renderPage({ sellerId: product.supplierId, view: 'seller' });
    expect(screen.getByTestId('seller-view')).toBeTruthy();
    renderPage({ view: 'favorites' });
    expect(screen.getByTestId('favorites-view')).toBeTruthy();

    renderPage();
    for (const selector of [
      '.dh-header .dh-brand',
      '.dh-header .dh-button--catalog',
      '.dh-header__nav button',
      '.dh-header__categories button',
      '.dh-footer button',
      '.dh-mobile-nav button',
    ]) {
      for (const button of document.querySelectorAll<HTMLButtonElement>(selector)) {
        fireEvent.click(button);
      }
    }
    const search = screen.getByRole('searchbox', { name: 'agritech.marketplace.search' });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.change(search, { target: { value: '  corn seed  ' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(navigate).toHaveBeenCalledWith('/catalog');
    expect(navigate).toHaveBeenCalledWith('/catalog?q=corn%20seed');
    expect(navigate).toHaveBeenCalledWith('/requests');
    expect(navigate).toHaveBeenCalledWith('/favorites');
    expect(navigate).toHaveBeenCalledWith('/cart');
    expect(navigate).toHaveBeenCalledWith('/auth');
    expect(navigate).toHaveBeenCalledWith('/account');
    expect(navigate).toHaveBeenCalledWith('/problems');
    expect(navigate).toHaveBeenCalledWith('/verification');

    apiMock('marketplacePublicControllerListSuggestions').mockResolvedValueOnce(
      apiSuccess({ items: [{ id: product.id, kind: 'listing', label: product.name }] }),
    );
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'corn' } });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(product.name, 'u') }));
    expect(navigate).toHaveBeenCalledWith(`/products/${product.id}`);

    apiMock('marketplacePublicControllerListSuggestions').mockResolvedValueOnce(
      apiSuccess({ items: [{ id: request.id, kind: 'request', label: request.title }] }),
    );
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'need' } });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(request.title, 'u') }));
    expect(navigate).toHaveBeenCalledWith(`/requests?q=${encodeURIComponent(request.title)}`);

    apiMock('marketplacePublicControllerListSuggestions')
      .mockResolvedValueOnce(apiSuccess({ items: [] }))
      .mockResolvedValueOnce(apiFailure(503));
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'none' } });
    await waitFor(() => {
      expect(apiMock('marketplacePublicControllerListSuggestions')).toHaveBeenCalledWith(
        { limit: 6, q: 'none' },
        testState.requestOptions,
      );
    });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'error' } });
    expect(await screen.findByText('agritech.marketplace.search.unavailable')).toBeTruthy();

    const staleSuggestionsSuccess = deferred();
    apiMock('marketplacePublicControllerListSuggestions')
      .mockReset()
      .mockReturnValueOnce(staleSuggestionsSuccess.promise);
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'stale success' } });
    await waitFor(() => {
      expect(apiMock('marketplacePublicControllerListSuggestions')).toHaveBeenCalledOnce();
    });
    renderPage();
    await act(async () => {
      staleSuggestionsSuccess.resolve(
        apiSuccess({ items: [{ id: product.id, kind: 'listing', label: product.name }] }),
      );
      await staleSuggestionsSuccess.promise;
    });

    const staleSuggestionsFailure = deferred();
    apiMock('marketplacePublicControllerListSuggestions').mockReturnValueOnce(staleSuggestionsFailure.promise);
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'stale failure' } });
    await waitFor(() => {
      expect(apiMock('marketplacePublicControllerListSuggestions')).toHaveBeenCalledTimes(2);
    });
    renderPage();
    await act(async () => {
      staleSuggestionsFailure.reject(new TypeError('stale suggestion request'));
      await Promise.resolve();
    });
    apiMock('marketplacePublicControllerListSuggestions').mockResolvedValue(apiSuccess({ items: [] }));

    testState.marketplaceData = {
      ...testState.marketplaceData,
      selectedListing: empty(null),
    };
    renderPage({ productId: product.id, view: 'product' });
    expect(viewProps<ProductDetailActions>('product').product).toEqual(product);

    const similarProduct: MarketplaceListing = { ...product, id: 'listing-publication-similar' };
    const differentProduct: MarketplaceListing = {
      ...product,
      category: 'fertilizer',
      id: 'listing-publication-different',
    };
    testState.marketplaceData = {
      ...testState.marketplaceData,
      catalog: ready([product, similarProduct, differentProduct]),
      selectedListing: ready(product),
    };
    renderPage({ productId: product.id, view: 'product' });
    expect(viewProps<ProductDetailActions>('product').similar).toEqual([similarProduct]);
    testState.marketplaceData = {
      ...testState.marketplaceData,
      catalog: ready([similarProduct, differentProduct]),
      selectedListing: empty(null),
    };
    renderPage({ productId: product.id, view: 'product' });
    expect(viewProps<ProductDetailActions>('product').product).toBeUndefined();
    expect(viewProps<ProductDetailActions>('product').similar).toEqual([]);

    apiMock('marketplaceControllerAddFavorite')
      .mockReset()
      .mockResolvedValueOnce(apiFailure(401))
      .mockResolvedValueOnce(apiFailure(403))
      .mockResolvedValueOnce(apiFailure(500));
    renderPage();
    const failureActions = viewProps<ProductActions>('home');
    failureActions.onFavorite(product);
    expect((await screen.findByRole('alert')).textContent).toContain('agritech.marketplace.auth.required');
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.close' }));
    await act(async () => {
      failureActions.onFavorite(product);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    expect(screen.getByRole('alert').textContent).toContain('agritech.marketplace.cart.verifyRequired');
    await act(async () => {
      failureActions.onFavorite(product);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    expect(screen.getByRole('alert').textContent).toContain('agritech.marketplace.error');

    apiMock('marketplaceControllerAskAi')
      .mockReset()
      .mockResolvedValueOnce(apiFailure(400))
      .mockRejectedValueOnce(new TypeError('connection closed after send'))
      .mockRejectedValueOnce(new TypeError('different command interrupted'))
      .mockResolvedValueOnce(apiSuccess(consultation))
      .mockResolvedValueOnce(apiSuccess(consultation))
      .mockResolvedValueOnce(apiSuccess(consultation));
    const failureAi = viewProps<AiActions>('ai');
    await expect(failureAi.onAsk('Retry this seed search', 'generic')).rejects.toBeTruthy();
    await expect(failureAi.onAsk('Unknown response', 'generic')).rejects.toThrow('connection closed after send');
    await expect(failureAi.onAsk('A different question', 'generic')).rejects.toThrow('different command interrupted');
    const retainedKey = apiMock('marketplaceControllerAskAi').mock.calls[2]?.[1];
    await expect(failureAi.onAsk('A different question', 'generic')).resolves.toEqual(consultation);
    expect(apiMock('marketplaceControllerAskAi').mock.calls[3]?.[1]).toBe(retainedKey);
    await expect(failureAi.onAsk('A third question', 'generic')).resolves.toEqual(consultation);

    apiMock('marketplacePromotionControllerGet').mockReset().mockResolvedValueOnce(apiFailure(503));
    renderPage({ view: 'account' });
    viewProps<ManagementActions>('management').onLoadPromotion('unavailable-promotion');
    await waitFor(() => {
      expect(apiMock('marketplacePromotionControllerGet')).toHaveBeenCalledOnce();
    });

    apiMock('marketplaceControllerDownloadContractArtifact').mockReset().mockResolvedValueOnce(apiFailure(503));
    renderPage({ contractId: contract.id, view: 'contract' });
    viewProps<ContractActions>('contract').onDownloadArtifact(contract);
    expect((await screen.findByRole('alert')).textContent).toContain('agritech.marketplace.error');

    apiMock('marketplaceControllerDownloadContractArtifact').mockReset().mockResolvedValueOnce({
      data: 'raw contract document',
      response: new Response(),
    });
    renderPage({ contractId: contract.id, view: 'contract' });
    viewProps<ContractActions>('contract').onDownloadArtifact(contract);
    await waitFor(() => {
      expect(createObjectUrl).toHaveBeenCalledTimes(2);
      expect(anchorClick).toHaveBeenCalledTimes(2);
    });

    apiMock('marketplaceControllerGetContractLifecycle').mockReset().mockResolvedValueOnce(apiFailure(404));
    renderPage({ contractId: contract.id, view: 'contract' });
    await waitFor(() => {
      expect(viewProps<ContractActions>('contract').lifecycle.status).toBe('empty');
    });
    apiMock('marketplaceControllerGetContractLifecycle').mockReset().mockResolvedValueOnce(apiFailure(503));
    renderPage({ contractId: contract.id, view: 'contract' });
    await waitFor(() => {
      expect(viewProps<ContractActions>('contract').lifecycle.status).toBe('error');
    });

    const staleLifecycleSuccess = deferred();
    apiMock('marketplaceControllerGetContractLifecycle').mockReset().mockReturnValueOnce(staleLifecycleSuccess.promise);
    apiMock('marketplaceControllerGetContractArtifact')
      .mockReset()
      .mockResolvedValueOnce(apiSuccess(lifecycle(contract.id).artifact));
    renderPage({ contractId: contract.id, view: 'contract' });
    viewProps<ContractActions>('contract').onRefreshArtifact(contract);
    await waitFor(() => {
      expect(apiMock('marketplaceControllerGetContractArtifact')).toHaveBeenCalledOnce();
      expect(viewProps<ContractActions>('contract').lifecycle.status).toBe('loading');
    });
    renderPage();
    await act(async () => {
      staleLifecycleSuccess.resolve(apiSuccess(lifecycle(contract.id)));
      await staleLifecycleSuccess.promise;
    });

    const staleLifecycleFailure = deferred();
    apiMock('marketplaceControllerGetContractLifecycle').mockReturnValueOnce(staleLifecycleFailure.promise);
    renderPage({ contractId: contract.id, view: 'contract' });
    await waitFor(() => {
      expect(apiMock('marketplaceControllerGetContractLifecycle')).toHaveBeenCalledTimes(2);
    });
    renderPage();
    await act(async () => {
      staleLifecycleFailure.reject(new TypeError('stale lifecycle request'));
      await Promise.resolve();
    });
    apiMock('marketplaceControllerGetContractLifecycle').mockResolvedValue(apiSuccess(lifecycle(contract.id)));
    apiMock('marketplaceControllerGetContractArtifact').mockResolvedValue(apiSuccess(lifecycle(contract.id).artifact));

    const pendingVerification: VerificationViewDto = {
      ...verification,
      level: 'basic',
      status: 'pending',
      step: 'review',
    };
    testState.marketplaceData = {
      ...testState.marketplaceData,
      auth: 'signed-in',
      selectedListing: ready(product),
      verification: ready(pendingVerification),
    };
    renderPage({ productId: product.id, view: 'product' });
    const restrictedProduct = viewProps<ProductDetailActions>('product');
    restrictedProduct.onAdd(product);
    restrictedProduct.onSample(product);
    renderPage({ view: 'cart' });
    viewProps<CartActions>('cart').onCheckout(cart, 'pickup');
    renderPage({ view: 'requests' });
    const restrictedRequests = viewProps<RequestActions>('requests');
    restrictedRequests.onCreate({ region: 'Samarqand', title: 'Blocked request' });
    restrictedRequests.onOffer(request as MarketplaceRequestFeedItem, { deliveryTerms: 'pickup', priceUzs: 1 });
    restrictedRequests.onChoose(request, offer);
    renderPage({ contractId: contract.id, view: 'contract' });
    const restrictedContract = viewProps<ContractActions>('contract');
    restrictedContract.onSign({ ...contract, actorParty: 'seller' });
    restrictedContract.onAdvanceLifecycle(contract, { kind: 'factoring-consent' });
    restrictedContract.onQuote(contract, { deliveryPriceUzs: 1 });
    restrictedContract.onRefreshArtifact(contract);
    restrictedContract.onDownloadArtifact(contract);
    restrictedContract.onOpenDispute(contract, 'other');
    restrictedContract.onUploadDisputeEvidence(contract, new File(['evidence'], 'evidence.pdf'));
    renderPage({ view: 'account' });
    const restrictedManagement = viewProps<ManagementActions>('management');
    restrictedManagement.onPublishListing('source-product-1', 'product', 'seeds');
    restrictedManagement.onPublishRequest(request.id);
    restrictedManagement.onActivatePromotion(product.id, 'catalog_7d');
    await expect(viewProps<AiActions>('ai').onConfirmStarterCart(consultation)).resolves.toBe(false);
    expect(navigate.mock.calls.filter(([path]) => path === '/verification').length).toBeGreaterThanOrEqual(14);

    testState.marketplaceData = {
      ...testState.marketplaceData,
      auth: 'signed-out',
      verification: empty(null),
    };
    renderPage();
    viewProps<ProductActions>('home').onFavorite(product);
    expect(navigate).not.toHaveBeenCalledWith(expect.stringMatching(/^\/auth\?returnUrl=/u));

    testState.marketplaceData = {
      ...buildMarketplaceData(refresh),
      verification: { data: null, status: 'loading' },
    };
    apiMock('marketplaceControllerGetContractLifecycle')
      .mockReset()
      .mockResolvedValue(apiSuccess(lifecycle(contract.id)));
    renderPage({ contractId: contract.id, view: 'contract' });
    expect(viewProps<ContractActions>('contract').identityStatus).toBe('loading');

    testState.marketplaceData = {
      ...buildMarketplaceData(refresh),
      verification: ready(null),
    };
    renderPage({ contractId: contract.id, view: 'contract' });
    expect(viewProps<ContractActions>('contract').identityStatus).toBe('none');

    const sellerContract: ContractViewDto = { ...contract, actorParty: 'seller' };
    testState.marketplaceData = {
      ...buildMarketplaceData(refresh),
      contracts: ready([sellerContract]),
      verification: ready({ ...verification, role: 'buyer' }),
    };
    renderPage({ contractId: sellerContract.id, view: 'contract' });
    expect(viewProps<ContractActions>('contract').identityStatus).toBe('none');

    testState.marketplaceData = {
      ...buildMarketplaceData(refresh),
      auth: 'checking',
    };
    renderPage({ view: 'cart' });
    expect(screen.getByTestId('marketplace-skeleton')).toBeTruthy();
    testState.marketplaceData = {
      ...buildMarketplaceData(refresh),
      catalog: { data: [], status: 'loading' },
    };
    renderPage();
    expect(screen.getByTestId('marketplace-skeleton')).toBeTruthy();
    testState.marketplaceData = {
      ...buildMarketplaceData(refresh),
      selectedListing: { data: null, status: 'loading' },
    };
    renderPage({ productId: product.id, view: 'product' });
    expect(screen.getByTestId('marketplace-skeleton')).toBeTruthy();
    testState.marketplaceData = {
      ...buildMarketplaceData(refresh),
      auth: 'error',
    };
    renderPage({ view: 'cart' });
    expect(screen.getByTestId('empty-view')).toBeTruthy();

    testState.marketplaceData = buildMarketplaceData(refresh);
    renderPage({ productId: product.id, view: 'product' });
    const dialogProduct = viewProps<ProductDetailActions>('product');
    const header = document.querySelector<HTMLElement>('.dh-header');
    header?.setAttribute('aria-hidden', 'false');
    const outsideSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(outsideSvg);
    const activeElementDescriptor = Object.getOwnPropertyDescriptor(document, 'activeElement');
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => outsideSvg });
    act(() => {
      dialogProduct.onSample(product);
    });
    if (activeElementDescriptor) {
      Object.defineProperty(document, 'activeElement', activeElementDescriptor);
    } else {
      Reflect.deleteProperty(document, 'activeElement');
    }
    fireEvent.keyDown(globalThis, { key: 'ArrowDown' });
    const dialog = screen.getByRole('dialog');
    const dialogButtons = within(dialog).getAllByRole('button');
    const firstDialogButton = dialogButtons[0];
    const lastDialogButton = dialogButtons.at(-1);
    expect(document.activeElement).toBe(lastDialogButton);
    const forwardTab = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' });
    expect(globalThis.dispatchEvent(forwardTab)).toBe(false);
    expect(document.activeElement).toBe(firstDialogButton);
    fireEvent.keyDown(globalThis, { key: 'Tab' });
    const reverseTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    });
    expect(globalThis.dispatchEvent(reverseTab)).toBe(false);
    expect(document.activeElement).toBe(lastDialogButton);
    const searchOutsideDialog = document.querySelector<HTMLInputElement>('#dh-search');
    if (!searchOutsideDialog) {
      throw new Error('Search control outside the confirmation is unavailable.');
    }
    searchOutsideDialog.focus();
    const reverseFromOutside = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    });
    expect(globalThis.dispatchEvent(reverseFromOutside)).toBe(false);
    expect(document.activeElement).toBe(lastDialogButton);
    const backdrop = dialog.parentElement;
    if (!backdrop) {
      throw new Error('Confirmation backdrop is unavailable.');
    }
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
    outsideSvg.remove();

    const pendingSample = deferred();
    apiMock('marketplaceControllerRequestSample').mockReset().mockReturnValueOnce(pendingSample.promise);
    renderPage({ productId: product.id, view: 'product' });
    act(() => {
      viewProps<ProductDetailActions>('product').onSample(product);
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'agritech.marketplace.samples.confirm' }),
    );
    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog'))
          .getAllByRole('button')
          .every((button) => button.hasAttribute('disabled')),
      ).toBe(true);
    });
    const pendingDialog = screen.getByRole('dialog');
    const pendingBackdrop = pendingDialog.parentElement;
    if (!pendingBackdrop) {
      throw new Error('Pending confirmation backdrop is unavailable.');
    }
    const noFocusableTab = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' });
    expect(globalThis.dispatchEvent(noFocusableTab)).toBe(false);
    expect(noFocusableTab.defaultPrevented).toBe(true);
    fireEvent.keyDown(globalThis, { key: 'Escape' });
    fireEvent.mouseDown(pendingBackdrop);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => {
      pendingSample.resolve(defaultApiResult);
      await pendingSample.promise;
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    apiMock('marketplaceControllerRequestSample').mockResolvedValue(defaultApiResult);

    const originalFileReader = globalThis.FileReader;
    class ErrorFileReader {
      error: DOMException | null = null;
      result: ArrayBuffer | string | null = null;
      private readonly listeners = new Map<string, EventListener>();
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener === 'function') {
          this.listeners.set(type, listener);
        }
      }
      readAsDataURL() {
        this.listeners.get('error')?.(new Event('error'));
      }
    }
    vi.stubGlobal('FileReader', ErrorFileReader);
    renderPage({ view: 'verification' });
    viewProps<VerificationActions>('verification').onUploadDocument(
      verification,
      'id',
      new File(['evidence'], 'identity.pdf', { type: 'application/pdf' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('agritech.marketplace.error');

    class InvalidEncodingFileReader extends ErrorFileReader {
      override result = 'not-a-data-url';
      override readAsDataURL() {
        this.listenersForLoad();
      }
      private listenersForLoad() {
        const listeners = this as unknown as { listeners: Map<string, EventListener> };
        listeners.listeners.get('load')?.(new Event('load'));
      }
    }
    vi.stubGlobal('FileReader', InvalidEncodingFileReader);
    renderPage({ view: 'verification' });
    viewProps<VerificationActions>('verification').onUploadDocument(
      verification,
      'id',
      new File(['evidence'], 'identity.pdf', { type: 'application/pdf' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('agritech.marketplace.error');

    class BinaryResultFileReader extends ErrorFileReader {
      override result = new ArrayBuffer(8);
      override readAsDataURL() {
        const listeners = this as unknown as { listeners: Map<string, EventListener> };
        listeners.listeners.get('load')?.(new Event('load'));
      }
    }
    vi.stubGlobal('FileReader', BinaryResultFileReader);
    renderPage({ view: 'verification' });
    viewProps<VerificationActions>('verification').onUploadDocument(
      verification,
      'id',
      new File(['evidence'], 'identity.pdf', { type: 'application/pdf' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('agritech.marketplace.error');
    vi.stubGlobal('FileReader', originalFileReader);

    renderPage();
    vi.useFakeTimers();
    const timedFavorite = deferred();
    apiMock('marketplaceControllerRemoveFavorite').mockReset().mockReturnValueOnce(timedFavorite.promise);
    act(() => {
      viewProps<ProductActions>('home').onFavorite(product);
    });
    await act(async () => {
      timedFavorite.resolve(defaultApiResult);
      await timedFavorite.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).toBeNull();
    vi.useRealTimers();

    cleanup();
    render(<MarketplacePage />);
    viewProps<ProductActions>('home').onOpen(product);
  }, 20_000);

  it('routes every progressive-access prerequisite and blocks synthetic mutations before the API boundary', () => {
    const refresh = vi.fn();
    const navigate = vi.fn();
    testState.views = {};
    for (const mock of testState.apiMocks.values()) {
      mock.mockReset();
    }
    apiMock('marketplacePublicControllerListReviews').mockResolvedValue(apiSuccess({ items: [] }));

    const mount = (data: MarketplaceData, props: MarketplacePageProps = {}) => {
      cleanup();
      testState.marketplaceData = data;
      render(<MarketplacePage navigate={navigate} {...props} />);
    };
    const demoProduct: MarketplaceListing = {
      ...product,
      id: 'demo-listing',
      provenance: 'demo',
      transactional: false,
    };
    const demoData: MarketplaceData = {
      ...buildMarketplaceData(refresh),
      catalog: ready([demoProduct]),
      selectedListing: ready(demoProduct),
    };
    mount(demoData);
    viewProps<ProductActions>('home').onAdd(demoProduct);
    viewProps<ProductActions>('home').onFavorite(demoProduct);
    mount(demoData, { productId: demoProduct.id, view: 'product' });
    viewProps<ProductDetailActions>('product').onSample(demoProduct);
    expect(apiMock('marketplaceControllerAddToCart')).not.toHaveBeenCalled();
    expect(apiMock('marketplaceControllerAddFavorite')).not.toHaveBeenCalled();
    expect(apiMock('marketplaceControllerRequestSample')).not.toHaveBeenCalled();

    const sellerData: MarketplaceData = {
      ...buildMarketplaceData(refresh),
      verification: ready({ ...verification, role: 'seller' }),
    };
    mount(sellerData);
    viewProps<ProductActions>('home').onTransactionAction?.();
    mount(sellerData, { view: 'cart' });
    viewProps<CartActions>('cart').onCheckoutAction?.();
    mount(sellerData, { view: 'requests' });
    viewProps<RequestActions>('requests').onBuyerAccessAction?.();
    mount(sellerData, { view: 'account' });
    viewProps<ManagementActions>('management').onBuyerAccessAction?.();

    const buyerData: MarketplaceData = {
      ...buildMarketplaceData(refresh),
      verification: ready({ ...verification, role: 'buyer' }),
    };
    mount(buyerData, { view: 'requests' });
    viewProps<RequestActions>('requests').onSellerAccessAction?.();
    mount(buyerData, { view: 'account' });
    viewProps<ManagementActions>('management').onSellerAccessAction?.();

    const organizationData: MarketplaceData = {
      ...buildMarketplaceData(refresh),
      partners: empty([]),
      verification: ready({ ...verification, role: 'farmer' }),
    };
    mount(organizationData);
    viewProps<ProductActions>('home').onTransactionAction?.();
    mount(organizationData, { view: 'requests' });
    viewProps<RequestActions>('requests').onBuyerAccessAction?.();
    viewProps<RequestActions>('requests').onSellerAccessAction?.();
    mount(organizationData, { view: 'account' });
    viewProps<ManagementActions>('management').onBuyerAccessAction?.();
    viewProps<ManagementActions>('management').onSellerAccessAction?.();

    expect(navigate.mock.calls.filter(([path]) => path === '/verification')).toHaveLength(6);
    expect(navigate.mock.calls.filter(([path]) => path === '/account')).toHaveLength(5);
  });
});
