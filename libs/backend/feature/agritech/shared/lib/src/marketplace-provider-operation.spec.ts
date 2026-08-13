// @requirements REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-INTEGRATION-013
import { describe, expect, it } from 'vitest';
import { marketplaceProviderFingerprint } from './marketplace-provider-operation';

describe('marketplace provider fingerprint', () => {
  it('ignores key order and absent optional fields so a retry matches its first attempt', () => {
    expect(marketplaceProviderFingerprint({ amountUzs: 1_000, reference: 'INV-1' })).toBe(
      marketplaceProviderFingerprint({ reference: 'INV-1', amountUzs: 1_000 }),
    );
    expect(marketplaceProviderFingerprint({ amountUzs: 1_000, note: undefined })).toBe(
      marketplaceProviderFingerprint({ amountUzs: 1_000 }),
    );
  });

  it('canonicalizes dates and preserves array order', () => {
    const instant = new Date('2027-04-01T00:00:00.000Z');

    expect(marketplaceProviderFingerprint({ requestedAt: instant })).toBe(
      marketplaceProviderFingerprint({ requestedAt: instant.toISOString() }),
    );
    expect(marketplaceProviderFingerprint([{ b: 2, a: 1 }])).toBe(marketplaceProviderFingerprint([{ a: 1, b: 2 }]));
    expect(marketplaceProviderFingerprint(['first', 'second'])).not.toBe(
      marketplaceProviderFingerprint(['second', 'first']),
    );
  });

  it('distinguishes primitives and empty payloads', () => {
    expect(marketplaceProviderFingerprint('INV-1')).not.toBe(marketplaceProviderFingerprint('INV-2'));
    expect(marketplaceProviderFingerprint(null)).not.toBe(marketplaceProviderFingerprint({}));
    expect(marketplaceProviderFingerprint(7)).toBe(marketplaceProviderFingerprint(7));
  });
});
