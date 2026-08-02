// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-ANALYTICS-011
import { describe, expect, it } from 'vitest';
import {
  AdminAgriTechApprovePermission,
  AdminAgriTechReadPermission,
  AdminAgriTechWritePermission,
} from '@app/common-authz';

describe('AgriTech admin permissions', () => {
  it('keeps read, write, and approval authority separate', () => {
    expect(
      new Set([AdminAgriTechReadPermission, AdminAgriTechWritePermission, AdminAgriTechApprovePermission]).size,
    ).toBe(3);
  });
});
