// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it, vi } from 'vitest';
import { AdminAgriTechReadPermission } from '@app/common-authz';
import { RequiredPermissionsMetadataKey, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { MarketplaceContractNotificationQueryService } from '@app/backend-feature-agritech-main';
import { MarketplaceContractNotificationAdminController } from './marketplace-contract-notification-admin.controller';

describe('MarketplaceContractNotificationAdminController', () => {
  it('requires the AgriTech read permission and derives tenant scope from the principal', async () => {
    const notifications = { listForAdmin: vi.fn().mockResolvedValue([]) };
    const controller = new MarketplaceContractNotificationAdminController(
      notifications as unknown as MarketplaceContractNotificationQueryService,
    );
    const principal = {
      locale: 'ru',
      permissions: [AdminAgriTechReadPermission],
      roles: [],
      subject: 'admin-a',
      tenantId: 'tenant-a',
    } satisfies AuthenticatedPrincipal;

    const result = await controller.list(principal);

    expect(Reflect.getMetadata(RequiredPermissionsMetadataKey, controller.list)).toEqual([AdminAgriTechReadPermission]);
    expect(notifications.listForAdmin).toHaveBeenCalledWith('tenant-a', 'ru');
    expect(result.data.items).toEqual([]);
  });
});
