// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-ROUTING-015
import { GUARDS_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AgriTechAdminModule } from '@app/backend-feature-agritech-admin';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';

describe('AgriTech admin product routes', () => {
  it('owns the direct admin prefix and preserves the RBAC guard', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgriTechAdminModule) as Array<{
      name: string;
    }>;
    const controller = controllers.find(({ name }) => name === 'AgriTechAdminController');

    expect(controller).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, controller as Record<string, unknown>)).toBe('admin');
    expect(Reflect.getMetadata(GUARDS_METADATA, controller as Record<string, unknown>)).toContainEqual(
      expect.any(AdminRbacGuard),
    );
    expect(
      controllers.map((candidate) => ({
        name: candidate.name,
        path: Reflect.getMetadata(PATH_METADATA, candidate as Record<string, unknown>),
      })),
    ).toEqual(
      expect.arrayContaining([
        { name: 'MarketplaceContractLifecycleAdminController', path: 'admin/marketplace' },
        { name: 'MarketplaceContractNotificationAdminController', path: 'admin/marketplace/notifications' },
        { name: 'MarketplaceEngagementAdminController', path: 'admin/marketplace/engagement' },
      ]),
    );
    expect(
      controllers.map((candidate) => Reflect.getMetadata(PATH_METADATA, candidate as Record<string, unknown>)),
    ).not.toContain(expect.stringMatching(/^agritech(?:\/|$)/u));
  });
});
