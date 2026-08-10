// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018
import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import { AdminAgriTechApprovePermission, AdminAgriTechReadPermission } from '@app/common-authz';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { createAdminAbility, type AdminAuthorizedRequest } from '@app/backend-feature-admin-shared';
import {
  AgriTechOperationsService,
  MarketplacePublicRepositoryInjectToken,
  MarketplacePublicService,
  MarketplaceService,
} from '@app/backend-feature-agritech-main';
import { AgriTechAdminController, ReviewVerificationDto } from '@app/backend-feature-agritech-admin';

const verificationId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const operatorId = '33333333-3333-4333-8333-333333333333';
const listingPublicationId = '44444444-4444-4444-8444-444444444444';
const requestPublicationId = '55555555-5555-4555-8555-555555555555';
const sellerPublicId = '66666666-6666-4666-8666-666666666666';
const sourceId = '77777777-7777-4777-8777-777777777777';
const requestId = '88888888-8888-4888-8888-888888888888';
const requestHeaderId = '99999999-9999-4999-8999-999999999999';
const sellerContentFingerprint = 'a'.repeat(64);
const now = new Date('2026-08-10T00:00:00.000Z');
const shadowReviewService = { review: vi.fn() };

@Controller('admin/verifications')
class VerificationReviewValidationController {
  @Patch(':id')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() input: ReviewVerificationDto) {
    shadowReviewService.review(id, input);
    return { data: input };
  }
}

