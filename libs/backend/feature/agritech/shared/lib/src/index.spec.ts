// @requirements REQ-AGRITECH-PARTNER-007
import { describe, expect, it } from 'vitest';
import { AgriTechOperationsRepositoryInjectToken, isPartnerApproved } from './index';

describe('AgriTech shared contracts', () => {
  it('exports the repository port and approval policy', () => {
    expect(typeof AgriTechOperationsRepositoryInjectToken).toBe('symbol');
    expect(isPartnerApproved('approved')).toBe(true);
    expect(isPartnerApproved('pending')).toBe(false);
  });
});
