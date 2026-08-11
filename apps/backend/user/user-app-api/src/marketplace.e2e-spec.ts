// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ONBOARDING-023
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { registerFastifyRouteBodyLimits } from '@app/backend-common-bootstrap';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  MarketplaceController,
  MarketplacePublicController,
  MarketplacePublicationController,
  MarketplacePublicRepositoryInjectToken,
  MarketplacePublicService,
  MarketplaceProviderUnavailableException,
  MarketplaceRepositoryInjectToken,
  MarketplaceService,
  MarketplaceVerificationService,
  type MarketplacePublishedListingRecord,
} from '@app/backend-feature-agritech-main';
import {
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';

const tenantOne = '11111111-1111-4111-8111-111111111111';
const tenantTwo = '22222222-2222-4222-8222-222222222222';
const buyerUserId = '33333333-3333-4333-8333-333333333333';
const sellerUserId = '44444444-4444-4444-8444-444444444444';
const foreignUserId = '55555555-5555-4555-8555-555555555555';
const cartId = '66666666-6666-4666-8666-666666666666';
const foreignCartId = '77777777-7777-4777-8777-777777777777';
const requestId = '99999999-9999-4999-8999-999999999999';
const offerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contractId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publicListingId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const publicProduceId = '12121212-1212-4121-8121-121212121212';
const publicSellerId = '13131313-1313-4131-8131-131313131313';
const sellerPartnerId = '14141414-1414-4141-8141-141414141414';
const buyerPartnerId = '15151515-1515-4151-8151-151515151515';
const requestPublicId = '16161616-1616-4161-8161-161616161616';
const maximumUzsAmount = 9_999_999_999_999;
const now = new Date('2026-08-09T00:00:00.000Z');

const ok = <T>(value: T) => ({ status: 'ok' as const, value });

const verificationRecord = (overrides: Record<string, unknown> = {}) => ({
  caseRevision: 0,
  createdAt: now,
  documents: [],
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  identityAssurance: 'mock',
  level: 'basic',
  oneIdLinked: true,
  oneIdLinkedAt: now,
  providerMode: 'mock',
  providerName: 'mock-oneid',
  providerReceiptId: 'private-provider-receipt',
  providerSubjectKey: 'private-provider-subject',
  role: 'farmer',
  status: 'none',
  tenantId: tenantOne,
  updatedAt: now,
  userId: buyerUserId,
  version: 1,
  ...overrides,
});

const publishedProductRecord = (
  overrides: Partial<MarketplacePublishedListingRecord> & Record<string, unknown> = {},
): MarketplacePublishedListingRecord & Record<string, unknown> => ({
  availableQuantity: 15,
  description: 'Certified drought-resistant seed',
  images: ['https://cdn.example.test/corn.webp'],
  priceUzs: 4_200_000,
  productCategory: 'seed' as const,
  promoted: true,
  publicId: publicListingId,
  publishedAt: now,
  region: 'Samarkand',
  section: 'seeds' as const,
  sellerDisplayName: 'Zarafshon Agro',
  sellerPublicId: publicSellerId,
  sellerRegion: 'Samarkand',
  sourceKind: 'product' as const,
  title: 'Corn F1',
  titleRu: 'Кукуруза F1',
  titleUz: 'Makkajoʻxori F1',
  titleUzCyrl: 'Маккажўхори F1',
  unit: 't',
  updatedAt: now,
  ...overrides,
  sampleAvailable: overrides.sampleAvailable ?? true,
});

const publishedProduceRecord = (
  overrides: Partial<MarketplacePublishedListingRecord> & Record<string, unknown> = {},
): MarketplacePublishedListingRecord & Record<string, unknown> => ({
  availableQuantity: 400,
  images: [],
  priceUzs: 920_000,
  produceCrop: 'Tomato',
  produceGrade: 'A' as const,
  promoted: false,
  publicId: publicProduceId,
  publishedAt: now,
  region: 'Tashkent',
  section: 'produce' as const,
  sellerDisplayName: 'Bahor Farm',
  sellerPublicId: publicSellerId,
  sellerRegion: 'Tashkent',
  sourceKind: 'produce' as const,
  title: 'Tomato',
  titleRu: 'Томат',
  titleUz: 'Pomidor',
  titleUzCyrl: 'Помидор',
  unit: 'kg',
  updatedAt: now,
  ...overrides,
  sampleAvailable: overrides.sampleAvailable ?? true,
});

const contractRecord = (overrides: Record<string, unknown> = {}) => ({
  amountUzs: 4_000_000,
  buyerPartnerId,
  buyerPartySnapshot: {
    legalName: 'Bahor Farm',
    partnerId: buyerPartnerId,
    region: 'Samarkand',
    tenantId: tenantOne,
    userId: buyerUserId,
  },
  buyerTenantId: tenantOne,
  buyerUserId,
  createdAt: now,
  deliveryPriceUzs: 0,
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  id: contractId,
  revision: 1,
  lines: [
    {
      lineTotalUzs: 4_000_000,
      name: 'Corn seed',
      quantity: 1,
      sourceId: requestId,
      sourceKind: 'request',
      sourcePublicationId: requestPublicId,
      sourceRevision: 1,
      unit: 'lot',
      unitPriceUzs: 4_000_000,
    },
  ],
  sellerPartnerId,
  sellerPartySnapshot: {
    legalName: 'Zarafshon Agro',
    partnerId: sellerPartnerId,
    region: 'Samarkand',
    tenantId: tenantTwo,
    userId: sellerUserId,
  },
  sellerTenantId: tenantTwo,
  sellerUserId,
  sourceId: offerId,
  sourceType: 'offer_selection',
  status: 'draft',
  subject: 'Corn seed',
  updatedAt: now,
  ...overrides,
});

function createRepositoryFixture() {
  return {
    getVerification: vi.fn(),
    reviewVerification: vi.fn(),
    listVerifications: vi.fn(),
    isApprovedOrganization: vi.fn(),
    getCart: vi.fn(),
    listCarts: vi.fn(),
    addToCart: vi.fn(),
    updateCartItem: vi.fn(),
    removeCartItem: vi.fn(),
    checkoutCart: vi.fn(),
    requestSample: vi.fn(),
    listSamples: vi.fn(),
    sampleUsageThisMonth: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    listFavorites: vi.fn(),
    addReview: vi.fn(),
    listProductReviews: vi.fn(),
    createRequest: vi.fn(),
    listRequests: vi.fn(),
    listMyRequests: vi.fn(),
    makeOffer: vi.fn(),
    listOffers: vi.fn(),
    chooseOffer: vi.fn(),
    updateContractDeliveryQuote: vi.fn(),
    listContracts: vi.fn(),
    listTenantContracts: vi.fn(),
    askAi: vi.fn(),
    roleOf: vi.fn(),
  };
}

function createPublicRepositoryFixture() {
  return {
    findPublishedListing: vi.fn(),
    findPublishedSeller: vi.fn(),
    listPublishedListings: vi.fn(),
    listPublishedRequests: vi.fn(),
    listPublishedSellerListings: vi.fn(),
    listPublishedSuggestions: vi.fn(),
    listPendingModeration: vi.fn(),
    listOwnedPublications: vi.fn(),
    publishListing: vi.fn(),
    publishRequest: vi.fn(),
    reviewListingPublication: vi.fn(),
    reviewRequestPublication: vi.fn(),
  };
}

const repository = createRepositoryFixture();
const publicRepository = createPublicRepositoryFixture();
const verificationService = {
  createVerification: vi.fn(),
  linkOneId: vi.fn(),
  storeDocuments: vi.fn(),
  submitVerification: vi.fn(),
  getProviderReadiness: vi.fn(),
};

const authenticatedHeaders = (subject = buyerUserId, tenantId = tenantOne) => ({
  'x-request-id': '33333333-3333-4333-8333-333333333333',
  'x-test-subject': subject,
  'x-test-tenant': tenantId,
});

interface ProblemBody {
  status?: number;
  errors?: Array<{ pointer?: string }>;
}

interface VerificationHttpBody {
  data: {
    documents: Array<{ simulation: boolean }>;
    providerMode: string;
    revision: number;
    simulation: boolean;
  };
}

function expectProblem(
  response: { statusCode: number; headers: Record<string, unknown>; json(): ProblemBody },
  status: number,
) {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toEqual(expect.stringContaining('application/problem+json'));
  expect(response.json()).toMatchObject({ status });
}

describe('marketplace HTTP contract', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceController, MarketplacePublicController, MarketplacePublicationController],
      providers: [
        MarketplaceService,
        MarketplacePublicService,
        { provide: MarketplaceVerificationService, useValue: verificationService },
        { provide: MarketplaceRepositoryInjectToken, useValue: repository },
        { provide: MarketplacePublicRepositoryInjectToken, useValue: publicRepository },
        SessionAuthGuard,
        { provide: APP_GUARD, useExisting: SessionAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    registerFastifyRouteBodyLimits(app);
    app.useGlobalFilters(new ExceptionsFilter());
    app.useGlobalPipes(createValidationPipe());
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, _reply, done) => {
        const subject = request.headers['x-test-subject'];
        const tenantId = request.headers['x-test-tenant'];
        if (typeof subject === 'string' && typeof tenantId === 'string') {
          const requestedDisplayName = request.headers['x-test-display-name'];
          let displayName: string | undefined;
          if (requestedDisplayName !== 'omit') {
            if (typeof requestedDisplayName === 'string') {
              displayName = requestedDisplayName;
            } else {
              displayName = subject === sellerUserId ? 'Zarafshon Agro' : 'Bahor Farm';
            }
          }
          const principal: AuthenticatedPrincipal = {
            subject,
            tenantId,
            roles: [],
            permissions: [],
            ...(displayName ? { displayName } : {}),
          };
          (request as unknown as AuthenticatedRequest).session = { user: principal };
        }
        done();
      });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    repository.roleOf.mockResolvedValue('buyer');
    repository.isApprovedOrganization.mockResolvedValue(true);
    publicRepository.listPublishedListings.mockResolvedValue({ items: [] });
    publicRepository.listPublishedRequests.mockResolvedValue({ items: [] });
    publicRepository.listPublishedSellerListings.mockResolvedValue({ items: [] });
    publicRepository.listPublishedSuggestions.mockResolvedValue([]);
    publicRepository.listOwnedPublications.mockResolvedValue({ listings: [], requests: [] });
  });

  it('returns RFC 9457 401 for a missing server-side session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/requests',
      headers: { 'idempotency-key': 'request-auth-0001' },
      payload: { actingPartnerId: buyerPartnerId, title: 'Corn seed', region: 'Samarkand' },
    });

    expectProblem(response, 401);
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('serves a discriminated, allowlisted catalog anonymously without creating session state', async () => {
    publicRepository.listPublishedListings.mockResolvedValue({
      items: [
        publishedProductRecord({
          idempotencyKey: 'private-command-key',
          ownerUserId: buyerUserId,
          providerSubjectKey: 'private-provider-subject',
          sourceId: offerId,
          tenantId: tenantOne,
        }),
        publishedProduceRecord({ farmerId: foreignUserId, moderationStatus: 'approved', produceListingId: offerId }),
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/marketplace/public/catalog' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.json()).toMatchObject({
      data: {
        items: [
          {
            category: 'seed',
            id: publicListingId,
            kind: 'product',
            section: 'seeds',
            seller: { id: publicSellerId, verified: true },
          },
          {
            crop: 'Tomato',
            grade: 'A',
            id: publicProduceId,
            kind: 'produce',
            section: 'produce',
            seller: { id: publicSellerId, verified: true },
          },
        ],
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(
      /tenantId|ownerUserId|farmerId|sourceId|productId|produceListingId|provider|idempotency|fingerprint|moderation|taxId/u,
    );
    expect(publicRepository.listPublishedListings).toHaveBeenCalledWith({ limit: 20, sort: 'newest' });
  });

  it('normalizes and forwards bounded catalog filters for catalog and seller projections', async () => {
    const catalogResponse = await app.inject({
      method: 'GET',
      url:
        '/marketplace/public/catalog?section=seeds&category=seed&q=%20corn%20&region=%20Samarkand%20' +
        '&minPriceUzs=0&maxPriceUzs=9999999999999&minAvailableQuantity=1&limit=25&sort=price_asc',
    });

    expect(catalogResponse.statusCode).toBe(200);
    expect(publicRepository.listPublishedListings).toHaveBeenCalledWith({
      category: 'seed',
      limit: 25,
      maxPriceUzs: maximumUzsAmount,
      minAvailableQuantity: 1,
      minPriceUzs: 0,
      query: 'corn',
      region: 'Samarkand',
      section: 'seeds',
      sort: 'price_asc',
    });

    const sellerResponse = await app.inject({
      method: 'GET',
      url:
        `/marketplace/public/sellers/${publicSellerId}/catalog?section=produce&crop=%20Tomato%20` +
        '&minPriceUzs=100&minAvailableQuantity=2&sort=price_desc',
    });

    expect(sellerResponse.statusCode).toBe(200);
    expect(publicRepository.listPublishedSellerListings).toHaveBeenCalledWith(publicSellerId, {
      crop: 'Tomato',
      limit: 20,
      minAvailableQuantity: 2,
      minPriceUzs: 100,
      section: 'produce',
      sort: 'price_desc',
    });
  });

  it.each([
    ['fractional minimum price', 'minPriceUzs=1.5'],
    ['exponential maximum price', 'maxPriceUzs=1e3'],
    ['over-limit maximum price', 'maxPriceUzs=10000000000000'],
    ['zero minimum availability', 'minAvailableQuantity=0'],
    ['unknown category', 'category=private'],
    ['crop without Produce section', 'crop=Tomato'],
    ['crop in Seeds', 'section=seeds&crop=Tomato'],
    ['category in Produce', 'section=produce&category=seed'],
    ['reversed price range', 'minPriceUzs=10&maxPriceUzs=9'],
    ['private tenant selector', `tenantId=${tenantTwo}`],
    ['malformed cursor', 'cursor=not-a-cursor'],
    ['oversized cursor', `cursor=${'a'.repeat(513)}`],
    [
      'cursor tied to another sort',
      `sort=price_asc&cursor=${Buffer.from(
        JSON.stringify({
          id: publicListingId,
          kind: 'catalog',
          promoted: false,
          publishedAt: now.toISOString(),
          sort: 'newest',
        }),
      ).toString('base64url')}`,
    ],
  ])('rejects %s before querying the public repository', async (_caseName, query) => {
    const response = await app.inject({ method: 'GET', url: `/marketplace/public/catalog?${query}` });

    expectProblem(response, 400);
    expect(publicRepository.listPublishedListings).not.toHaveBeenCalled();
  });

  it.each([
    [publishedProductRecord({ tenantId: tenantOne, sourceId: requestId }), 'product', 'category'],
    [publishedProduceRecord({ tenantId: tenantOne, sourceId: requestId }), 'produce', 'crop'],
  ] as const)('returns an allowlisted %s detail through the discriminated envelope', async (record, kind, field) => {
    publicRepository.findPublishedListing.mockResolvedValue(record);

    const response = await app.inject({ method: 'GET', url: `/marketplace/public/catalog/${record.publicId}` });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: Record<string, unknown> }>();
    expect(body).toMatchObject({ data: { id: record.publicId, kind } });
    expect(typeof body.data[field]).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/tenantId|sourceId|provider|moderation|idempotency/u);
  });

  it('returns a safe anonymous 404 without a private fallback for an ineligible listing', async () => {
    publicRepository.findPublishedListing.mockResolvedValue(undefined);

    const response = await app.inject({ method: 'GET', url: `/marketplace/public/catalog/${publicListingId}` });

    expectProblem(response, 404);
    expect(publicRepository.findPublishedListing).toHaveBeenCalledWith(publicListingId);
    expect(repository.getCart).not.toHaveBeenCalled();
  });

  it('serves seller, suggestion, and request projections anonymously through explicit public allowlists', async () => {
    publicRepository.findPublishedSeller.mockResolvedValue({
      description: 'Verified seed cooperative',
      displayName: 'Zarafshon Agro',
      ownerUserId: sellerUserId,
      publicId: publicSellerId,
      region: 'Samarkand',
      taxId: 'private-tax-id',
      tenantId: tenantOne,
      verified: true,
    });
    publicRepository.listPublishedSuggestions.mockResolvedValue([
      {
        id: publicListingId,
        kind: 'listing',
        label: 'Corn F1',
        ownerUserId: sellerUserId,
        section: 'seeds',
        tenantId: tenantOne,
      },
    ]);
    publicRepository.listPublishedRequests.mockResolvedValue({
      items: [
        {
          budgetUzs: 45_000_000,
          buyerDisplayName: 'Bahor Farm',
          createdAt: now,
          ownerUserId: buyerUserId,
          product: 'Corn seed',
          publicId: requestPublicId,
          region: 'Samarkand',
          requirements: 'Certified',
          tenantId: tenantOne,
          title: 'Corn seed, 10 tons',
          updatedAt: now,
          volume: '10 tons',
        },
      ],
    });

    const [seller, suggestions, requests] = await Promise.all([
      app.inject({ method: 'GET', url: `/marketplace/public/sellers/${publicSellerId}` }),
      app.inject({ method: 'GET', url: '/marketplace/public/catalog/suggestions?q=%20corn%20&limit=5' }),
      app.inject({ method: 'GET', url: '/marketplace/public/requests?q=%20corn%20&region=%20Samarkand%20' }),
    ]);

    expect(seller.statusCode).toBe(200);
    expect(seller.json()).toEqual({
      data: {
        description: 'Verified seed cooperative',
        displayName: 'Zarafshon Agro',
        id: publicSellerId,
        provenance: 'live',
        region: 'Samarkand',
        verified: true,
      },
    });
    expect(suggestions.statusCode).toBe(200);
    expect(suggestions.json()).toEqual({
      data: { items: [{ id: publicListingId, kind: 'listing', label: 'Corn F1', section: 'seeds' }] },
    });
    expect(requests.statusCode).toBe(200);
    expect(requests.json()).toMatchObject({
      data: {
        items: [
          {
            buyerDisplayName: 'Bahor Farm',
            id: requestPublicId,
            product: 'Corn seed',
            region: 'Samarkand',
            title: 'Corn seed, 10 tons',
          },
        ],
      },
    });
    for (const response of [seller, suggestions, requests]) {
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.json())).not.toMatch(/tenantId|ownerUserId|taxId|provider|idempotency/u);
    }
    expect(publicRepository.listPublishedSuggestions).toHaveBeenCalledWith('corn', 5);
    expect(publicRepository.listPublishedRequests).toHaveBeenCalledWith({
      limit: 20,
      query: 'corn',
      region: 'Samarkand',
    });

    publicRepository.findPublishedSeller.mockResolvedValueOnce(undefined);
    const absent = await app.inject({ method: 'GET', url: `/marketplace/public/sellers/${publicSellerId}` });
    expectProblem(absent, 404);
    expect(absent.headers['set-cookie']).toBeUndefined();
  });

  it('publishes with server-derived organization data and replays the same HTTP command', async () => {
    const publication = {
      id: publicListingId,
      moderationStatus: 'pending' as const,
      revision: 0,
      section: 'seeds' as const,
      sellerPublicId: publicSellerId,
      sourceId: offerId,
      sourceKind: 'product' as const,
      status: 'paused' as const,
      updatedAt: now,
    };
    publicRepository.publishListing.mockResolvedValue(ok(publication));
    const request = {
      method: 'POST' as const,
      url: '/marketplace/publications/listings',
      headers: { ...authenticatedHeaders(sellerUserId), 'idempotency-key': 'publish-listing-0001' },
      payload: {
        section: 'seeds',
        sellerPartnerId,
        sourceId: offerId,
        sourceKind: 'product',
      },
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(publicRepository.publishListing).toHaveBeenNthCalledWith(
      1,
      { tenantId: tenantOne, userId: sellerUserId },
      'publish-listing-0001',
      {
        section: 'seeds',
        sellerPartnerId,
        sourceId: offerId,
        sourceKind: 'product',
      },
    );
    expect(publicRepository.publishListing).toHaveBeenNthCalledWith(
      2,
      { tenantId: tenantOne, userId: sellerUserId },
      'publish-listing-0001',
      {
        section: 'seeds',
        sellerPartnerId,
        sourceId: offerId,
        sourceKind: 'product',
      },
    );
  });

  it('lists reloadable owned publication status with bounded scope and no private source identifiers', async () => {
    publicRepository.listOwnedPublications.mockResolvedValue({
      listings: [
        {
          id: publicListingId,
          kind: 'listing',
          moderationStatus: 'approved',
          publishedAt: now,
          revision: 2,
          section: 'seeds',
          sellerPublicId: publicSellerId,
          sourceKind: 'product',
          status: 'published',
          title: 'Corn F1',
          updatedAt: now,
        },
      ],
      requests: [
        {
          buyerDisplayName: 'Bahor Farm',
          id: requestPublicId,
          kind: 'request',
          moderationStatus: 'pending',
          revision: 0,
          status: 'paused',
          title: 'Corn seed, 10 tons',
          updatedAt: now,
        },
      ],
    });

    const response = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/marketplace/publications/mine?limit=50',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        listings: [
          {
            id: publicListingId,
            kind: 'listing',
            sellerPublicId: publicSellerId,
            status: 'published',
            title: 'Corn F1',
          },
        ],
        requests: [
          {
            buyerDisplayName: 'Bahor Farm',
            id: requestPublicId,
            kind: 'request',
            status: 'paused',
            title: 'Corn seed, 10 tons',
          },
        ],
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(/tenantId|userId|partnerId|sourceId|requestId/u);
    expect(publicRepository.listOwnedPublications).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      50,
    );

    publicRepository.listOwnedPublications.mockClear();
    const unauthenticated = await app.inject({ method: 'GET', url: '/marketplace/publications/mine' });
    expectProblem(unauthenticated, 401);
    const overLimit = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/marketplace/publications/mine?limit=51',
    });
    expectProblem(overLimit, 400);
    expect(publicRepository.listOwnedPublications).not.toHaveBeenCalled();
  });

  it('derives request buyer display inside persistence and rejects caller-authored display fields', async () => {
    publicRepository.publishRequest.mockResolvedValue(
      ok({
        id: publicProduceId,
        moderationStatus: 'pending',
        requestId,
        revision: 0,
        status: 'paused',
        updatedAt: now,
      }),
    );
    const baseRequest = {
      method: 'POST' as const,
      url: '/marketplace/publications/requests',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'publish-request-0001' },
    };
    const response = await app.inject({
      ...baseRequest,
      payload: { buyerPartnerId, requestId },
    });

    expect(response.statusCode).toBe(200);
    expect(publicRepository.publishRequest).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      'publish-request-0001',
      { buyerPartnerId, requestId },
    );

    publicRepository.publishRequest.mockClear();
    const spoofed = await app.inject({
      ...baseRequest,
      payload: { buyerDisplayName: 'Spoofed Organization', buyerPartnerId, requestId },
    });
    expectProblem(spoofed, 400);
    expect(publicRepository.publishRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['missing idempotency key', 400, 'missing-key'],
    ['missing session', 401, 'missing-session'],
    ['unverified or unapproved owner', 403, 'forbidden'],
    ['foreign or missing source', 404, 'not_found'],
    ['changed-input replay', 409, 'conflict'],
  ] as const)('returns %i for %s without inventing publication success', async (_caseName, expectedStatus, mode) => {
    if (mode === 'forbidden' || mode === 'not_found' || mode === 'conflict') {
      publicRepository.publishListing.mockResolvedValue({ status: mode });
    }
    let headers: Record<string, string> = {
      ...authenticatedHeaders(sellerUserId),
      'idempotency-key': 'publish-listing-0002',
    };
    if (mode === 'missing-session') {
      headers = { 'idempotency-key': 'publish-listing-0002' };
    } else if (mode === 'missing-key') {
      headers = authenticatedHeaders(sellerUserId);
    }
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/publications/listings',
      headers,
      payload: { section: 'seeds', sellerPartnerId, sourceId: offerId, sourceKind: 'product' },
    });

    expectProblem(response, expectedStatus);
    if (mode === 'missing-session' || mode === 'missing-key') {
      expect(publicRepository.publishListing).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['missing account display', 'omit'],
    ['email-like display', 'buyer@example.test'],
    ['phone-like display', '+998 90 123 45 67'],
  ])('does not pass %s to the organization publication boundary', async (_caseName, displayName) => {
    publicRepository.publishListing.mockResolvedValue(
      ok({
        id: publicListingId,
        moderationStatus: 'pending',
        revision: 0,
        section: 'seeds',
        sellerPublicId: publicSellerId,
        sourceId: offerId,
        sourceKind: 'product',
        status: 'paused',
        updatedAt: now,
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/publications/listings',
      headers: {
        ...authenticatedHeaders(sellerUserId),
        'idempotency-key': 'publish-listing-0003',
        'x-test-display-name': displayName,
      },
      payload: { section: 'seeds', sellerPartnerId, sourceId: offerId, sourceKind: 'product' },
    });

    expect(response.statusCode).toBe(200);
    expect(publicRepository.publishListing).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: sellerUserId },
      'publish-listing-0003',
      { section: 'seeds', sellerPartnerId, sourceId: offerId, sourceKind: 'product' },
    );
    expect(response.payload).not.toContain(displayName);
  });

  it('exports Product and Produce as a oneOf discriminator for list and detail without public auth metadata', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Marketplace contract test').setVersion('1').build(),
    );
    const schemas = document.components?.schemas ?? {};

    expect(schemas['MarketplacePublicCatalogPageDto']).toMatchObject({
      properties: {
        items: {
          items: {
            discriminator: {
              mapping: {
                produce: '#/components/schemas/MarketplacePublicProduceListingDto',
                product: '#/components/schemas/MarketplacePublicProductListingDto',
              },
              propertyName: 'kind',
            },
            oneOf: [
              { $ref: '#/components/schemas/MarketplacePublicProductListingDto' },
              { $ref: '#/components/schemas/MarketplacePublicProduceListingDto' },
            ],
          },
          type: 'array',
        },
      },
    });
    const productSchema = schemas['MarketplacePublicProductListingDto'];
    expect(productSchema).toMatchObject({
      properties: {
        category: { enum: ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] },
        kind: { enum: ['product'] },
        section: { enum: ['equipment', 'seeds'] },
      },
    });
    expect((productSchema as { required?: unknown }).required).toEqual(
      expect.arrayContaining(['category', 'kind', 'section']),
    );
    const produceSchema = schemas['MarketplacePublicProduceListingDto'];
    expect(produceSchema).toMatchObject({
      properties: {
        crop: { type: 'string' },
        grade: { enum: ['A', 'B', 'C'] },
        kind: { enum: ['produce'] },
        section: { enum: ['produce'] },
      },
    });
    expect((produceSchema as { required?: unknown }).required).toEqual(
      expect.arrayContaining(['crop', 'grade', 'kind', 'section']),
    );
    const detailResponse = document.paths['/marketplace/public/catalog/{listingId}']?.get?.responses['200'];
    expect(detailResponse).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              data: {
                discriminator: { propertyName: 'kind' },
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(detailResponse)).toContain('#/components/schemas/MarketplacePublicProductListingDto');
    expect(JSON.stringify(detailResponse)).toContain('#/components/schemas/MarketplacePublicProduceListingDto');
    expect(document.paths['/marketplace/public/catalog']?.get?.security).toBeUndefined();
    expect(document.paths['/marketplace/publications/listings']?.post?.security).toEqual(expect.any(Array));
    expect(JSON.stringify(schemas['PublishMarketplaceListingDto'])).not.toContain('sellerDisplayName');
  });

  it('exports only opaque, organization-bound commerce command inputs with required replay keys', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Marketplace commerce contract test').setVersion('1').build(),
    );
    const schemas = document.components?.schemas ?? {};
    expect(schemas['AddToCartDto']).toMatchObject({
      properties: {
        actingPartnerId: { format: 'uuid' },
        listingPublicationId: { format: 'uuid' },
        quantity: { minimum: 1, type: 'integer' },
      },
    });
    expect((schemas['AddToCartDto'] as { required?: unknown }).required).toEqual(
      expect.arrayContaining(['actingPartnerId', 'listingPublicationId', 'quantity']),
    );
    expect(JSON.stringify(schemas['AddToCartDto'])).not.toMatch(/productId|seller|price/u);
    expect(schemas['CreateRequestDto']).toMatchObject({
      properties: { actingPartnerId: { format: 'uuid' } },
    });
    expect((schemas['CreateRequestDto'] as { required?: unknown }).required).toEqual(
      expect.arrayContaining(['actingPartnerId']),
    );
    expect(schemas['RequestOfferDto']).toMatchObject({
      properties: { actingPartnerId: { format: 'uuid' } },
    });
    expect((schemas['RequestOfferDto'] as { required?: unknown }).required).toEqual(
      expect.arrayContaining(['actingPartnerId']),
    );
    for (const operation of [
      document.paths['/marketplace/verification']?.post,
      document.paths['/marketplace/verification/submit']?.post,
      document.paths['/marketplace/cart/items']?.post,
      document.paths['/marketplace/requests']?.post,
      document.paths['/marketplace/requests/{id}/offers']?.post,
      document.paths['/marketplace/requests/{id}/offers/{offerId}/choose']?.post,
      document.paths['/marketplace/contracts/{id}/delivery-quote']?.patch,
    ]) {
      expect(operation?.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ in: 'header', name: 'Idempotency-Key', required: true })]),
      );
    }
    for (const operation of [
      document.paths['/marketplace/verification']?.post,
      document.paths['/marketplace/verification/submit']?.post,
      document.paths['/marketplace/contracts/{id}/delivery-quote']?.patch,
    ]) {
      const idempotencyParameter = operation?.parameters?.find(
        (parameter) => 'name' in parameter && parameter.name === 'Idempotency-Key',
      );
      expect(idempotencyParameter).toMatchObject({
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          maxLength: 100,
          minLength: 8,
          pattern: '^[A-Za-z0-9:_-]{8,100}$',
          type: 'string',
        },
      });
    }
    const startVerificationSchema = schemas['StartVerificationDto'] as {
      properties?: unknown;
      required?: string[];
    };
    expect(startVerificationSchema.properties).toMatchObject({
      expectedRevision: { minimum: 0, type: 'integer' },
      role: { enum: ['farmer', 'seller', 'buyer'] },
    });
    expect(startVerificationSchema.required).toEqual(expect.arrayContaining(['expectedRevision', 'role']));
    const submitVerificationSchema = schemas['SubmitVerificationDto'] as {
      properties?: unknown;
      required?: string[];
    };
    expect(submitVerificationSchema.properties).toMatchObject({
      expectedRevision: { minimum: 0, type: 'integer' },
    });
    expect(submitVerificationSchema.required).toEqual(expect.arrayContaining(['expectedRevision']));
    const deliveryQuoteSchema = schemas['ContractDeliveryQuoteDto'] as {
      properties?: unknown;
      required?: string[];
    };
    expect(deliveryQuoteSchema.properties).toMatchObject({
      expectedRevision: { minimum: 0, type: 'integer' },
    });
    expect(deliveryQuoteSchema.required).toEqual(expect.arrayContaining(['deliveryPriceUzs', 'expectedRevision']));
    for (const schemaName of ['CartViewDto', 'OfferViewDto']) {
      const safeSellerSchema = schemas[schemaName] as { properties?: unknown; required?: string[] };
      expect(safeSellerSchema.properties).toMatchObject({
        seller: { $ref: '#/components/schemas/MarketplaceSafePartyDto' },
      });
      expect(safeSellerSchema.required).toEqual(expect.arrayContaining(['seller']));
      expect(JSON.stringify(schemas[schemaName])).not.toMatch(/tenantId|userId|partnerId|sourceId/u);
    }
    expect(JSON.stringify(schemas['BuyerRequestViewDto'])).not.toMatch(/tenantId|userId|partnerId/u);
    expect(JSON.stringify(schemas['OfferSelectionResultDto'])).not.toMatch(/sellerUserId/u);
    expect(document.paths['/marketplace/publications/mine']?.get?.security).toEqual(expect.any(Array));
    expect(JSON.stringify(schemas['MarketplaceOwnedListingPublicationDto'])).not.toMatch(
      /sourceId|tenantId|userId|partnerId/u,
    );
    expect(JSON.stringify(schemas['MarketplaceOwnedRequestPublicationDto'])).not.toMatch(
      /requestId|tenantId|userId|partnerId/u,
    );
  });

  it('requires persisted command revisions and replay keys for verification creation and submission', async () => {
    verificationService.createVerification.mockResolvedValue(verificationRecord({ version: 1 }));
    verificationService.submitVerification.mockResolvedValue(
      verificationRecord({ status: 'pending', updatedAt: new Date('2026-08-09T00:01:00.000Z'), version: 2 }),
    );

    const created = await app.inject({
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'verification-create-http' },
      method: 'POST',
      payload: { expectedRevision: 0, role: 'farmer' },
      url: '/marketplace/verification',
    });
    const submitted = await app.inject({
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'verification-submit-http' },
      method: 'POST',
      payload: { expectedRevision: 1 },
      url: '/marketplace/verification/submit',
    });

    expect(created.statusCode).toBe(200);
    expect(created.json<VerificationHttpBody>().data).toMatchObject({ revision: 1, simulation: true });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json<VerificationHttpBody>().data).toMatchObject({ revision: 2 });
    expect(verificationService.createVerification).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      'farmer',
      0,
      'verification-create-http',
    );
    expect(verificationService.submitVerification).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      1,
      'verification-submit-http',
    );
    for (const response of [created, submitted]) {
      expect(JSON.stringify(response.json())).not.toMatch(
        /tenantId|userId|reviewedBy|providerSubjectKey|providerReceiptId/u,
      );
    }
  });

  it.each([
    ['/marketplace/verification', { expectedRevision: 0, role: 'farmer' }, verificationService.createVerification],
    ['/marketplace/verification/submit', { expectedRevision: 1 }, verificationService.submitVerification],
  ] as const)(
    'rejects a missing replay key on %s before verification persistence',
    async (url, payload, serviceMethod) => {
      const response = await app.inject({ headers: authenticatedHeaders(), method: 'POST', payload, url });

      expectProblem(response, 400);
      expect(serviceMethod).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      '/marketplace/verification',
      'short',
      { expectedRevision: 0, role: 'farmer' },
      verificationService.createVerification,
    ],
    [
      '/marketplace/verification/submit',
      'invalid key',
      { expectedRevision: 1 },
      verificationService.submitVerification,
    ],
    [
      `/marketplace/contracts/${contractId}/delivery-quote`,
      'x'.repeat(101),
      { deliveryPriceUzs: 100_000, expectedRevision: 0 },
      repository.updateContractDeliveryQuote,
    ],
  ] as const)(
    'rejects a malformed replay key on %s before persistence',
    async (url, idempotencyKey, payload, persistenceMethod) => {
      const response = await app.inject({
        headers: { ...authenticatedHeaders(), 'idempotency-key': idempotencyKey },
        method: url.includes('delivery-quote') ? 'PATCH' : 'POST',
        payload,
        url,
      });

      expectProblem(response, 400);
      expect(persistenceMethod).not.toHaveBeenCalled();
    },
  );

  it('discloses every exact provider capability without secret configuration', async () => {
    const readiness = {
      contractArtifactStorage: {
        mode: 'disabled',
        providerName: null,
        ready: false,
        reconciliation: 'disabled',
        simulation: false,
        timeoutMs: 10_000,
      },
      directPayment: {
        mode: 'disabled',
        providerName: null,
        ready: false,
        reconciliation: 'disabled',
        simulation: false,
        timeoutMs: 10_000,
      },
      factoring: {
        mode: 'disabled',
        providerName: null,
        ready: false,
        reconciliation: 'disabled',
        simulation: false,
        timeoutMs: 10_000,
      },
      oneId: {
        mode: 'mock',
        providerName: 'mock-oneid',
        ready: true,
        reconciliation: 'idempotent-retry',
        simulation: true,
        timeoutMs: 2_000,
      },
      promotionBilling: {
        mode: 'disabled',
        providerName: null,
        ready: false,
        reconciliation: 'disabled',
        simulation: false,
        timeoutMs: 10_000,
      },
      qualifiedSignature: {
        mode: 'disabled',
        providerName: null,
        ready: false,
        reconciliation: 'disabled',
        simulation: false,
        timeoutMs: 10_000,
      },
      verificationDocuments: {
        mode: 'mock',
        providerName: 'mock-document-storage',
        ready: true,
        reconciliation: 'idempotent-retry',
        simulation: true,
        timeoutMs: 3_000,
      },
    };
    verificationService.getProviderReadiness.mockReturnValue(readiness);

    const response = await app.inject({
      method: 'GET',
      url: '/marketplace/verification/providers/readiness',
      headers: authenticatedHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: readiness });
    expect(JSON.stringify(response.json())).not.toMatch(/secret|credential|token|privateKey/u);
  });

  it('accepts one exact 10 MiB PDF on the route-local limit and redacts private evidence/provider fields', async () => {
    const content = Buffer.alloc(10 * 1024 * 1024);
    content.set(Buffer.from('%PDF-'));
    let receivedDocuments: Array<Record<string, unknown> & { content: Uint8Array }> = [];
    verificationService.storeDocuments.mockImplementation(
      (_owner: unknown, documents: Array<Record<string, unknown> & { content: Uint8Array }>) => {
        receivedDocuments = documents;
        return Promise.resolve(
          verificationRecord({
            identityAssurance: 'legacy_unknown',
            providerMode: 'legacy',
            documents: [
              {
                ...documents[0],
                content: undefined,
                evidenceId: 'private-evidence-id',
                providerMode: 'mock',
                providerName: 'mock-document-storage',
                providerReceiptId: 'private-document-receipt',
                sha256: 'a'.repeat(64),
                sizeBytes: content.byteLength,
                storageKey: 'private-storage-key',
                storedAt: now.toISOString(),
              },
            ],
          }),
        );
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/verification/documents',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'document-key-0001' },
      payload: {
        contentBase64: content.toString('base64'),
        fileName: 'farm.pdf',
        kind: 'farm',
        mimeType: 'application/pdf',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(verificationService.storeDocuments).toHaveBeenCalledTimes(1);
    expect(receivedDocuments[0]).toMatchObject({ fileName: 'farm.pdf', kind: 'farm' });
    expect(receivedDocuments[0]?.content).toBeInstanceOf(Uint8Array);
    expect(receivedDocuments[0]?.content.byteLength).toBe(10 * 1024 * 1024);
    const body = response.json<VerificationHttpBody>();
    expect(body.data).toMatchObject({ providerMode: 'legacy', simulation: true });
    expect(body.data.documents).toEqual([expect.objectContaining({ simulation: true })]);
    expect(JSON.stringify(body)).not.toMatch(
      /private-provider-subject|private-provider-receipt|private-document-receipt|private-evidence-id|private-storage-key|"sha256"/u,
    );
  });

  it.each([
    {
      caseName: 'oversize evidence',
      content: (() => {
        const value = Buffer.alloc(10 * 1024 * 1024 + 1);
        value.set(Buffer.from('%PDF-'));
        return value;
      })(),
      mimeType: 'application/pdf',
    },
    { caseName: 'invalid magic', content: Buffer.from('not-a-png'), mimeType: 'image/png' },
  ])('rejects $caseName before provider orchestration', async ({ content, mimeType }) => {
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/verification/documents',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'document-key-0001' },
      payload: {
        contentBase64: content.toString('base64'),
        fileName: 'evidence.bin',
        kind: 'farm',
        mimeType,
      },
    });

    expectProblem(response, 400);
    expect(verificationService.storeDocuments).not.toHaveBeenCalled();
  });

  it.each(['../identity.pdf', '..\\identity.pdf', 'identity\u0000.pdf', 'identity\nproof.pdf'])(
    'rejects unsafe evidence filename %j before provider orchestration',
    async (fileName) => {
      const response = await app.inject({
        method: 'POST',
        url: '/marketplace/verification/documents',
        headers: { ...authenticatedHeaders(), 'idempotency-key': 'document-key-unsafe' },
        payload: {
          contentBase64: Buffer.from('%PDF-safe').toString('base64'),
          fileName,
          kind: 'farm',
          mimeType: 'application/pdf',
        },
      });

      expectProblem(response, 400);
      expect(verificationService.storeDocuments).not.toHaveBeenCalled();
    },
  );

  it('returns declared RFC 9457 413 when the encoded request exceeds the bounded route limit', async () => {
    const content = Buffer.alloc(10 * 1024 * 1024 + 700_000);
    content.set(Buffer.from('%PDF-'));
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/verification/documents',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'document-key-payload-limit' },
      payload: {
        contentBase64: content.toString('base64'),
        fileName: 'oversize.pdf',
        kind: 'farm',
        mimeType: 'application/pdf',
      },
    });

    expectProblem(response, 413);
    expect(verificationService.storeDocuments).not.toHaveBeenCalled();
  });

  it('returns typed provider-unavailable extensions without leaking provider identity', async () => {
    verificationService.linkOneId.mockRejectedValueOnce(
      new MarketplaceProviderUnavailableException({
        extensions: {
          capability: 'oneid_link',
          providerMode: 'mock',
          retryAfterSeconds: 30,
          retryable: true,
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/verification/oneid/link',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'oneid-key-unavailable' },
    });

    expectProblem(response, 503);
    const problem = response.json<
      ProblemBody & {
        capability: string;
        providerMode: string;
        retryAfterSeconds: number;
        retryable: boolean;
        type: string;
      }
    >();
    expect(problem).toMatchObject({
      capability: 'oneid_link',
      providerMode: 'mock',
      retryAfterSeconds: 30,
      retryable: true,
    });
    expect(problem.type).toContain('#marketplace-provider-unavailable');
    expect(JSON.stringify(problem)).not.toMatch(/subject|receipt|mock-oneid/u);
  });

  it('rejects a mismatched tenant header before the marketplace repository is addressed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/marketplace/cart/${cartId}`,
      headers: { ...authenticatedHeaders(), 'x-tenant-id': tenantTwo },
    });

    expectProblem(response, 401);
    expect(repository.getCart).not.toHaveBeenCalled();
  });

  it.each([
    {
      caseName: 'cart listing publication body',
      method: 'POST' as const,
      payload: { actingPartnerId: buyerPartnerId, listingPublicationId: 'not-a-uuid', quantity: 1 },
      url: '/marketplace/cart/items',
    },
    { caseName: 'cart path', method: 'GET' as const, url: '/marketplace/cart/not-a-uuid' },
    {
      caseName: 'cart listing publication path',
      method: 'PATCH' as const,
      payload: { quantity: 1 },
      url: `/marketplace/cart/${cartId}/items/not-a-uuid`,
    },
    {
      caseName: 'request path',
      method: 'POST' as const,
      payload: { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 4_000_000 },
      url: '/marketplace/requests/not-a-uuid/offers',
    },
    {
      caseName: 'offer path',
      method: 'POST' as const,
      url: `/marketplace/requests/${requestPublicId}/offers/not-a-uuid/choose`,
    },
  ])(
    'returns a 400 validation problem instead of reaching storage for an invalid UUID in $caseName',
    async (testCase) => {
      const response = await app.inject({
        method: testCase.method,
        url: testCase.url,
        headers: { ...authenticatedHeaders(), 'idempotency-key': 'invalid-uuid-0001' },
        payload: 'payload' in testCase ? testCase.payload : undefined,
      });

      expectProblem(response, 400);
      expect(response.statusCode).not.toBe(500);
      expect(repository.roleOf).not.toHaveBeenCalled();
      expect(repository.getCart).not.toHaveBeenCalled();
      expect(repository.addToCart).not.toHaveBeenCalled();
      expect(repository.makeOffer).not.toHaveBeenCalled();
      expect(repository.chooseOffer).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'whitespace-only request title',
      '/marketplace/requests',
      { actingPartnerId: buyerPartnerId, title: '   ', region: 'Samarkand' },
      '#/title',
    ],
    [
      'whitespace-only request region',
      '/marketplace/requests',
      { actingPartnerId: buyerPartnerId, title: 'Corn seed', region: '\t' },
      '#/region',
    ],
    [
      'whitespace-only request requirements',
      '/marketplace/requests',
      { actingPartnerId: buyerPartnerId, title: 'Corn seed', region: 'Samarkand', requirements: '   ' },
      '#/requirements',
    ],
    [
      'fractional UZS request budget',
      '/marketplace/requests',
      { actingPartnerId: buyerPartnerId, title: 'Corn seed', region: 'Samarkand', budgetUzs: 1.5 },
      '#/budgetUzs',
    ],
    [
      'out-of-range UZS request budget',
      '/marketplace/requests',
      {
        actingPartnerId: buyerPartnerId,
        title: 'Corn seed',
        region: 'Samarkand',
        budgetUzs: maximumUzsAmount + 1,
      },
      '#/budgetUzs',
    ],
    [
      'fractional UZS offer price',
      `/marketplace/requests/${requestPublicId}/offers`,
      { actingPartnerId: sellerPartnerId, priceUzs: 4_000_000.5, deliveryTerms: 'pickup' },
      '#/priceUzs',
    ],
    [
      'seller delivery without a quote',
      `/marketplace/requests/${requestPublicId}/offers`,
      { actingPartnerId: sellerPartnerId, priceUzs: 4_000_000, deliveryTerms: 'seller_delivery' },
      '#/deliveryPriceUzs',
    ],
    [
      'pickup with a seller-delivery quote',
      `/marketplace/requests/${requestPublicId}/offers`,
      {
        actingPartnerId: sellerPartnerId,
        priceUzs: 4_000_000,
        deliveryTerms: 'pickup',
        deliveryPriceUzs: 100_000,
      },
      '#/deliveryPriceUzs',
    ],
    [
      'fractional UZS delivery quote',
      `/marketplace/requests/${requestPublicId}/offers`,
      {
        actingPartnerId: sellerPartnerId,
        priceUzs: 4_000_000,
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000.5,
      },
      '#/deliveryPriceUzs',
    ],
    [
      'whitespace-only delivery note',
      `/marketplace/requests/${requestPublicId}/offers`,
      {
        actingPartnerId: sellerPartnerId,
        priceUzs: 4_000_000,
        deliveryTerms: 'pickup',
        deliveryNote: '   ',
      },
      '#/deliveryNote',
    ],
    [
      'out-of-range delivery duration',
      `/marketplace/requests/${requestPublicId}/offers`,
      { actingPartnerId: sellerPartnerId, priceUzs: 4_000_000, deliveryTerms: 'pickup', deliveryDays: 366 },
      '#/deliveryDays',
    ],
    [
      'fractional contract delivery quote',
      `/marketplace/contracts/${contractId}/delivery-quote`,
      { deliveryPriceUzs: 100_000.5, expectedRevision: 0 },
      '#/deliveryPriceUzs',
    ],
    [
      'whitespace-only contract delivery note',
      `/marketplace/contracts/${contractId}/delivery-quote`,
      { deliveryPriceUzs: 100_000, deliveryNote: '   ', expectedRevision: 0 },
      '#/deliveryNote',
    ],
    [
      'out-of-range contract delivery duration',
      `/marketplace/contracts/${contractId}/delivery-quote`,
      { deliveryPriceUzs: 100_000, deliveryDays: 366, expectedRevision: 0 },
      '#/deliveryDays',
    ],
    [
      'negative contract expected revision',
      `/marketplace/contracts/${contractId}/delivery-quote`,
      { deliveryPriceUzs: 100_000, expectedRevision: -1 },
      '#/expectedRevision',
    ],
  ])('returns validation problem details for %s', async (_caseName, url, payload, expectedPointer) => {
    const response = await app.inject({
      method: url.includes('delivery-quote') ? 'PATCH' : 'POST',
      url,
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'validation-command-0001' },
      payload,
    });

    expectProblem(response, 400);
    expect(response.json<ProblemBody>().errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ pointer: expectedPointer })]),
    );
    expect(repository.createRequest).not.toHaveBeenCalled();
    expect(repository.makeOffer).not.toHaveBeenCalled();
    expect(repository.updateContractDeliveryQuote).not.toHaveBeenCalled();
  });

  it.each([
    {
      method: 'POST' as const,
      payload: { actingPartnerId: buyerPartnerId, listingPublicationId: publicListingId, quantity: 1 },
      repositoryMethod: repository.addToCart,
      url: '/marketplace/cart/items',
    },
    {
      method: 'POST' as const,
      payload: { actingPartnerId: buyerPartnerId, region: 'Samarkand', title: 'Corn seed' },
      repositoryMethod: repository.createRequest,
      url: '/marketplace/requests',
    },
    {
      method: 'POST' as const,
      payload: { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 4_000_000 },
      repositoryMethod: repository.makeOffer,
      url: `/marketplace/requests/${requestPublicId}/offers`,
    },
    {
      method: 'POST' as const,
      payload: undefined,
      repositoryMethod: repository.chooseOffer,
      url: `/marketplace/requests/${requestPublicId}/offers/${offerId}/choose`,
    },
    {
      method: 'PATCH' as const,
      payload: { deliveryPriceUzs: 100_000, expectedRevision: 0 },
      repositoryMethod: repository.updateContractDeliveryQuote,
      url: `/marketplace/contracts/${contractId}/delivery-quote`,
    },
  ])('rejects a missing commerce idempotency key on $url', async ({ method, payload, repositoryMethod, url }) => {
    const response = await app.inject({
      method,
      url,
      headers: authenticatedHeaders(),
      payload,
    });

    expectProblem(response, 400);
    expect(repositoryMethod).not.toHaveBeenCalled();
  });

  it('returns 403 when the selected buyer organization is not an active approved membership', async () => {
    repository.createRequest.mockResolvedValue({ status: 'forbidden', field: 'organization' });

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/requests',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'request-membership-0001' },
      payload: { actingPartnerId: buyerPartnerId, title: 'Corn seed', region: 'Samarkand' },
    });

    expectProblem(response, 403);
    expect(repository.createRequest).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      { actingPartnerId: buyerPartnerId, title: 'Corn seed', region: 'Samarkand' },
      'request-membership-0001',
    );
    expect(repository.isApprovedOrganization).not.toHaveBeenCalled();
  });

  it('returns 403 when an authenticated but unverified user attempts a commercial mutation', async () => {
    repository.roleOf.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/requests',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'request-unverified-0001' },
      payload: { actingPartnerId: buyerPartnerId, title: 'Corn seed', region: 'Samarkand' },
    });

    expectProblem(response, 403);
    expect(repository.isApprovedOrganization).not.toHaveBeenCalled();
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('returns a safe 403 before an unverified cart mutation reaches persistence', async () => {
    repository.roleOf.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/cart/items',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'cart-unverified-0001' },
      payload: { actingPartnerId: buyerPartnerId, listingPublicationId: publicListingId, quantity: 1 },
    });

    expectProblem(response, 403);
    expect(repository.isApprovedOrganization).not.toHaveBeenCalled();
    expect(repository.addToCart).not.toHaveBeenCalled();
  });

  it('adds an opaque approved listing through a validated buyer organization and idempotency key', async () => {
    repository.addToCart.mockResolvedValue(
      ok({
        buyerPartnerId,
        buyerTenantId: tenantOne,
        buyerUserId,
        createdAt: now,
        id: cartId,
        items: [
          {
            listingPublicationId: publicListingId,
            quantity: 2,
            sourceId: offerId,
            sourceKind: 'product',
          },
        ],
        seller: { displayName: 'Zarafshon Agro', region: 'Samarkand' },
        sellerPartnerId,
        sellerTenantId: tenantTwo,
        sellerUserId,
        status: 'open',
        updatedAt: now,
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/cart/items',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'cart-listing-0001' },
      payload: { actingPartnerId: buyerPartnerId, listingPublicationId: publicListingId, quantity: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: cartId,
        items: [{ listingPublicationId: publicListingId, quantity: 2, sourceKind: 'product' }],
        seller: { displayName: 'Zarafshon Agro', region: 'Samarkand' },
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(
      /buyerTenantId|buyerUserId|buyerPartnerId|sellerTenantId|sellerUserId|sellerPartnerId|sourceId/u,
    );
    expect(repository.addToCart).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      { actingPartnerId: buyerPartnerId, listingPublicationId: publicListingId, quantity: 2 },
      'cart-listing-0001',
    );
  });

  it('rejects caller-authored seller and price authority before cart persistence', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/cart/items',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'cart-spoof-0001' },
      payload: {
        actingPartnerId: buyerPartnerId,
        listingPublicationId: publicListingId,
        priceUzs: 1,
        quantity: 1,
        sellerPartnerId,
      },
    });

    expectProblem(response, 400);
    expect(repository.addToCart).not.toHaveBeenCalled();
  });

  it('returns 409 and no contract reference for a stale offer selection', async () => {
    repository.chooseOffer.mockResolvedValue({ status: 'conflict', field: 'status' });

    const response = await app.inject({
      method: 'POST',
      url: `/marketplace/requests/${requestPublicId}/offers/${offerId}/choose`,
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'choose-stale-0001' },
    });

    expectProblem(response, 409);
    expect(repository.chooseOffer).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      requestPublicId,
      offerId,
      'choose-stale-0001',
    );
    expect(response.payload).not.toContain('contractId');
  });

  it('returns a safe 404 when a foreign-tenant cart is not visible', async () => {
    repository.getCart.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'GET',
      url: `/marketplace/cart/${foreignCartId}`,
      headers: authenticatedHeaders(buyerUserId, tenantOne),
    });

    expectProblem(response, 404);
    expect(repository.getCart).toHaveBeenCalledWith({ tenantId: tenantOne, userId: buyerUserId }, foreignCartId);
  });

  it('returns an OpenAPI-aligned 200 request envelope with principal-derived ownership', async () => {
    repository.createRequest.mockResolvedValue(
      ok({
        buyerPartnerId,
        id: requestId,
        tenantId: tenantOne,
        buyerUserId,
        title: 'Corn seed',
        region: 'Samarkand',
        deadline: '2026-09-01',
        budgetUzs: maximumUzsAmount,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/requests',
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'request-create-0001' },
      payload: {
        actingPartnerId: buyerPartnerId,
        title: 'Corn seed',
        region: 'Samarkand',
        deadline: '2026-09-01',
        budgetUzs: maximumUzsAmount,
        requirements: 'Certified seed',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: requestId,
        deadline: '2026-09-01',
        budgetUzs: maximumUzsAmount,
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(/tenantId|buyerUserId|buyerPartnerId/u);
    expect(repository.createRequest).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      {
        actingPartnerId: buyerPartnerId,
        title: 'Corn seed',
        region: 'Samarkand',
        deadline: '2026-09-01',
        budgetUzs: maximumUzsAmount,
        requirements: 'Certified seed',
      },
      'request-create-0001',
    );
  });

  it('accepts a bounded seller-delivery offer and returns its seller-authored terms', async () => {
    repository.roleOf.mockResolvedValue('seller');
    repository.makeOffer.mockResolvedValue(
      ok({
        buyerPartnerId,
        buyerTenantId: tenantOne,
        buyerUserId,
        id: offerId,
        requestPublicId,
        seller: { displayName: 'Zarafshon Agro', region: 'Samarkand' },
        sellerPartnerId,
        sellerTenantId: tenantTwo,
        sellerUserId,
        priceUzs: 4_000_000,
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000,
        deliveryNote: 'Delivered to Samarkand',
        deliveryDays: 3,
        status: 'pending',
        createdAt: now,
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/marketplace/requests/${requestPublicId}/offers`,
      headers: { ...authenticatedHeaders(sellerUserId, tenantTwo), 'idempotency-key': 'offer-create-0001' },
      payload: {
        actingPartnerId: sellerPartnerId,
        priceUzs: 4_000_000,
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000,
        deliveryNote: 'Delivered to Samarkand',
        deliveryDays: 3,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: offerId,
        requestPublicId,
        seller: { displayName: 'Zarafshon Agro', region: 'Samarkand' },
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000,
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(
      /buyerTenantId|buyerUserId|buyerPartnerId|sellerTenantId|sellerUserId|sellerPartnerId/u,
    );
    expect(repository.makeOffer).toHaveBeenCalledWith(
      { tenantId: tenantTwo, userId: sellerUserId },
      requestPublicId,
      {
        actingPartnerId: sellerPartnerId,
        deliveryDays: 3,
        deliveryNote: 'Delivered to Samarkand',
        deliveryPriceUzs: 100_000,
        deliveryTerms: 'seller_delivery',
        priceUzs: 4_000_000,
      },
      'offer-create-0001',
    );
  });

  it('returns the persisted contract reference from successful offer selection', async () => {
    repository.chooseOffer.mockResolvedValue(
      ok({
        requestPublicId,
        offerId,
        sellerUserId,
        contractId,
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/marketplace/requests/${requestPublicId}/offers/${offerId}/choose`,
      headers: { ...authenticatedHeaders(), 'idempotency-key': 'choose-offer-0001' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        requestPublicId,
        offerId,
        contractId,
      },
    });
    expect(repository.chooseOffer).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      requestPublicId,
      offerId,
      'choose-offer-0001',
    );
  });

  it('returns a persisted seller delivery quote through the contract response', async () => {
    repository.roleOf.mockResolvedValue('seller');
    repository.updateContractDeliveryQuote.mockResolvedValue(
      ok(
        contractRecord({
          deliveryDays: 3,
          deliveryNote: 'Delivered to Samarkand',
          deliveryPriceUzs: 100_000,
          deliveryTerms: 'seller_delivery',
          lines: [
            {
              lineTotalUzs: 4_000_000,
              name: 'Corn seed',
              quantity: 1,
              sourceId: offerId,
              sourceKind: 'product',
              sourcePublicationId: publicListingId,
              sourceRevision: 1,
              unit: 't',
              unitPriceUzs: 4_000_000,
            },
          ],
          sourceId: cartId,
          sourceType: 'cart_checkout',
          revision: 2,
        }),
      ),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: `/marketplace/contracts/${contractId}/delivery-quote`,
      headers: {
        ...authenticatedHeaders(sellerUserId, tenantTwo),
        'idempotency-key': 'delivery-quote-http-0001',
      },
      payload: {
        deliveryPriceUzs: 100_000,
        deliveryNote: 'Delivered to Samarkand',
        deliveryDays: 3,
        expectedRevision: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        actorParty: 'seller',
        id: contractId,
        revision: 2,
        buyerPartySnapshot: { legalName: 'Bahor Farm', region: 'Samarkand' },
        sellerPartySnapshot: { legalName: 'Zarafshon Agro', region: 'Samarkand' },
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000,
        status: 'draft',
      },
    });
    const contractView = response.json<{ data: Record<string, unknown> }>().data;
    for (const privateKey of [
      'buyerTenantId',
      'buyerUserId',
      'buyerPartnerId',
      'sellerTenantId',
      'sellerUserId',
      'sellerPartnerId',
      'sourceId',
    ]) {
      expect(contractView).not.toHaveProperty(privateKey);
    }
    expect(contractView.buyerPartySnapshot).toEqual({ legalName: 'Bahor Farm', region: 'Samarkand' });
    expect(contractView.sellerPartySnapshot).toEqual({ legalName: 'Zarafshon Agro', region: 'Samarkand' });
    expect(contractView.lines).toEqual([
      expect.objectContaining({ sourceKind: 'product', sourcePublicationId: publicListingId }),
    ]);
    expect((contractView.lines as Array<Record<string, unknown>>)[0]).not.toHaveProperty('sourceId');
    expect(repository.updateContractDeliveryQuote).toHaveBeenCalledWith(
      { tenantId: tenantTwo, userId: sellerUserId },
      contractId,
      {
        deliveryPriceUzs: 100_000,
        deliveryNote: 'Delivered to Samarkand',
        deliveryDays: 3,
        expectedRevision: 1,
      },
      'delivery-quote-http-0001',
    );
  });

  it('lists only the authenticated party contract projection', async () => {
    repository.listContracts.mockResolvedValue([contractRecord()]);

    const response = await app.inject({
      method: 'GET',
      url: '/marketplace/contracts',
      headers: authenticatedHeaders(buyerUserId, tenantOne),
    });

    expect(response.statusCode).toBe(200);
    const item = response.json<{ data: { items: Array<Record<string, unknown>> } }>().data.items[0];
    expect(item).toMatchObject({
      actorParty: 'buyer',
      id: contractId,
      buyerPartySnapshot: { legalName: 'Bahor Farm', region: 'Samarkand' },
      sellerPartySnapshot: { legalName: 'Zarafshon Agro', region: 'Samarkand' },
    });
    expect(item).not.toHaveProperty('buyerTenantId');
    expect(item).not.toHaveProperty('buyerUserId');
    expect(item).not.toHaveProperty('buyerPartnerId');
    expect(item).not.toHaveProperty('sellerTenantId');
    expect(item).not.toHaveProperty('sellerUserId');
    expect(item).not.toHaveProperty('sellerPartnerId');
    expect(item).not.toHaveProperty('sourceId');
    expect((item?.lines as Array<Record<string, unknown>>)[0]).not.toHaveProperty('sourceId');
    expect(repository.listContracts).toHaveBeenCalledWith({ tenantId: tenantOne, userId: buyerUserId });
  });
});
