// @requirements REQ-AGRITECH-ROUTING-015
import { GUARDS_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AgriTechAdminModule } from '@app/backend-feature-agritech-admin';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';

describe('AgriTech admin product routes', () => {
  it('owns the direct admin prefix and preserves the RBAC guard', () => {
    const controller = (
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgriTechAdminModule) as Array<{ name: string }>
    ).find(({ name }) => name === 'AgriTechAdminController');

    expect(controller).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, controller as Record<string, unknown>)).toBe('admin');
    expect(Reflect.getMetadata(GUARDS_METADATA, controller as Record<string, unknown>)).toContainEqual(
      expect.any(AdminRbacGuard),
    );
  });
});
