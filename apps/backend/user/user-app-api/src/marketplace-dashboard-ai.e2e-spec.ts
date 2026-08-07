// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  MarketplaceDashboardAiController,
  MarketplaceDashboardAiRepositoryInjectToken,
  MarketplaceDashboardAiService,
  type MarketplaceDashboardAiRepository,
} from '@app/backend-feature-agritech-main';
import {
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';

const tenantId = '11111111-1111-4111-8111-111111111111';
const buyerUserId = '22222222-2222-4222-8222-222222222222';
const consultationId = '33333333-3333-4333-8333-333333333333';
const listingPublicationId = '44444444-4444-4444-8444-444444444444';
const sellerPublicId = '55555555-5555-4555-8555-555555555555';
const buyerPartnerId = '66666666-6666-4666-8666-666666666666';
const cartId = '77777777-7777-4777-8777-777777777777';
const timestamp = new Date('2030-01-01T00:00:00.000Z');

const consultation = {
  answer: 'catalog_match' as const,
  createdAt: timestamp,
  id: consultationId,
  kind: 'find_cheaper' as const,
  listingPublicationIds: [listingPublicationId],
  question: 'corn [redacted-email]',
  response: {
    explanationCodes: [
      'grounded_at_consultation_time' as const,
      'lowest_current_price_first' as const,
      'stock_revalidated_on_confirmation' as const,
    ],
    recommendations: [
      {
        availability: {
          quantity: 20,
          status: 'in_stock_at_consultation' as const,
          unit: 'kg',
          warningCode: 'stock_may_change' as const,
        },
        listingPublicationId,
        priceUzs: 4_080_000,
        reasonCodes: ['query_terms_match' as const, 'current_public_stock' as const, 'lowest_current_price' as const],
        sellerPublicId,
        titles: {
          en: 'EN certified corn sentinel',
          ru: 'RU certified corn sentinel',
          uz: 'UZ certified corn sentinel',
          uzCyrl: 'UZ-CYRL certified corn sentinel',
        },
      },
    ],
    starterCartPreview: {
      sellerPartitions: [{ listingPublicationIds: [listingPublicationId], sellerPublicId }],
      status: 'requires_confirmation' as const,
    },
  },
  updatedAt: timestamp,
};

const starterCart = {
  carts: [{ cartId, listingPublicationIds: [listingPublicationId], sellerPublicId }],
  confirmedAt: timestamp,
  consultationId,
  status: 'confirmed' as const,
};

const repository = {
  confirmAiStarterCart: vi.fn<MarketplaceDashboardAiRepository['confirmAiStarterCart']>(),
  createAiConsultation: vi.fn<MarketplaceDashboardAiRepository['createAiConsultation']>(),
  getRoleDashboard: vi.fn<MarketplaceDashboardAiRepository['getRoleDashboard']>(),
  listAiConsultations: vi.fn<MarketplaceDashboardAiRepository['listAiConsultations']>(),
};

const authenticatedHeaders = {
  'x-test-subject': buyerUserId,
  'x-test-tenant': tenantId,
};

function expectProblem(
  response: { headers: Record<string, unknown>; json(): unknown; statusCode: number },
  status: number,
) {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toEqual(expect.stringContaining('application/problem+json'));
  expect(response.json()).toMatchObject({ status });
}

describe('marketplace dashboard and grounded AI HTTP contract', () => {
  let app: NestFastifyApplication;
  let openApi: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceDashboardAiController],
      providers: [
        MarketplaceDashboardAiService,
        { provide: MarketplaceDashboardAiRepositoryInjectToken, useValue: repository },
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
        const requestTenantId = request.headers['x-test-tenant'];
        if (typeof subject === 'string' && typeof requestTenantId === 'string') {
          const principal: AuthenticatedPrincipal = {
            permissions: [],
            roles: [],
            subject,
            tenantId: requestTenantId,
          };
          (request as unknown as AuthenticatedRequest).session = { user: principal };
        }
        done();
      });
    await app.init();
    openApi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Marketplace dashboard AI contract test').setVersion('1').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    repository.createAiConsultation.mockResolvedValue({ status: 'ok', value: consultation });
    repository.listAiConsultations.mockResolvedValue([consultation]);
    repository.confirmAiStarterCart.mockResolvedValue({ status: 'ok', value: starterCart });
    repository.getRoleDashboard.mockResolvedValue({
      status: 'ok',
      value: {
        buyer: {
          activeDeals: 1,
          completedDeals: 2,
          completedSpendUzs: 40_800_000,
          openCarts: 1,
          openPurchaseRequests: 1,
        },
        generatedAt: timestamp,
        monthlyActivity: [],
        recentDeals: [],
        role: 'buyer',
      },
    });
  });

  it('requires an authenticated session before dashboard or consultation reads', async () => {
    const [dashboard, consultations] = await Promise.all([
      app.inject({ method: 'GET', url: '/marketplace/dashboard' }),
      app.inject({ method: 'GET', url: '/marketplace/ai/consultations' }),
    ]);

    expectProblem(dashboard, 401);
    expectProblem(consultations, 401);
    expect(repository.getRoleDashboard).not.toHaveBeenCalled();
    expect(repository.listAiConsultations).not.toHaveBeenCalled();
  });

  it('requires an idempotency key and a bounded nonblank question before persistence', async () => {
    const missingKey = await app.inject({
      headers: authenticatedHeaders,
      method: 'POST',
      payload: { kind: 'recommendation', question: 'corn seed' },
      url: '/marketplace/ai/consultations',
    });
    const blankQuestion = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'ai-create-0001' },
      method: 'POST',
      payload: { kind: 'recommendation', question: '   ' },
      url: '/marketplace/ai/consultations',
    });
    const oversizedQuestion = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'ai-create-0002' },
      method: 'POST',
      payload: { kind: 'recommendation', question: 'x'.repeat(2_001) },
      url: '/marketplace/ai/consultations',
    });
    const bidiSpoofedQuestion = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'ai-create-0003' },
      method: 'POST',
      payload: { kind: 'recommendation', question: 'corn\u202Etxt' },
      url: '/marketplace/ai/consultations',
    });

    expectProblem(missingKey, 400);
    expectProblem(blankQuestion, 400);
    expectProblem(oversizedQuestion, 400);
    expectProblem(bidiSpoofedQuestion, 400);
    expect(repository.createAiConsultation).not.toHaveBeenCalled();
  });

  it('returns a structured grounded historical snapshot with only public opaque identities', async () => {
    const response = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'ai-create-0001' },
      method: 'POST',
      payload: { kind: 'find_cheaper', question: 'corn grower@example.test' },
      url: '/marketplace/ai/consultations',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        answer: 'catalog_match',
        id: consultationId,
        listingPublicationIds: [listingPublicationId],
        response: {
          explanationCodes: [
            'grounded_at_consultation_time',
            'lowest_current_price_first',
            'stock_revalidated_on_confirmation',
          ],
          recommendations: [
            {
              availability: {
                quantity: 20,
                status: 'in_stock_at_consultation',
                warningCode: 'stock_may_change',
              },
              listingPublicationId,
              priceUzs: 4_080_000,
              reasonCodes: ['query_terms_match', 'current_public_stock', 'lowest_current_price'],
              sellerPublicId,
              titles: {
                en: 'EN certified corn sentinel',
                ru: 'RU certified corn sentinel',
                uz: 'UZ certified corn sentinel',
                uzCyrl: 'UZ-CYRL certified corn sentinel',
              },
            },
          ],
          starterCartPreview: { status: 'requires_confirmation' },
        },
      },
    });
    const serialized = JSON.stringify(response.json());
    for (const privateField of ['tenantId', 'userId', 'sourceId', 'productId', 'partnerId', 'promotion']) {
      expect(serialized).not.toContain(privateField);
    }
    expect(repository.createAiConsultation).toHaveBeenCalledWith(
      { tenantId, userId: buyerUserId },
      'find_cheaper',
      'corn grower@example.test',
      'ai-create-0001',
    );
  });

  it('returns an explicit safe no-data state instead of inventing seasonal advice', async () => {
    repository.createAiConsultation.mockResolvedValue({
      status: 'ok',
      value: {
        ...consultation,
        answer: 'no_catalog_match',
        kind: 'season_advice',
        listingPublicationIds: [],
        response: {
          explanationCodes: ['no_grounded_catalog_match', 'seasonal_calendar_unavailable'],
          recommendations: [],
          starterCartPreview: { sellerPartitions: [], status: 'unavailable' },
        },
      },
    });
    const response = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'ai-season-0001' },
      method: 'POST',
      payload: { kind: 'season_advice', question: 'unverified seasonal calendar' },
      url: '/marketplace/ai/consultations',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        answer: 'no_catalog_match',
        listingPublicationIds: [],
        response: {
          explanationCodes: ['no_grounded_catalog_match', 'seasonal_calendar_unavailable'],
          recommendations: [],
          starterCartPreview: { sellerPartitions: [], status: 'unavailable' },
        },
      },
    });
  });

  it('maps changed create replay to conflict and scopes dashboard/list reads to the session owner', async () => {
    repository.createAiConsultation.mockResolvedValue({ status: 'conflict', field: 'idempotencyKey' });
    const conflict = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'ai-create-0001' },
      method: 'POST',
      payload: { kind: 'generic', question: 'changed question' },
      url: '/marketplace/ai/consultations',
    });
    expectProblem(conflict, 409);

    const [dashboard, list] = await Promise.all([
      app.inject({ headers: authenticatedHeaders, method: 'GET', url: '/marketplace/dashboard' }),
      app.inject({ headers: authenticatedHeaders, method: 'GET', url: '/marketplace/ai/consultations' }),
    ]);
    expect(dashboard.statusCode).toBe(200);
    expect(list.statusCode).toBe(200);
    expect(repository.getRoleDashboard).toHaveBeenCalledWith({ tenantId, userId: buyerUserId });
    expect(repository.listAiConsultations).toHaveBeenCalledWith({ tenantId, userId: buyerUserId });
  });

  it('requires explicit confirmation and a valid key before starter-cart persistence', async () => {
    const cancelled = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'starter-cart-0001' },
      method: 'POST',
      payload: { actingPartnerId: buyerPartnerId, confirmed: false },
      url: `/marketplace/ai/consultations/${consultationId}/starter-cart`,
    });
    const missingKey = await app.inject({
      headers: authenticatedHeaders,
      method: 'POST',
      payload: { actingPartnerId: buyerPartnerId, confirmed: true },
      url: `/marketplace/ai/consultations/${consultationId}/starter-cart`,
    });

    expectProblem(cancelled, 400);
    expectProblem(missingKey, 400);
    expect(repository.confirmAiStarterCart).not.toHaveBeenCalled();
  });

  it('confirms through the session owner and maps exact-command conflicts safely', async () => {
    const response = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'starter-cart-0001' },
      method: 'POST',
      payload: { actingPartnerId: buyerPartnerId, confirmed: true },
      url: `/marketplace/ai/consultations/${consultationId}/starter-cart`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { ...starterCart, confirmedAt: timestamp.toISOString() },
    });
    expect(repository.confirmAiStarterCart).toHaveBeenCalledWith(
      { tenantId, userId: buyerUserId },
      consultationId,
      { actingPartnerId: buyerPartnerId, confirmed: true },
      'starter-cart-0001',
    );

    repository.confirmAiStarterCart.mockResolvedValue({ status: 'conflict', field: 'idempotencyKey' });
    const conflict = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'starter-cart-0001' },
      method: 'POST',
      payload: { actingPartnerId: buyerPartnerId, confirmed: true },
      url: `/marketplace/ai/consultations/${consultationId}/starter-cart`,
    });
    expectProblem(conflict, 409);

    repository.confirmAiStarterCart.mockResolvedValue({ status: 'conflict', field: 'listingPublicationId' });
    const stalePublication = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'starter-cart-stale-0001' },
      method: 'POST',
      payload: { actingPartnerId: buyerPartnerId, confirmed: true },
      url: `/marketplace/ai/consultations/${consultationId}/starter-cart`,
    });
    expectProblem(stalePublication, 409);
    const stalePayload = JSON.stringify(stalePublication.json());
    for (const privateField of ['tenantId', 'userId', 'sourceId', 'productId', 'partnerId']) {
      expect(stalePayload).not.toContain(privateField);
    }
  });

  it('publishes only the canonical dashboard and consultation paths', () => {
    expect(openApi.paths['/marketplace/dashboard']?.get).toBeDefined();
    expect(openApi.paths['/marketplace/ai/consultations']?.post).toBeDefined();
    expect(openApi.paths['/marketplace/ai/consultations']?.get).toBeDefined();
    expect(openApi.paths['/marketplace/ai/consultations/{id}/starter-cart']?.post).toBeDefined();
    expect(openApi.paths['/marketplace/ai']).toBeUndefined();
  });
});