describe('admin verification review HTTP validation', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VerificationReviewValidationController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ExceptionsFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [{ decision: 'rejected' }, 400],
    [{ decision: 'verified', reason: 'criteria_not_met' }, 400],
    [{ decision: 'rejected', reason: 'documents_unreadable' }, 200],
    [{ decision: 'verified' }, 200],
  ] as const)('validates %j with HTTP %s', async (payload, expectedStatus) => {
    const revisionPayload = { ...payload, expectedRevision: 0 };
    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/verifications/${verificationId}`,
      headers: { 'x-request-id': '33333333-3333-4333-8333-333333333333' },
      payload: revisionPayload,
    });

    expect(response.statusCode).toBe(expectedStatus);
    if (expectedStatus === 400) {
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({
        errors: [expect.objectContaining({ pointer: '#/reason' })],
        status: 400,
      });
    } else {
      expect(response.json()).toEqual({ data: revisionPayload });
    }
  });

  it('rejects a malformed verification id before invoking the shadow service', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/verifications/not-a-uuid',
      headers: { 'x-request-id': '33333333-3333-4333-8333-333333333333' },
      payload: { decision: 'verified', expectedRevision: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 400 });
    expect(shadowReviewService.review).not.toHaveBeenCalled();
  });
});

const listingPublication = {
  id: listingPublicationId,
  moderationStatus: 'pending' as const,
  revision: 2,
  section: 'seeds' as const,
  sellerPublicId,
  sourceId,
  sourceKind: 'product' as const,
  status: 'paused' as const,
  updatedAt: now,
};

const requestPublication = {
  id: requestPublicationId,
  moderationStatus: 'pending' as const,
  requestId,
  revision: 3,
  status: 'paused' as const,
  updatedAt: now,
};

const publicRepository = {
  findPublishedListing: vi.fn(),
  findPublishedSeller: vi.fn(),
  listPendingModeration: vi.fn(),
  listOwnedPublications: vi.fn(),
  listPublishedListings: vi.fn(),
  listPublishedRequests: vi.fn(),
  listPublishedSellerListings: vi.fn(),
  listPublishedSuggestions: vi.fn(),
  publishListing: vi.fn(),
  publishRequest: vi.fn(),
  reviewListingPublication: vi.fn(),
  reviewRequestPublication: vi.fn(),
  reviewSellerProfile: vi.fn(),
};

const operationService = {};
const marketplaceService = {
  listVerifications: vi.fn(),
  reviewVerification: vi.fn(),
};
const ok = <T>(value: T) => ({ status: 'ok' as const, value });

const adminHeaders = (permissions: readonly string[], subject = operatorId) => ({
  'x-request-id': requestHeaderId,
  'x-test-permissions': permissions.join(','),
  'x-test-subject': subject,
  'x-test-tenant': tenantId,
});

describe('admin marketplace publication moderation HTTP contract', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgriTechAdminController],
      providers: [
        { provide: AgriTechOperationsService, useValue: operationService },
        { provide: MarketplaceService, useValue: marketplaceService },
        MarketplacePublicService,
        { provide: MarketplacePublicRepositoryInjectToken, useValue: publicRepository },
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    publicRepository.listPendingModeration.mockResolvedValue({ listings: [], requests: [], sellerProfiles: [] });
    marketplaceService.listVerifications.mockResolvedValue([]);
  });

  it('requires replay and revision metadata for an admin verification decision', async () => {
    const reviewed = {
      caseRevision: 0,
      createdAt: now,
      documents: [],
      id: verificationId,
      identityAssurance: 'mock',
      level: 'verified',
      oneIdLinked: true,
      providerMode: 'mock',
      reviewedAt: now,
      reviewedBy: operatorId,
      role: 'buyer',
      status: 'verified',
      tenantId,
      updatedAt: now,
      userId: 'verification-subject',
      version: 1,
    };
    marketplaceService.reviewVerification.mockResolvedValue(reviewed);
    const request = {
      headers: {
        ...adminHeaders([AdminAgriTechApprovePermission]),
        'idempotency-key': 'verification-review-http',
      },
      method: 'PATCH' as const,
      payload: { decision: 'verified', expectedRevision: 0 },
      url: `/admin/verifications/${verificationId}`,
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({ data: { id: verificationId, revision: 1, status: 'verified' } });
    expect(marketplaceService.reviewVerification).toHaveBeenNthCalledWith(
      1,
      tenantId,
      verificationId,
      'verified',
      operatorId,
      0,
      'verification-review-http',
      undefined,
    );

    marketplaceService.reviewVerification.mockClear();
    const missingKey = await app.inject({ ...request, headers: adminHeaders([AdminAgriTechApprovePermission]) });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json()).toMatchObject({ status: 400 });
    expect(marketplaceService.reviewVerification).not.toHaveBeenCalled();

    const malformedKey = await app.inject({
      ...request,
      headers: { ...adminHeaders([AdminAgriTechApprovePermission]), 'idempotency-key': 'invalid key' },
    });
    expect(malformedKey.statusCode).toBe(400);
    expect(malformedKey.json()).toMatchObject({ status: 400 });
    expect(marketplaceService.reviewVerification).not.toHaveBeenCalled();
  });

  it('publishes the admin verification CAS and replay contract in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Admin marketplace contract test').setVersion('1').build(),
    );
    const reviewSchema = document.components?.schemas?.['ReviewVerificationDto'] as {
      properties?: unknown;
      required?: string[];
    };
    expect(reviewSchema.properties).toMatchObject({
      expectedRevision: { minimum: 0, type: 'integer' },
    });
    expect(reviewSchema.required).toEqual(expect.arrayContaining(['decision', 'expectedRevision']));
    const idempotencyParameter = document.paths['/admin/verifications/{id}']?.patch?.parameters?.find(
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
  });

  it('requires an authenticated admin principal before reading the moderation queue', async () => {
    const response = await app.inject({
      headers: { 'x-request-id': requestHeaderId },
      method: 'GET',
      url: '/admin/marketplace/publications/pending',
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 401 });
    expect(publicRepository.listPendingModeration).not.toHaveBeenCalled();
  });

  it('requires the explicit read permission and scopes the moderation queue to the principal tenant', async () => {
    const response = await app.inject({
      headers: adminHeaders([AdminAgriTechReadPermission]),
      method: 'GET',
      url: '/admin/marketplace/publications/pending',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { listings: [], requests: [], sellerProfiles: [] } });
    expect(publicRepository.listPendingModeration).toHaveBeenCalledWith(tenantId);

    publicRepository.listPendingModeration.mockClear();
    const forbidden = await app.inject({
      headers: adminHeaders([]),
      method: 'GET',
      url: '/admin/marketplace/publications/pending',
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ status: 403 });
    expect(publicRepository.listPendingModeration).not.toHaveBeenCalled();
  });

  it('returns the reviewed listing and request snapshots with both CAS revisions and no legal/provider metadata', async () => {
    publicRepository.listPendingModeration.mockResolvedValue({
      sellerProfiles: [
        {
          contentFingerprint: sellerContentFingerprint,
          contentRevision: 4,
          description: 'Verified cooperative',
          displayName: 'Zarafshon Agro',
          moderationStatus: 'pending',
          region: 'Samarkand',
          sellerPublicId,
          submittedAt: now,
        },
      ],
      listings: [
        {
          content: {
            category: 'seed',
            description: 'Certified drought-resistant seed',
            images: ['https://cdn.example.test/corn.webp'],
            region: 'Samarkand',
            title: 'Corn F1',
            unit: 't',
          },
          publication: listingPublication,
          seller: {
            contentFingerprint: sellerContentFingerprint,
            contentRevision: 4,
            description: 'Verified cooperative',
            displayName: 'Zarafshon Agro',
            id: sellerPublicId,
            moderationStatus: 'pending',
            region: 'Samarkand',
          },
        },
      ],
      requests: [
        {
          content: {
            budgetUzs: 45_000_000,
            buyerDisplayName: 'Bahor Farm',
            product: 'Corn seed',
            region: 'Samarkand',
            requirements: 'Certified',
            title: 'Corn seed, 10 tons',
            volume: '10 tons',
          },
          publication: requestPublication,
        },
      ],
    });

    const response = await app.inject({
      headers: adminHeaders([AdminAgriTechReadPermission]),
      method: 'GET',
      url: '/admin/marketplace/publications/pending',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        listings: [
          {
            content: { category: 'seed', title: 'Corn F1' },
            publication: { id: listingPublicationId, revision: 2 },
            seller: {
              contentFingerprint: sellerContentFingerprint,
              contentRevision: 4,
              id: sellerPublicId,
            },
          },
        ],
        requests: [
          {
            content: { buyerDisplayName: 'Bahor Farm', title: 'Corn seed, 10 tons' },
            publication: { id: requestPublicationId, revision: 3 },
          },
        ],
      },
    });
    expect(response.json()).toMatchObject({
      data: {
        sellerProfiles: [
          {
            contentFingerprint: sellerContentFingerprint,
            contentRevision: 4,
            sellerPublicId,
          },
        ],
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(
      /tenantId|ownerUserId|reviewerUserId|provider|taxId|legalName|idempotencyKey/u,
    );
    expect(publicRepository.listPendingModeration).toHaveBeenCalledWith(tenantId);
  });

  it('requires approve permission and never delegates a forbidden moderation command', async () => {
    const response = await app.inject({
      headers: {
        ...adminHeaders([AdminAgriTechReadPermission]),
        'idempotency-key': 'moderate-listing-0001',
      },
      method: 'PATCH',
      payload: {
        decision: 'approved',
        expectedRevision: 2,
        expectedSellerContentFingerprint: sellerContentFingerprint,
        expectedSellerContentRevision: 4,
      },
      url: `/admin/marketplace/publications/listings/${listingPublicationId}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ status: 403 });
    expect(publicRepository.reviewListingPublication).not.toHaveBeenCalled();
  });

  it('derives tenant and reviewer identities, enforces both revisions, and replays the same moderation command', async () => {
    const approved = {
      ...listingPublication,
      moderationStatus: 'approved' as const,
      publishedAt: now,
      revision: 3,
      status: 'published' as const,
    };
    publicRepository.reviewListingPublication.mockResolvedValue(ok(approved));
    const request = {
      headers: {
        ...adminHeaders([AdminAgriTechApprovePermission]),
        'idempotency-key': 'moderate-listing-0001',
      },
      method: 'PATCH' as const,
      payload: {
        decision: 'approved',
        expectedRevision: 2,
        expectedSellerContentFingerprint: sellerContentFingerprint,
        expectedSellerContentRevision: 4,
      },
      url: `/admin/marketplace/publications/listings/${listingPublicationId}`,
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({
      data: { id: listingPublicationId, moderationStatus: 'approved', revision: 3, status: 'published' },
    });
    expect(publicRepository.reviewListingPublication).toHaveBeenNthCalledWith(
      1,
      tenantId,
      listingPublicationId,
      operatorId,
      {
        decision: 'approved',
        expectedRevision: 2,
        expectedSellerContentFingerprint: sellerContentFingerprint,
        expectedSellerContentRevision: 4,
        idempotencyKey: 'moderate-listing-0001',
      },
    );
    expect(publicRepository.reviewListingPublication).toHaveBeenNthCalledWith(
      2,
      tenantId,
      listingPublicationId,
      operatorId,
      expect.objectContaining({ idempotencyKey: 'moderate-listing-0001' }),
    );
  });

  it('moderates the exact immutable seller-profile revision and replays the completed decision', async () => {
    const approvedProfile = {
      contentFingerprint: sellerContentFingerprint,
      contentRevision: 4,
      description: 'Verified cooperative',
      displayName: 'Zarafshon Agro',
      moderationStatus: 'approved' as const,
      region: 'Samarkand',
      sellerPublicId,
      submittedAt: now,
    };
    publicRepository.reviewSellerProfile.mockResolvedValue(ok(approvedProfile));
    const request = {
      headers: {
        ...adminHeaders([AdminAgriTechApprovePermission]),
        'idempotency-key': 'moderate-profile-0001',
      },
      method: 'PATCH' as const,
      payload: {
        decision: 'approved',
        expectedContentFingerprint: sellerContentFingerprint,
        expectedContentRevision: 4,
      },
      url: `/admin/marketplace/publications/sellers/${sellerPublicId}`,
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({
      data: {
        contentFingerprint: sellerContentFingerprint,
        contentRevision: 4,
        moderationStatus: 'approved',
        sellerPublicId,
      },
    });
    expect(publicRepository.reviewSellerProfile).toHaveBeenNthCalledWith(1, tenantId, sellerPublicId, operatorId, {
      decision: 'approved',
      expectedContentFingerprint: sellerContentFingerprint,
      expectedContentRevision: 4,
      idempotencyKey: 'moderate-profile-0001',
    });
  });

  it.each([
    [
      'missing idempotency key',
      undefined,
      {
        decision: 'approved',
        expectedRevision: 2,
        expectedSellerContentFingerprint: sellerContentFingerprint,
        expectedSellerContentRevision: 4,
      },
    ],
    [
      'negative publication revision',
      'moderate-listing-0002',
      {
        decision: 'approved',
        expectedRevision: -1,
        expectedSellerContentFingerprint: sellerContentFingerprint,
        expectedSellerContentRevision: 4,
      },
    ],
    [
      'fractional seller content revision',
      'moderate-listing-0003',
      {
        decision: 'approved',
        expectedRevision: 2,
        expectedSellerContentFingerprint: sellerContentFingerprint,
        expectedSellerContentRevision: 1.5,
      },
    ],
    [
      'malformed seller content fingerprint',
      'moderate-listing-0005',
      {
        decision: 'approved',
        expectedRevision: 2,
        expectedSellerContentFingerprint: 'not-a-fingerprint',
        expectedSellerContentRevision: 4,
      },
    ],
  ] as const)('rejects %s before invoking persistence', async (_caseName, idempotencyKey, payload) => {
    const response = await app.inject({
      headers: {
        ...adminHeaders([AdminAgriTechApprovePermission]),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      method: 'PATCH',
      payload,
      url: `/admin/marketplace/publications/listings/${listingPublicationId}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ status: 400 });
    expect(publicRepository.reviewListingPublication).not.toHaveBeenCalled();
  });

  it.each([
    ['stale revision or changed-input replay', 'conflict', 409],
    ['foreign or missing publication', 'not_found', 404],
  ] as const)('maps %s to HTTP %i without disclosing another tenant publication', async (_caseName, status, code) => {
    publicRepository.reviewListingPublication.mockResolvedValue({ status });
    const response = await app.inject({
      headers: {
        ...adminHeaders([AdminAgriTechApprovePermission]),
        'idempotency-key': 'moderate-listing-0004',
      },
      method: 'PATCH',
      payload: {
        decision: 'rejected',
        expectedRevision: 2,
        expectedSellerContentFingerprint: sellerContentFingerprint,
        expectedSellerContentRevision: 4,
      },
      url: `/admin/marketplace/publications/listings/${listingPublicationId}`,
    });

    expect(response.statusCode).toBe(code);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: code });
  });

  it('moderates a request publication with a tenant-scoped revision and idempotency command', async () => {
    const approved = {
      ...requestPublication,
      moderationStatus: 'approved' as const,
      publishedAt: now,
      revision: 4,
      status: 'published' as const,
    };
    publicRepository.reviewRequestPublication.mockResolvedValue(ok(approved));
    const response = await app.inject({
      headers: {
        ...adminHeaders([AdminAgriTechApprovePermission]),
        'idempotency-key': 'moderate-request-0001',
      },
      method: 'PATCH',
      payload: { decision: 'approved', expectedRevision: 3 },
      url: `/admin/marketplace/publications/requests/${requestPublicationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { id: requestPublicationId, moderationStatus: 'approved', revision: 4, status: 'published' },
    });
    expect(publicRepository.reviewRequestPublication).toHaveBeenCalledWith(tenantId, requestPublicationId, operatorId, {
      decision: 'approved',
      expectedRevision: 3,
      idempotencyKey: 'moderate-request-0001',
    });
  });
});
