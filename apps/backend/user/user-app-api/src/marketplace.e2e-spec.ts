// @requirements REQ-AGRITECH-MARKETPLACE-016
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  MarketplaceController,
  MarketplaceRepositoryInjectToken,
  MarketplaceService,
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
const foreignContractId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const maximumUzsAmount = 9_999_999_999_999;
const now = new Date('2026-08-09T00:00:00.000Z');

const ok = <T>(value: T) => ({ status: 'ok' as const, value });

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
    signContract: vi.fn(),
    listContracts: vi.fn(),
    listTenantContracts: vi.fn(),
    askAi: vi.fn(),
    listAiConsultations: vi.fn(),
    roleOf: vi.fn(),
  };
}

const repository = createRepositoryFixture();

const authenticatedHeaders = (subject = buyerUserId, tenantId = tenantOne) => ({
  'x-request-id': '33333333-3333-4333-8333-333333333333',
  'x-test-subject': subject,
  'x-test-tenant': tenantId,
});

interface ProblemBody {
  status?: number;
  errors?: Array<{ pointer?: string }>;
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
      controllers: [MarketplaceController],
      providers: [
        MarketplaceService,
        { provide: MarketplaceRepositoryInjectToken, useValue: repository },
        SessionAuthGuard,
        { provide: APP_GUARD, useExisting: SessionAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ExceptionsFilter());
    app.useGlobalPipes(createValidationPipe());
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, _reply, done) => {
        const subject = request.headers['x-test-subject'];
        const tenantId = request.headers['x-test-tenant'];
        if (typeof subject === 'string' && typeof tenantId === 'string') {
          const principal: AuthenticatedPrincipal = {
            subject,
            tenantId,
            roles: [],
            permissions: [],
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
  });

  it('returns RFC 9457 401 for a missing server-side session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/requests',
      payload: { title: 'Corn seed', region: 'Samarkand' },
    });

