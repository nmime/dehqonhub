// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@app/backend-common-exception';
import type { MarketplaceEngagementRepository } from '@app/backend-feature-agritech-shared';
import { MarketplaceEngagementDomainService } from './marketplace-engagement.domain-service';

const owner = { tenantId: 'buyer-tenant', userId: 'buyer-user' };

describe('MarketplaceEngagementDomainService', () => {
  it('normalizes safe review content and preserves only allowlisted public assets', async () => {
    const repository = fixtureRepository();
    repository.submitReview = vi.fn().mockResolvedValue({ status: 'ok', value: reviewView() });
    const service = new MarketplaceEngagementDomainService(repository);

    await expect(
      service.submitReview(
        owner,
        {
          listingPublicationId: '11111111-1111-4111-8111-111111111111',
          rating: 5,
          comment: '  Fresh   and clean ',
          assetReferences: ['public-asset:photo_review_01'],
        },
        'review:key-01',
      ),
    ).resolves.toEqual(reviewView());
    expect(repository.submitReview).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        comment: 'Fresh and clean',
        assetReferences: ['public-asset:photo_review_01'],
      }),
      'review:key-01',
    );
  });

  it('rejects contact leakage, private asset URLs, and changed command headers before persistence', async () => {
    const repository = fixtureRepository();
    const service = new MarketplaceEngagementDomainService(repository);

    expect(() =>
      service.submitReview(
        owner,
        {
          listingPublicationId: '11111111-1111-4111-8111-111111111111',
          rating: 4,
          comment: 'Contact buyer@example.com',
          assetReferences: [],
        },
        'review:key-02',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.submitReview(
        owner,
        {
          listingPublicationId: '11111111-1111-4111-8111-111111111111',
          rating: 4,
          assetReferences: ['https://private.invalid/object'],
        },
        'review:key-03',
      ),
    ).toThrow(BadRequestException);
    expect(() => service.addFavorite(owner, '11111111-1111-4111-8111-111111111111', 'short')).toThrow(
      BadRequestException,
    );
    expect(repository.submitReview).not.toHaveBeenCalled();
    expect(repository.addFavorite).not.toHaveBeenCalled();
  });

  it('validates delivery quote ownership and maps stale repository state to a safe conflict', async () => {
    const repository = fixtureRepository();
    repository.transitionSample = vi.fn().mockResolvedValue({ status: 'invalid_state', field: 'revision' });
    const service = new MarketplaceEngagementDomainService(repository);

    expect(() =>
      service.transitionSample(
        owner,
        '22222222-2222-4222-8222-222222222222',
        { action: 'ship', expectedRevision: 0, deliveryQuoteUzs: 10 },
        'sample:key-01',
      ),
    ).toThrow(BadRequestException);
    await expect(
      service.transitionSample(
        owner,
        '22222222-2222-4222-8222-222222222222',
        { action: 'ship', expectedRevision: 0 },
        'sample:key-02',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function fixtureRepository(): MarketplaceEngagementRepository {
  return {
    activateSamplePolicy: vi.fn(),
    addFavorite: vi.fn(),
    getSamplePolicy: vi.fn(),
    getSampleUsage: vi.fn(),
    listFavorites: vi.fn(),
    listPublicReviews: vi.fn(),
    listReviewModerationQueue: vi.fn(),
    listSamples: vi.fn(),
    moderateReviewReport: vi.fn(),
    removeFavorite: vi.fn(),
    replyToReview: vi.fn(),
    reportReview: vi.fn(),
    requestSample: vi.fn(),
    submitReview: vi.fn(),
    submitSampleFeedback: vi.fn(),
    transitionSample: vi.fn(),
  };
}

function reviewView() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    listingPublicationId: '11111111-1111-4111-8111-111111111111',
    rating: 5,
    comment: 'Fresh and clean',
    assetReferences: ['public-asset:photo_review_01'],
    verifiedDeal: true as const,
    revision: 0,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
  };
}
