// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { MarketplaceContractNotificationController } from './marketplace-contract-notification.controller';
import type { MarketplaceContractNotificationQueryService } from './marketplace-contract-notification.service';

describe('MarketplaceContractNotificationController', () => {
  it('derives recipient and locale from the session and exposes no delivery lease secret', async () => {
    const item = {
      attempts: 1,
      contractId: '22222222-2222-4222-8222-222222222222',
      contractPath: '/marketplace/contracts/22222222-2222-4222-8222-222222222222',
      deliveryChannel: 'telegram' as const,
      event: 'contract.completed',
      id: '11111111-1111-4111-8111-111111111111',
      locale: 'uz-cyrl' as const,
      message: 'Шартнома якунланди',
      occurredAt: new Date('2030-01-01T00:00:00.000Z'),
      recipientParty: 'buyer' as const,
      simulation: true,
      status: 'simulated' as const,
      surface: 'in-app' as const,
    };
    const notifications = { listForRecipient: vi.fn().mockResolvedValue([item]) };
    const controller = new MarketplaceContractNotificationController(
      notifications as unknown as MarketplaceContractNotificationQueryService,
    );
    const principal = {
      locale: 'uz-cyrl',
      permissions: [],
      roles: [],
      subject: 'buyer-a',
      tenantId: 'tenant-a',
    } satisfies AuthenticatedPrincipal;

    const result = await controller.list(principal);

    expect(notifications.listForRecipient).toHaveBeenCalledWith({ tenantId: 'tenant-a', userId: 'buyer-a' }, 'uz-cyrl');
    expect(result.data.items).toEqual([item]);
    expect(JSON.stringify(result)).not.toMatch(
      /claimToken|claimedAt|timelineEventId|templateKey|providerName|lastErrorCode/iu,
    );
  });
});
