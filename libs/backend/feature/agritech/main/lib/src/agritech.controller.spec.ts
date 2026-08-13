// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-FULFILLMENT-010
import { type NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { AgriTechOperationsController } from './agritech.controller';
import { AgriTechOperationsService } from './agritech.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const partnerId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const produceId = '55555555-5555-4555-8555-555555555555';
const deliveryId = '66666666-6666-4666-8666-666666666666';
const maximumIntegerQuantity = 2_147_483_647;
const maximumSupplierPriceUzs = 9_999_999_999_999;

const service = {
  cancelProduceListing: vi.fn(),
  createSupplierProduct: vi.fn(),
  recordFieldVisit: vi.fn(),
  reserveProduce: vi.fn(),
  transitionDelivery: vi.fn(),
  updateSupplierProduct: vi.fn(),
};

const validCreateProduct = {
  category: 'seed',
  description: 'Certified corn seed',
  name: 'Corn seed',
  partnerId,
  priceUzs: 4_000_000,
  region: 'Samarkand',
  stockQuantity: 10,
  unit: 'ton',
};

const validUpdateProduct = {
  priceUzs: 4_000_000,
  status: 'active',
  stockQuantity: 10,
};

interface ProblemBody {
  status?: number;
}

function expectValidationProblem(response: {
  headers: Record<string, unknown>;
  json(): ProblemBody;
  statusCode: number;
}) {
  expect(response.statusCode).toBe(400);
  expect(response.statusCode).not.toBe(500);
  expect(response.headers['content-type']).toEqual(expect.stringContaining('application/problem+json'));
  expect(response.json()).toMatchObject({ status: 400 });
}

describe('AgriTechOperationsController HTTP input contract', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgriTechOperationsController],
      providers: [{ provide: AgriTechOperationsService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ExceptionsFilter());
    app.useGlobalPipes(createValidationPipe());
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, _reply, done) => {
        const principal: AuthenticatedPrincipal = {
          permissions: [],
          roles: [],
          subject: userId,
          tenantId,
        };
        (request as unknown as AuthenticatedRequest).user = principal;
        done();
      });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['non-UUID supplier partner', { ...validCreateProduct, partnerId: 'not-a-uuid' }],
    ['zero supplier price', { ...validCreateProduct, priceUzs: 0 }],
    ['fractional supplier price', { ...validCreateProduct, priceUzs: 4_000_000.25 }],
    ['supplier price beyond numeric(15,2)', { ...validCreateProduct, priceUzs: 10_000_000_000_000 }],
    ['negative supplier stock', { ...validCreateProduct, stockQuantity: -1 }],
    ['fractional supplier stock', { ...validCreateProduct, stockQuantity: 1.5 }],
    ['supplier stock beyond int4', { ...validCreateProduct, stockQuantity: maximumIntegerQuantity + 1 }],
  ])('returns 400 rather than reaching persistence for %s on create', async (_caseName, payload) => {
    const response = await app.inject({ method: 'POST', url: '/supplier/products', payload });

    expectValidationProblem(response);
    expect(service.createSupplierProduct).not.toHaveBeenCalled();
  });

  it.each([
    ['zero supplier price', { ...validUpdateProduct, priceUzs: 0 }],
    ['fractional supplier price', { ...validUpdateProduct, priceUzs: 4_000_000.25 }],
    ['supplier price beyond numeric(15,2)', { ...validUpdateProduct, priceUzs: 10_000_000_000_000 }],
    ['negative supplier stock', { ...validUpdateProduct, stockQuantity: -1 }],
    ['fractional supplier stock', { ...validUpdateProduct, stockQuantity: 1.5 }],
    ['supplier stock beyond int4', { ...validUpdateProduct, stockQuantity: maximumIntegerQuantity + 1 }],
  ])('returns 400 rather than reaching persistence for %s on update', async (_caseName, payload) => {
    const response = await app.inject({ method: 'PATCH', url: `/supplier/products/${productId}`, payload });

    expectValidationProblem(response);
    expect(service.updateSupplierProduct).not.toHaveBeenCalled();
  });

  it.each([
    {
      caseName: 'supplier product path',
      method: 'PATCH' as const,
      payload: validUpdateProduct,
      url: '/supplier/products/not-a-uuid',
    },
    {
      caseName: 'produce reservation path',
      method: 'POST' as const,
      payload: { deliveryAddress: 'Samarkand', partnerId, quantityKg: 1 },
      url: '/produce/not-a-uuid/reservations',
    },
    { caseName: 'produce cancellation path', method: 'PATCH' as const, url: '/produce/not-a-uuid/cancel' },
    {
      caseName: 'delivery path',
      method: 'PATCH' as const,
      payload: { status: 'picked_up' },
      url: '/deliveries/not-a-uuid',
    },
    {
      caseName: 'reservation partner body',
      method: 'POST' as const,
      payload: { deliveryAddress: 'Samarkand', partnerId: 'not-a-uuid', quantityKg: 1 },
      url: `/produce/${produceId}/reservations`,
    },
    {
      caseName: 'field-visit farmer body',
      method: 'POST' as const,
      payload: { farmerId: 'not-a-uuid', notes: 'Visited', observedAt: '2026-08-09T00:00:00.000Z' },
      url: '/field-visits',
    },
  ])('returns a 400 validation problem for an invalid UUID in $caseName', async (testCase) => {
    const response = await app.inject({
      method: testCase.method,
      payload: 'payload' in testCase ? testCase.payload : undefined,
      url: testCase.url,
    });

    expectValidationProblem(response);
    expect(service.cancelProduceListing).not.toHaveBeenCalled();
    expect(service.recordFieldVisit).not.toHaveBeenCalled();
    expect(service.reserveProduce).not.toHaveBeenCalled();
    expect(service.transitionDelivery).not.toHaveBeenCalled();
    expect(service.updateSupplierProduct).not.toHaveBeenCalled();
  });

  it('accepts the storage-compatible upper supplier-product bounds', async () => {
    service.createSupplierProduct.mockResolvedValue({ id: productId });

    const response = await app.inject({
      method: 'POST',
      payload: {
        ...validCreateProduct,
        priceUzs: maximumSupplierPriceUzs,
        stockQuantity: maximumIntegerQuantity,
      },
      url: '/supplier/products',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { id: productId } });
    expect(service.createSupplierProduct).toHaveBeenCalledWith(
      { tenantId, userId },
      {
        ...validCreateProduct,
        priceUzs: maximumSupplierPriceUzs,
        stockQuantity: maximumIntegerQuantity,
      },
    );
  });

  it('accepts valid UUID route parameters before invoking the service', async () => {
    service.transitionDelivery.mockResolvedValue({ id: deliveryId, status: 'picked_up' });

    const response = await app.inject({
      method: 'PATCH',
      payload: { status: 'picked_up' },
      url: `/deliveries/${deliveryId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(service.transitionDelivery).toHaveBeenCalledWith({ tenantId, userId }, deliveryId, { status: 'picked_up' });
  });
});
