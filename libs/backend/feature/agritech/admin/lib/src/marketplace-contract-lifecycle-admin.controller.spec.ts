// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-ROUTING-015
import { describe, expect, it, vi } from 'vitest';
import { AdminAgriTechReadPermission } from '@app/common-authz';
import { RequiredPermissionsMetadataKey, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { MarketplaceContractLifecycleService } from '@app/backend-feature-agritech-main';
import { MarketplaceContractLifecycleAdminController } from './marketplace-contract-lifecycle-admin.controller';

const timestamp = new Date('2030-01-01T00:00:00.000Z');

describe('MarketplaceContractLifecycleAdminController', () => {
  it('derives tenant scope and returns only the allowlisted lifecycle projection', async () => {
    const lifecycle = {
      getLifecycleForAdmin: vi.fn().mockResolvedValue({
        contractId: '10000000-0000-4000-8000-000000000001',
        dispute: {
          createdAt: timestamp,
          openedByParty: 'buyer',
          reason: 'quality_issue',
          status: 'open',
        },
        disputeEvidence: [
          {
            byteSize: 1024,
            checksumSha256: 'a'.repeat(64),
            createdAt: timestamp,
            fileName: 'quality.jpg',
            id: '20000000-0000-4000-8000-000000000002',
            mediaType: 'image/jpeg',
            providerMode: 'mock',
            providerName: 'evidence-mock',
            revision: 1,
            simulation: true,
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
          revision: 1,
          simulation: true,
          status: 'buyer_confirmed',
          updatedAt: timestamp,
        },
        settlementEvents: [],
        signatures: [],
        timeline: [],
      }),
    };
    const controller = new MarketplaceContractLifecycleAdminController(
      lifecycle as unknown as MarketplaceContractLifecycleService,
    );
    const principal = {
      permissions: [AdminAgriTechReadPermission],
      roles: [],
      subject: 'admin-a',
      tenantId: 'tenant-a',
    } satisfies AuthenticatedPrincipal;

    const result = await controller.getContractLifecycle(principal, '10000000-0000-4000-8000-000000000001');

    expect(Reflect.getMetadata(RequiredPermissionsMetadataKey, controller.getContractLifecycle)).toEqual([
      AdminAgriTechReadPermission,
    ]);
    expect(lifecycle.getLifecycleForAdmin).toHaveBeenCalledWith('tenant-a', '10000000-0000-4000-8000-000000000001');
    expect(result.data).toMatchObject({
      dispute: { status: 'open' },
      disputeEvidence: [{ fileName: 'quality.jpg', revision: 1, simulation: true }],
      fulfillment: { status: 'disputed' },
    });
    expect(JSON.stringify(result)).not.toContain('storageReference');
    expect(JSON.stringify(result)).not.toContain('providerReference');
  });
});
