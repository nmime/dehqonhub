// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it } from 'vitest';
import { isMarketplaceContractCriticalNotificationTemplate } from './marketplace-contract-notification';
import { marketplacePromotionActivationFingerprint } from './marketplace-promotion';
import { marketplaceProviderFingerprint } from './marketplace-provider-operation';

describe('marketplace stage two deterministic policies', () => {
  it('classifies only the bounded critical notification templates', () => {
    expect(isMarketplaceContractCriticalNotificationTemplate('marketplace.contract.artifact.stored')).toBe(true);
    expect(isMarketplaceContractCriticalNotificationTemplate('marketplace.contract.completed')).toBe(false);
  });

  it('binds promotion fingerprints to optional scheduling input', () => {
    const base = {
      actingPartnerId: '11111111-1111-4111-8111-111111111111',
      listingPublicId: 'listing-public-id',
      planCode: 'catalog_7d' as const,
    };

    expect(marketplacePromotionActivationFingerprint(base)).not.toBe(
      marketplacePromotionActivationFingerprint({
        ...base,
        startsAt: new Date('2027-01-01T00:00:00.000Z'),
      }),
    );
  });

  it('canonicalizes provider fingerprints recursively and omits undefined object members', () => {
    const timestamp = new Date('2027-01-01T00:00:00.000Z');

    expect(
      marketplaceProviderFingerprint({
        z: undefined,
        nested: [{ b: 2, a: 1 }, timestamp],
      }),
    ).toBe(
      marketplaceProviderFingerprint({
        nested: [{ a: 1, b: 2 }, timestamp.toISOString()],
      }),
    );
  });
});
