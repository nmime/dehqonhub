// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-ROUTING-015
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import { AdminAgriTechReadPermission } from '@app/common-authz';
import { createAdminAbility, type AdminAuthorizedRequest } from '@app/backend-feature-admin-shared';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { MarketplaceContractLifecycleService } from '@app/backend-feature-agritech-main';
import { MarketplaceContractLifecycleAdminController } from '@app/backend-feature-agritech-admin';

const tenantId = '11111111-1111-4111-8111-111111111111';
const contractId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const timestamp = new Date('2030-01-01T00:00:00.000Z');

const lifecycle = {
  getLifecycleForAdmin: vi.fn(),
};

const adminHeaders = (permissions: readonly string[]) => ({
  'x-test-permissions': permissions.join(','),
  'x-test-subject': 'operator-1',
  'x-test-tenant': tenantId,
});

describe('marketplace contract lifecycle admin HTTP contract', () => {
  let app: NestFastifyApplication;
  let openApi: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceContractLifecycleAdminController],
      providers: [{ provide: MarketplaceContractLifecycleService, useValue: lifecycle }],
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
      new DocumentBuilder().setTitle('Marketplace lifecycle admin test').setVersion('1').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.getLifecycleForAdmin.mockResolvedValue({
      contractId,
      dispute: { createdAt: timestamp, openedByParty: 'buyer', reason: 'quality_issue', status: 'open' },
      disputeEvidence: [
        {
          byteSize: 1024,
          checksumSha256: 'a'.repeat(64),
          createdAt: timestamp,
          fileName: 'quality.jpg',
          id: evidenceId,
          mediaType: 'image/jpeg',
          providerMode: 'mock',
          providerName: 'evidence-mock',
          providerReference: 'private-provider-reference',
          revision: 2,
          simulation: true,
          storageReference: 'private-storage-reference',
          uploadedByParty: 'buyer',
        },
      ],
      fulfillment: { createdAt: timestamp, revision: 2, status: 'disputed', updatedAt: timestamp },
      notificationIntents: [],
      reputationSignals: [],
      reviewEligibilities: [],
      settlement: {
        amountUzs: 1_000_000,
        createdAt: timestamp,
        currency: 'UZS',
        kind: 'direct_payment',
        latestProviderMode: 'mock',
        reconciliationState: 'clear',
        revision: 2,
        simulation: true,
        status: 'buyer_confirmed',
        updatedAt: timestamp,
      },
      settlementEvents: [],
      signatures: [],
      timeline: [],
    });
  });

  it('requires the exact read permission and derives tenant scope', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: `/admin/marketplace/contracts/${contractId}/lifecycle`,
    });
    expect(anonymous.statusCode).toBe(401);

    const denied = await app.inject({
      headers: adminHeaders([]),
      method: 'GET',
      url: `/admin/marketplace/contracts/${contractId}/lifecycle`,
    });
    expect(denied.statusCode).toBe(403);

    const response = await app.inject({
      headers: adminHeaders([AdminAgriTechReadPermission]),
      method: 'GET',
      url: `/admin/marketplace/contracts/${contractId}/lifecycle`,
    });
    expect(response.statusCode).toBe(200);
    expect(lifecycle.getLifecycleForAdmin).toHaveBeenCalledWith(tenantId, contractId);
    expect(response.json()).toMatchObject({
      data: { contractId, dispute: { status: 'open' }, disputeEvidence: [{ id: evidenceId, revision: 2 }] },
    });
    expect(JSON.stringify(response.json())).not.toMatch(/storageReference|providerReference|providerOperation/iu);
  });

  it('publishes only the canonical admin marketplace lifecycle route', async () => {
    expect(openApi.paths[`/admin/marketplace/contracts/{id}/lifecycle`]?.get).toBeDefined();
    expect(Object.keys(openApi.paths)).not.toContain('/agritech/marketplace/contracts/{id}/lifecycle');
    const removed = await app.inject({
      headers: adminHeaders([AdminAgriTechReadPermission]),
      method: 'GET',
      url: `/agritech/marketplace/contracts/${contractId}/lifecycle`,
    });
    expect(removed.statusCode).toBe(404);
  });
});
