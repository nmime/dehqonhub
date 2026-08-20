// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  MarketplacePromotionBillingProviderInjectToken,
  MarketplacePromotionController,
  MarketplacePromotionRepositoryInjectToken,
  MarketplacePromotionService,
  MarketplaceProviderConfigInjectToken,
  MarketplaceProviderOperationRepositoryInjectToken,
  MockPromotionBillingProvider,
  resolveMarketplaceProviderConfig,
  type MarketplaceListingPromotion,
  type MarketplacePromotionBillingProvider,
  type MarketplacePromotionRepository,
  type MarketplaceProviderOperationRepository,
} from '@app/backend-feature-agritech-main';
import {
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';

const tenantId = '11111111-1111-4111-8111-111111111111';
const sellerUserId = '22222222-2222-4222-8222-222222222222';
const listingPublicId = '33333333-3333-4333-8333-333333333333';
const promotionId = '44444444-4444-4444-8444-444444444444';
const actingPartnerId = '55555555-5555-4555-8555-555555555555';
const timestamp = new Date('2030-01-01T00:00:00.000Z');

const promotion: MarketplaceListingPromotion = {
  activatedAt: timestamp,
  activationReference: `promotion:${promotionId}`,
  createdAt: timestamp,
  currency: 'UZS',
  endsAt: new Date('2030-01-08T00:00:00.000Z'),
  id: promotionId,
  listingPublicId,
  planCode: 'catalog_7d',
  priceUzs: 150_000,
  revision: 0,
  sellerPartnerId: actingPartnerId,
  startsAt: timestamp,
  status: 'active',
  updatedAt: timestamp,
};

const operationId = '66666666-6666-4666-8666-666666666666';

const reservation = {
  id: promotionId,
  listingPublicId,
  planCode: 'catalog_7d' as const,
  priceUzs: 150_000,
  revision: 0,
  sellerPartnerId: actingPartnerId,
};

const repository = {
  findPromotion: vi.fn<MarketplacePromotionRepository['findPromotion']>(),
  listPromotions: vi.fn<MarketplacePromotionRepository['listPromotions']>(),
  reservePromotion: vi.fn<MarketplacePromotionRepository['reservePromotion']>(),
  settlePromotion: vi.fn<MarketplacePromotionRepository['settlePromotion']>(),
};

const providerOperations = {
  completeProviderOperation: vi.fn<MarketplaceProviderOperationRepository['completeProviderOperation']>(),
  failProviderOperation: vi.fn<MarketplaceProviderOperationRepository['failProviderOperation']>(),
  prepareProviderOperation: vi.fn<MarketplaceProviderOperationRepository['prepareProviderOperation']>(),
};

const billing: { current: MarketplacePromotionBillingProvider } = { current: new MockPromotionBillingProvider() };

const disabledBilling: MarketplacePromotionBillingProvider = {
  billListingPromotion: () => Promise.reject(new Error('Marketplace promotion billing provider is disabled.')),
  mode: 'disabled',
  name: 'disabled',
};

const authenticatedHeaders = {
  'x-test-subject': sellerUserId,
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

describe('marketplace promotion HTTP contract', () => {
  let app: NestFastifyApplication;
  let openApi: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplacePromotionController],
      providers: [
        MarketplacePromotionService,
        { provide: MarketplacePromotionRepositoryInjectToken, useValue: repository },
        { provide: MarketplaceProviderOperationRepositoryInjectToken, useValue: providerOperations },
        {
          provide: MarketplacePromotionBillingProviderInjectToken,
          useFactory: () => ({
            billListingPromotion: (input: Parameters<MarketplacePromotionBillingProvider['billListingPromotion']>[0]) =>
              billing.current.billListingPromotion(input),
            get mode() {
              return billing.current.mode;
            },
            get name() {
              return billing.current.name;
            },
          }),
        },
        {
          provide: MarketplaceProviderConfigInjectToken,
          useValue: resolveMarketplaceProviderConfig({
            MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE: 'mock',
            NODE_ENV: 'test',
          }),
        },
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
      new DocumentBuilder().setTitle('Promotion contract test').setVersion('1').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    billing.current = new MockPromotionBillingProvider();
    repository.reservePromotion.mockResolvedValue({ status: 'ok', value: reservation });
    repository.settlePromotion.mockResolvedValue({ status: 'ok', value: promotion });
    repository.findPromotion.mockResolvedValue(promotion);
    repository.listPromotions.mockResolvedValue([promotion]);
    providerOperations.prepareProviderOperation.mockResolvedValue({
      status: 'ok',
      value: { attempt: 1, execute: true, operationId },
    });
    providerOperations.completeProviderOperation.mockResolvedValue({
      status: 'ok',
      value: {
        attempt: 1,
        operationId,
        providerMode: 'mock',
        providerName: 'mock-promotion-billing',
        providerReference: `mock-promotion-billing:${operationId}`,
        reconciliationRequired: false,
        resultDescriptor: {
          completedAt: timestamp.toISOString(),
          outcome: 'promotion_charged',
          resourceId: promotionId,
          resourceRevision: 0,
          resourceType: 'promotion',
        },
        resultFingerprint: 'a'.repeat(64),
        safeReceipt: { simulated: true },
      },
    });
    providerOperations.failProviderOperation.mockResolvedValue(undefined);
  });

  it('requires a real authenticated session before activation', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { actingPartnerId, listingPublicId, planCode: 'catalog_7d' },
      url: '/marketplace/promotions',
    });

    expectProblem(response, 401);
    expect(repository.reservePromotion).not.toHaveBeenCalled();
  });

  it.each([
    ['missing command key', undefined, { actingPartnerId, listingPublicId, planCode: 'catalog_7d' }],
    ['short command key', 'short', { actingPartnerId, listingPublicId, planCode: 'catalog_7d' }],
    ['caller-defined plan', 'promotion-key-0001', { actingPartnerId, listingPublicId, planCode: 'custom_90d' }],
    [
      'malformed listing',
      'promotion-key-0001',
      { actingPartnerId, listingPublicId: 'private-row-id', planCode: 'catalog_7d' },
    ],
    [
      'malformed acting organization',
      'promotion-key-0001',
      { actingPartnerId: 'private-org-id', listingPublicId, planCode: 'catalog_7d' },
    ],
  ])('rejects %s before reaching persistence', async (_caseName, idempotencyKey, payload) => {
    const response = await app.inject({
      headers: {
        ...authenticatedHeaders,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      method: 'POST',
      payload,
      url: '/marketplace/promotions',
    });

    expectProblem(response, 400);
    expect(repository.reservePromotion).not.toHaveBeenCalled();
  });

  it('activates through the authenticated owner and exposes no payment/provider claim', async () => {
    const response = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'promotion-key-0001' },
      method: 'POST',
      payload: { actingPartnerId, listingPublicId, planCode: 'catalog_7d' },
      url: '/marketplace/promotions',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        activationReference: `promotion:${promotionId}`,
        currency: 'UZS',
        id: promotionId,
        planCode: 'catalog_7d',
        priceUzs: 150_000,
        status: 'active',
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(/provider|receipt|payment|moneyMoved|simulation/u);
    const activationCall = repository.reservePromotion.mock.calls[0];
    expect(activationCall?.[0]).toEqual({ tenantId, userId: sellerUserId });
    expect(activationCall?.[1]).toMatchObject({
      actingPartnerId,
      idempotencyKey: 'promotion-key-0001',
      listingPublicId,
      planCode: 'catalog_7d',
    });
    expect(activationCall?.[1]?.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const charge = providerOperations.prepareProviderOperation.mock.calls[0]?.[1];
    expect(charge).toMatchObject({
      actorType: 'promotion_owner',
      capability: 'promotion_billing',
      providerMode: 'mock',
      providerName: 'mock-promotion-billing',
      resourceId: promotionId,
      resourceType: 'promotion',
    });
    expect(providerOperations.completeProviderOperation.mock.calls[0]?.[3]?.safeReceipt).toMatchObject({
      moneyMoved: false,
      simulated: true,
    });
    expect(repository.settlePromotion).toHaveBeenCalledWith(
      { tenantId, userId: sellerUserId },
      promotionId,
      operationId,
    );
  });

  it('refuses the paid activation with a localized 503 while promotion billing is unavailable', async () => {
    billing.current = disabledBilling;

    const response = await app.inject({
      headers: { ...authenticatedHeaders, 'accept-language': 'ru', 'idempotency-key': 'promotion-key-0009' },
      method: 'POST',
      payload: { actingPartnerId, listingPublicId, planCode: 'catalog_7d' },
      url: '/marketplace/promotions',
    });

    expectProblem(response, 503);
    expect(response.json()).toMatchObject({
      capability: 'promotion_billing',
      code: 'marketplace-provider-unavailable',
      providerMode: 'disabled',
      retryable: false,
    });
    expect(response.headers['content-language']).toBe('ru');
    expect(repository.reservePromotion).not.toHaveBeenCalled();
    expect(providerOperations.prepareProviderOperation).not.toHaveBeenCalled();
    expect(repository.settlePromotion).not.toHaveBeenCalled();
  });

  it('maps changed-command conflicts and tenant-scopes promotion reads', async () => {
    repository.reservePromotion.mockResolvedValue({ status: 'conflict', field: 'idempotencyKey' });
    const conflict = await app.inject({
      headers: { ...authenticatedHeaders, 'idempotency-key': 'promotion-key-0001' },
      method: 'POST',
      payload: { actingPartnerId, listingPublicId, planCode: 'catalog_14d' },
      url: '/marketplace/promotions',
    });
    expectProblem(conflict, 409);

    const [list, detail] = await Promise.all([
      app.inject({ headers: authenticatedHeaders, method: 'GET', url: '/marketplace/promotions' }),
      app.inject({ headers: authenticatedHeaders, method: 'GET', url: `/marketplace/promotions/${promotionId}` }),
    ]);
    expect(list.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(repository.listPromotions).toHaveBeenCalledWith({ tenantId, userId: sellerUserId });
    expect(repository.findPromotion).toHaveBeenCalledWith({ tenantId, userId: sellerUserId }, promotionId);
  });

  it('publishes the authenticated fixed plan catalog so clients do not own price rules', async () => {
    const response = await app.inject({
      headers: authenticatedHeaders,
      method: 'GET',
      url: '/marketplace/promotions/plans',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        items: [
          { code: 'catalog_7d', currency: 'UZS', durationDays: 7, priceUzs: 150_000 },
          { code: 'catalog_14d', currency: 'UZS', durationDays: 14, priceUzs: 270_000 },
          { code: 'catalog_30d', currency: 'UZS', durationDays: 30, priceUzs: 500_000 },
        ],
      },
    });
    const operation = openApi.paths['/marketplace/promotions/plans']?.get;
    expect(operation).toBeDefined();
    expect(operation?.responses['200']).toBeDefined();
    expect(operation?.security).toBeInstanceOf(Array);
  });
});
