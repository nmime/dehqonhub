// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  MarketplaceEngagementController,
  MarketplaceEngagementService,
  MarketplacePublicEngagementController,
} from '@app/backend-feature-agritech-main';
import {
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = 'buyer-engagement-user';
const listingPublicationId = '22222222-2222-4222-8222-222222222222';
const reviewId = '33333333-3333-4333-8333-333333333333';
const timestamp = new Date('2030-01-01T00:00:00.000Z');

const engagement = {
  addFavorite: vi.fn(),
  getSampleUsage: vi.fn(),
  listFavorites: vi.fn(),
  listPublicReviews: vi.fn(),
  listSamples: vi.fn(),
  removeFavorite: vi.fn(),
  replyToReview: vi.fn(),
  reportReview: vi.fn(),
  requestSample: vi.fn(),
  submitReview: vi.fn(),
  submitSampleFeedback: vi.fn(),
  transitionSample: vi.fn(),
};

const authenticatedHeaders = {
  'idempotency-key': 'engagement-key-0001',
  'x-test-subject': userId,
  'x-test-tenant': tenantId,
};

describe('marketplace engagement user and public HTTP contract', () => {
  let app: NestFastifyApplication;
  let openApi: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceEngagementController, MarketplacePublicEngagementController],
      providers: [
        { provide: MarketplaceEngagementService, useValue: engagement },
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
        const scopedTenantId = request.headers['x-test-tenant'];
        if (typeof subject === 'string' && typeof scopedTenantId === 'string') {
          const principal: AuthenticatedPrincipal = {
            permissions: [],
            roles: [],
            subject,
            tenantId: scopedTenantId,
          };
          (request as unknown as AuthenticatedRequest).session = { user: principal };
        }
        done();
      });
    await app.init();
    openApi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Marketplace engagement test').setVersion('1').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    engagement.addFavorite.mockResolvedValue({
      favorited: true,
      listingPublicationId,
      productId: 'private-source-id',
      tenantId: 'private-tenant-id',
    });
    engagement.listPublicReviews.mockResolvedValue({
      aggregate: { averageRating: 5, listingPublicationId, reviewCount: 1, revision: 1 },
      items: [
        {
          assetReferences: ['public-asset:review_asset_0001'],
          buyerTenantId: 'private-buyer-tenant',
          contractId: 'private-contract-id',
          createdAt: timestamp,
          id: reviewId,
          listingPublicationId,
          rating: 5,
          revision: 0,
          updatedAt: timestamp,
          verifiedDeal: true,
        },
      ],
    });
  });

  it('requires a session, derives the actor, and returns only the opaque favorite projection', async () => {
    const anonymous = await app.inject({
      headers: { 'idempotency-key': 'engagement-key-0001' },
      method: 'POST',
      url: `/marketplace/favorites/${listingPublicationId}`,
    });
    expect(anonymous.statusCode).toBe(401);

    const response = await app.inject({
      headers: authenticatedHeaders,
      method: 'POST',
      url: `/marketplace/favorites/${listingPublicationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(engagement.addFavorite).toHaveBeenCalledWith(
      { tenantId, userId },
      listingPublicationId,
      'engagement-key-0001',
    );
    expect(response.json()).toEqual({ data: { favorited: true, listingPublicationId } });
    expect(JSON.stringify(response.json())).not.toMatch(/productId|sourceId|tenantId|partnerId|provider|idempotency/iu);
  });

  it('rejects private caller identity fields before the sample service boundary', async () => {
    const response = await app.inject({
      headers: authenticatedHeaders,
      method: 'POST',
      payload: {
        deliveryMethod: 'pickup',
        listingPublicationId,
        requesterTenantId: 'caller-controlled-tenant',
      },
      url: '/marketplace/samples',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(engagement.requestSample).not.toHaveBeenCalled();
  });

  it('serves deal-verified reviews anonymously through an explicit safe projection', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/marketplace/public/catalog/${listingPublicationId}/reviews`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        aggregate: { averageRating: 5, listingPublicationId, reviewCount: 1 },
        items: [{ id: reviewId, listingPublicationId, rating: 5, verifiedDeal: true }],
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(/buyerTenantId|contractId|eligibility|sourceId|provider/iu);
  });

  it('publishes only opaque engagement paths and denylisted command schemas', () => {
    const paths = Object.fromEntries(
      Object.entries(openApi.paths).filter(
        ([path]) =>
          path.startsWith('/marketplace/favorites') ||
          path.startsWith('/marketplace/samples') ||
          path.startsWith('/marketplace/reviews') ||
          path.endsWith('/reviews'),
      ),
    );
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/marketplace/favorites',
        '/marketplace/favorites/{listingPublicationId}',
        '/marketplace/public/catalog/{listingPublicationId}/reviews',
        '/marketplace/reviews',
        '/marketplace/reviews/{reviewId}/reply',
        '/marketplace/reviews/{reviewId}/reports',
        '/marketplace/samples',
        '/marketplace/samples/{sampleId}',
        '/marketplace/samples/{sampleId}/feedback',
        '/marketplace/samples/usage',
      ]),
    );
    expect(JSON.stringify(paths)).not.toMatch(
      /productId|produceId|sourceId|tenantId|userId|partnerId|contractId|eligibilityId|provider/iu,
    );
  });
});
