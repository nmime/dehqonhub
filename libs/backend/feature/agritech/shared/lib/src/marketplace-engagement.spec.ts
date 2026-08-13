// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { describe, expect, it } from 'vitest';
import {
  isMarketplacePublicAssetReference,
  marketplaceEngagementFingerprint,
  marketplaceSampleTransitionTarget,
  marketplaceUtcMonthKey,
  marketplaceUtcSeasonKey,
  normalizeMarketplaceEngagementText,
} from './marketplace-engagement';

describe('marketplace engagement policy', () => {
  it('derives quota months and calendar seasons from UTC only', () => {
    const boundary = new Date('2027-04-01T00:00:00.000Z');

    expect(marketplaceUtcMonthKey(boundary)).toBe('2027-04');
    expect(marketplaceUtcSeasonKey(boundary)).toBe('2027-Q2');
    expect(marketplaceUtcSeasonKey(new Date('2027-12-31T23:59:59.999Z'))).toBe('2027-Q4');
    expect(() => marketplaceUtcMonthKey(new Date(Number.NaN))).toThrow(TypeError);
  });

  it('permits only the ordered sample transition graph', () => {
    expect(marketplaceSampleTransitionTarget('requested', 'approve')).toBe('approved');
    expect(marketplaceSampleTransitionTarget('requested', 'decline')).toBe('declined');
    expect(marketplaceSampleTransitionTarget('requested', 'cancel')).toBe('cancelled');
    expect(marketplaceSampleTransitionTarget('approved', 'ship')).toBe('shipped');
    expect(marketplaceSampleTransitionTarget('shipped', 'receive')).toBe('received');
    expect(marketplaceSampleTransitionTarget('requested', 'ship')).toBeUndefined();
    expect(marketplaceSampleTransitionTarget('received', 'cancel')).toBeUndefined();
  });

  it('normalizes bounded text and rejects controls, bidi overrides, contacts, and URLs', () => {
    expect(normalizeMarketplaceEngagementText('  Good   quality  ', 100)).toBe('Good quality');
    expect(normalizeMarketplaceEngagementText('call +998 90 123 45 67', 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText('buyer@example.com', 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText('https://private.example/review', 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText('safe\u202Eunsafe', 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText('x'.repeat(101), 100)).toBeUndefined();
  });

  it('treats absent, blank, and non-string comments as no comment at all', () => {
    expect(normalizeMarketplaceEngagementText(undefined, 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText(null, 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText('', 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText(42, 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText({ comment: 'nice' }, 100)).toBeUndefined();
    expect(normalizeMarketplaceEngagementText('   ', 100)).toBeUndefined();
  });

  it('accepts only opaque public asset references and canonicalizes fingerprints', () => {
    expect(isMarketplacePublicAssetReference('public-asset:review_photo_123')).toBe(true);
    expect(isMarketplacePublicAssetReference('https://storage.invalid/private')).toBe(false);
    expect(isMarketplacePublicAssetReference('public-asset:short')).toBe(false);
    expect(marketplaceEngagementFingerprint({ b: 2, a: 1 })).toBe(marketplaceEngagementFingerprint({ a: 1, b: 2 }));
  });

  it('canonicalizes dates and nested arrays before fingerprinting', () => {
    const instant = new Date('2027-04-01T00:00:00.000Z');

    expect(marketplaceEngagementFingerprint(instant)).toBe(marketplaceEngagementFingerprint(instant.toISOString()));
    expect(marketplaceEngagementFingerprint([{ b: 2, a: 1 }])).toBe(marketplaceEngagementFingerprint([{ a: 1, b: 2 }]));
    expect(marketplaceEngagementFingerprint([1, 2])).not.toBe(marketplaceEngagementFingerprint([2, 1]));
  });
});