    expectProblem(response, 401);
    expect(repository.createRequest).not.toHaveBeenCalled();
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
      caseName: 'cart product body',
      method: 'POST' as const,
      payload: { productId: 'not-a-uuid', quantity: 1 },
      url: '/marketplace/cart/items',
    },
    {
      caseName: 'sample product body',
      method: 'POST' as const,
      payload: { productId: 'not-a-uuid' },
      url: '/marketplace/samples',
    },
    {
      caseName: 'favorite product body',
      method: 'POST' as const,
      payload: { productId: 'not-a-uuid' },
      url: '/marketplace/favorites',
    },
    { caseName: 'cart path', method: 'GET' as const, url: '/marketplace/cart/not-a-uuid' },
    {
      caseName: 'cart product path',
      method: 'PATCH' as const,
      payload: { quantity: 1 },
      url: `/marketplace/cart/${cartId}/items/not-a-uuid`,
    },
    {
      caseName: 'request path',
      method: 'POST' as const,
      payload: { deliveryTerms: 'pickup', priceUzs: 4_000_000 },
      url: '/marketplace/requests/not-a-uuid/offers',
    },
    {
      caseName: 'offer path',
      method: 'POST' as const,
      url: `/marketplace/requests/${requestId}/offers/not-a-uuid/choose`,
    },
    { caseName: 'contract path', method: 'POST' as const, url: '/marketplace/contracts/not-a-uuid/sign' },
  ])(
    'returns a 400 validation problem instead of reaching storage for an invalid UUID in $caseName',
    async (testCase) => {
      const response = await app.inject({
        method: testCase.method,
        url: testCase.url,
        headers: authenticatedHeaders(),
        payload: 'payload' in testCase ? testCase.payload : undefined,
      });

      expectProblem(response, 400);
      expect(response.statusCode).not.toBe(500);
      expect(repository.roleOf).not.toHaveBeenCalled();
      expect(repository.getCart).not.toHaveBeenCalled();
      expect(repository.addToCart).not.toHaveBeenCalled();
      expect(repository.makeOffer).not.toHaveBeenCalled();
      expect(repository.chooseOffer).not.toHaveBeenCalled();
      expect(repository.signContract).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['whitespace-only request title', '/marketplace/requests', { title: '   ', region: 'Samarkand' }, '#/title'],
    ['whitespace-only request region', '/marketplace/requests', { title: 'Corn seed', region: '\t' }, '#/region'],
    [
      'whitespace-only request requirements',
      '/marketplace/requests',
      { title: 'Corn seed', region: 'Samarkand', requirements: '   ' },
      '#/requirements',
    ],
    [
      'fractional UZS request budget',
      '/marketplace/requests',
      { title: 'Corn seed', region: 'Samarkand', budgetUzs: 1.5 },
      '#/budgetUzs',
    ],
    [
      'out-of-range UZS request budget',
      '/marketplace/requests',
      { title: 'Corn seed', region: 'Samarkand', budgetUzs: maximumUzsAmount + 1 },
      '#/budgetUzs',
    ],
    [
      'fractional UZS offer price',
      `/marketplace/requests/${requestId}/offers`,
      { priceUzs: 4_000_000.5, deliveryTerms: 'pickup' },
      '#/priceUzs',
    ],
    [
      'seller delivery without a quote',
      `/marketplace/requests/${requestId}/offers`,
      { priceUzs: 4_000_000, deliveryTerms: 'seller_delivery' },
      '#/deliveryPriceUzs',
    ],
    [
      'pickup with a seller-delivery quote',
      `/marketplace/requests/${requestId}/offers`,
      { priceUzs: 4_000_000, deliveryTerms: 'pickup', deliveryPriceUzs: 100_000 },
      '#/deliveryPriceUzs',
    ],
    [
      'fractional UZS delivery quote',
      `/marketplace/requests/${requestId}/offers`,
      { priceUzs: 4_000_000, deliveryTerms: 'seller_delivery', deliveryPriceUzs: 100_000.5 },
      '#/deliveryPriceUzs',
    ],
    [
      'whitespace-only delivery note',
      `/marketplace/requests/${requestId}/offers`,
      { priceUzs: 4_000_000, deliveryTerms: 'pickup', deliveryNote: '   ' },
      '#/deliveryNote',
    ],
    [
      'out-of-range delivery duration',
      `/marketplace/requests/${requestId}/offers`,
      { priceUzs: 4_000_000, deliveryTerms: 'pickup', deliveryDays: 366 },
      '#/deliveryDays',
    ],
    [
      'fractional contract delivery quote',
      `/marketplace/contracts/${contractId}/delivery-quote`,
      { deliveryPriceUzs: 100_000.5 },
      '#/deliveryPriceUzs',
    ],
    [
      'whitespace-only contract delivery note',
      `/marketplace/contracts/${contractId}/delivery-quote`,
      { deliveryPriceUzs: 100_000, deliveryNote: '   ' },
      '#/deliveryNote',
    ],
    [
      'out-of-range contract delivery duration',
      `/marketplace/contracts/${contractId}/delivery-quote`,
      { deliveryPriceUzs: 100_000, deliveryDays: 366 },
      '#/deliveryDays',
    ],
  ])('returns validation problem details for %s', async (_caseName, url, payload, expectedPointer) => {
    const response = await app.inject({
      method: url.includes('delivery-quote') ? 'PATCH' : 'POST',
      url,
      headers: authenticatedHeaders(),
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

  it('returns 403 when a verified buyer has no approved buyer organization', async () => {
    repository.isApprovedOrganization.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/requests',
      headers: authenticatedHeaders(),
      payload: { title: 'Corn seed', region: 'Samarkand' },
    });

    expectProblem(response, 403);
    expect(repository.isApprovedOrganization).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      'buyer',
    );
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('returns 403 when an authenticated but unverified user attempts a commercial mutation', async () => {
    repository.roleOf.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/marketplace/requests',
      headers: authenticatedHeaders(),
      payload: { title: 'Corn seed', region: 'Samarkand' },
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
      headers: authenticatedHeaders(),
      payload: { productId: offerId, quantity: 1 },
    });

    expectProblem(response, 403);
    expect(repository.isApprovedOrganization).not.toHaveBeenCalled();
    expect(repository.addToCart).not.toHaveBeenCalled();
  });

  it('returns 409 and no contract reference for a stale offer selection', async () => {
    repository.chooseOffer.mockResolvedValue({ status: 'conflict', field: 'status' });

    const response = await app.inject({
      method: 'POST',
      url: `/marketplace/requests/${requestId}/offers/${offerId}/choose`,
      headers: authenticatedHeaders(),
    });

    expectProblem(response, 409);
    expect(repository.chooseOffer).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      requestId,
      offerId,
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

  it('returns 403 when an authenticated but foreign contract party tries to sign', async () => {
    repository.signContract.mockResolvedValue({ status: 'forbidden', field: 'party' });

    const response = await app.inject({
      method: 'POST',
      url: `/marketplace/contracts/${foreignContractId}/sign`,
      headers: authenticatedHeaders(foreignUserId, tenantOne),
    });

    expectProblem(response, 403);
    expect(repository.signContract).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: foreignUserId },
      foreignContractId,
    );
  });

  it('returns an OpenAPI-aligned 200 request envelope with principal-derived ownership', async () => {
    repository.createRequest.mockResolvedValue(
      ok({
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
      headers: authenticatedHeaders(),
      payload: {
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
        tenantId: tenantOne,
        buyerUserId,
        deadline: '2026-09-01',
        budgetUzs: maximumUzsAmount,
      },
    });
    expect(repository.createRequest).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: buyerUserId },
      {
        title: 'Corn seed',
        region: 'Samarkand',
        deadline: '2026-09-01',
        budgetUzs: maximumUzsAmount,
        requirements: 'Certified seed',
      },
    );
  });

  it('accepts a bounded seller-delivery offer and returns its seller-authored terms', async () => {
    repository.roleOf.mockResolvedValue('seller');
    repository.makeOffer.mockResolvedValue(
      ok({
        id: offerId,
        requestId,
        tenantId: tenantOne,
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
      url: `/marketplace/requests/${requestId}/offers`,
      headers: authenticatedHeaders(sellerUserId),
      payload: {
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
        sellerUserId,
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000,
      },
    });
    expect(repository.makeOffer).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: sellerUserId },
      requestId,
      4_000_000,
      'seller_delivery',
      100_000,
      'Delivered to Samarkand',
      3,
    );
  });

  it('returns the persisted contract reference from successful offer selection', async () => {
    repository.chooseOffer.mockResolvedValue(
      ok({
        requestId,
        offerId,
        sellerUserId,
        contractId,
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/marketplace/requests/${requestId}/offers/${offerId}/choose`,
      headers: authenticatedHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        requestId,
        offerId,
        sellerUserId,
        contractId,
      },
    });
  });

  it('returns a persisted seller delivery quote through the contract response', async () => {
    repository.roleOf.mockResolvedValue('seller');
    repository.updateContractDeliveryQuote.mockResolvedValue(
      ok({
        id: contractId,
        tenantId: tenantOne,
        buyerUserId,
        sellerUserId,
        sourceType: 'cart_checkout',
        sourceId: cartId,
        subject: 'Corn seed',
        amountUzs: 4_000_000,
        lines: [],
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000,
        deliveryNote: 'Delivered to Samarkand',
        deliveryDays: 3,
        factoringEnabled: false,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      }),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: `/marketplace/contracts/${contractId}/delivery-quote`,
      headers: authenticatedHeaders(sellerUserId),
      payload: {
        deliveryPriceUzs: 100_000,
        deliveryNote: 'Delivered to Samarkand',
        deliveryDays: 3,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: contractId,
        sellerUserId,
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: 100_000,
        status: 'draft',
      },
    });
    expect(repository.updateContractDeliveryQuote).toHaveBeenCalledWith(
      { tenantId: tenantOne, userId: sellerUserId },
      contractId,
      {
        deliveryPriceUzs: 100_000,
        deliveryNote: 'Delivered to Samarkand',
        deliveryDays: 3,
      },
    );
  });

  it('returns the persisted party-specific consent state after signing', async () => {
    repository.signContract.mockResolvedValue(
      ok({
        id: contractId,
        tenantId: tenantOne,
        buyerUserId,
        sellerUserId,
        sourceType: 'offer_selection',
        sourceId: offerId,
        subject: 'Corn seed',
        amountUzs: 4_000_000,
        lines: [],
        deliveryTerms: 'pickup',
        deliveryPriceUzs: 0,
        factoringEnabled: false,
        status: 'signed',
        buyerSignedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/marketplace/contracts/${contractId}/sign`,
      headers: authenticatedHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: contractId,
        buyerUserId,
        sellerUserId,
        status: 'signed',
        buyerSignedAt: now.toISOString(),
      },
    });
    expect(repository.signContract).toHaveBeenCalledWith({ tenantId: tenantOne, userId: buyerUserId }, contractId);
  });
});
