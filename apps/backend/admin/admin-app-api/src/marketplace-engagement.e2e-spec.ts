// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-ROUTING-015
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  AdminAgriTechApprovePermission,
  AdminAgriTechReadPermission,
  AdminAgriTechWritePermission,
} from '@app/common-authz';
import { createAdminAbility, type AdminAuthorizedRequest } from '@app/backend-feature-admin-shared';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { MarketplaceEngagementService } from '@app/backend-feature-agritech-main';
import { MarketplaceEngagementAdminController } from '@app/backend-feature-agritech-admin';

const tenantId = '11111111-1111-4111-8111-111111111111';
const operatorId = 'admin-engagement-user';
const listingPublicationId = '22222222-2222-4222-8222-222222222222';
const reviewId = '33333333-3333-4333-8333-333333333333';
const reportId = '44444444-4444-4444-8444-444444444444';
const timestamp = new Date('2030-01-01T00:00:00.000Z');

const engagement = {
  activateSamplePolicy: vi.fn(),
  getSamplePolicy: vi.fn(),
  listReviewModerationQueue: vi.fn(),
  moderateReviewReport: vi.fn(),
};

const adminHeaders = (permissions: readonly string[]) => ({
  'idempotency-key': 'admin-engagement-key-0001',
  'x-test-permissions': permissions.join(','),
  'x-test-subject': operatorId,
  'x-test-tenant': tenantId,
});

describe('marketplace engagement admin HTTP contract', () => {
  let app: NestFastifyApplication;
  let openApi: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceEngagementAdminController],
      providers: [{ provide: MarketplaceEngagementService, useValue: engagement }],
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
          const permissionHeader = request.headers['x-test-permissions'];
          const principal: AuthenticatedPrincipal = {
            permissions: typeof permissionHeader === 'string' ? permissionHeader.split(',').filter(Boolean) : [],
            roles: [],
            subject,
            tenantId: scopedTenantId,
          };
          const authorizedRequest = request as unknown as AdminAuthorizedRequest & AuthenticatedRequest;
          authorizedRequest.user = principal;
          authorizedRequest.adminAbility = createAdminAbility(principal);
        }
        done();
      });
    await app.init();
    openApi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Marketplace engagement admin test').setVersion('1').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    engagement.getSamplePolicy.mockResolvedValue({
      activeFrom: timestamp,
      monthlyLimit: 5,
      tenantId: 'private-policy-tenant',
      version: 1,
    });
    engagement.activateSamplePolicy.mockResolvedValue({
      activeFrom: timestamp,
      createdBy: 'private-operator-id',
      monthlyLimit: 7,
      tenantId: 'private-policy-tenant',
      version: 2,
    });
    engagement.listReviewModerationQueue.mockResolvedValue([
      {
        expectedRevision: 0,
        reason: 'spam',
        reportId,
        reporterTenantId: 'private-reporter-tenant',
        review: {
          assetReferences: [],
          buyerUserId: 'private-buyer',
          createdAt: timestamp,
          id: reviewId,
          listingPublicationId,
          rating: 4,
          revision: 0,
          updatedAt: timestamp,
          verifiedDeal: true,
        },
        submittedAt: timestamp,
      },
    ]);
  });

  it('requires an authenticated, permissioned tenant principal for policy reads', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: '/admin/marketplace/engagement/sample-policy',
    });
    expect(anonymous.statusCode).toBe(401);

    const denied = await app.inject({
      headers: adminHeaders([]),
      method: 'GET',
      url: '/admin/marketplace/engagement/sample-policy',
    });
    expect(denied.statusCode).toBe(403);

    const response = await app.inject({
      headers: adminHeaders([AdminAgriTechReadPermission]),
      method: 'GET',
      url: '/admin/marketplace/engagement/sample-policy',
    });
    expect(response.statusCode).toBe(200);
    expect(engagement.getSamplePolicy).toHaveBeenCalledWith(tenantId);
    expect(response.json()).toEqual({
      data: { activeFrom: timestamp.toISOString(), monthlyLimit: 5, version: 1 },
    });
  });

  it('derives the admin actor and strips policy persistence identities', async () => {
    const response = await app.inject({
      headers: adminHeaders([AdminAgriTechWritePermission]),
      method: 'POST',
      payload: { expectedVersion: 1, monthlyLimit: 7 },
      url: '/admin/marketplace/engagement/sample-policy',
    });

    expect(response.statusCode).toBe(200);
    expect(engagement.activateSamplePolicy).toHaveBeenCalledWith(
      { tenantId, userId: operatorId },
      { expectedVersion: 1, monthlyLimit: 7 },
      'admin-engagement-key-0001',
    );
    expect(JSON.stringify(response.json())).not.toMatch(/tenantId|createdBy|provider|idempotency/iu);
  });

  it('returns a tenant-scoped moderation queue through the admin DTO denylist', async () => {
    const response = await app.inject({
      headers: adminHeaders([AdminAgriTechReadPermission, AdminAgriTechApprovePermission]),
      method: 'GET',
      url: '/admin/marketplace/engagement/review-reports',
    });

    expect(response.statusCode).toBe(200);
    expect(engagement.listReviewModerationQueue).toHaveBeenCalledWith(tenantId);
    expect(response.json()).toMatchObject({
      data: { items: [{ reportId, review: { id: reviewId, verifiedDeal: true } }] },
    });
    expect(JSON.stringify(response.json())).not.toMatch(/reporterTenantId|buyerUserId|sourceId|contractId|provider/iu);
  });

  it('publishes the bounded admin policy and moderation contract without tenant selectors', () => {
    const paths = Object.fromEntries(
      Object.entries(openApi.paths).filter(([path]) => path.startsWith('/admin/marketplace/engagement')),
    );
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/admin/marketplace/engagement/review-reports',
        '/admin/marketplace/engagement/review-reports/{reportId}',
        '/admin/marketplace/engagement/sample-policy',
      ]),
    );
    expect(JSON.stringify(paths)).not.toMatch(
      /buyerTenantId|sellerTenantId|userId|partnerId|sourceId|contractId|eligibilityId|providerName/iu,
    );
  });
});
