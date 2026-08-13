// @requirements REQ-AGRITECH-STAGE2-017
import { describe, expect, it } from 'vitest';
import { marketplacePromotionActivationFingerprint, marketplacePromotionPlanCatalog } from './marketplace-promotion';

const activation = {
  actingPartnerId: 'partner-seller',
  listingPublicId: 'listing-1',
  planCode: 'catalog_7d',
} as const;

describe('marketplace promotion plans', () => {
  it('prices every plan in UZS with its own duration', () => {
    expect(marketplacePromotionPlanCatalog).toEqual([
      { code: 'catalog_7d', currency: 'UZS', durationDays: 7, priceUzs: 150_000 },
      { code: 'catalog_14d', currency: 'UZS', durationDays: 14, priceUzs: 270_000 },
      { code: 'catalog_30d', currency: 'UZS', durationDays: 30, priceUzs: 500_000 },
    ]);
  });

  it('fingerprints an activation by its terms so a replay is recognized', () => {
    expect(marketplacePromotionActivationFingerprint(activation)).toBe(
      marketplacePromotionActivationFingerprint({ ...activation }),
    );
    expect(marketplacePromotionActivationFingerprint({ ...activation, planCode: 'catalog_30d' })).not.toBe(
      marketplacePromotionActivationFingerprint(activation),
    );
    expect(marketplacePromotionActivationFingerprint({ ...activation, listingPublicId: 'listing-2' })).not.toBe(
      marketplacePromotionActivationFingerprint(activation),
    );
  });

  it('treats an immediate start as distinct from a scheduled one', () => {
    const startsAt = new Date('2027-04-01T00:00:00.000Z');

    expect(marketplacePromotionActivationFingerprint({ ...activation, startsAt })).not.toBe(
      marketplacePromotionActivationFingerprint(activation),
    );
    expect(marketplacePromotionActivationFingerprint({ ...activation, startsAt })).toBe(
      marketplacePromotionActivationFingerprint({ ...activation, startsAt: new Date(startsAt) }),
    );
  });
});
