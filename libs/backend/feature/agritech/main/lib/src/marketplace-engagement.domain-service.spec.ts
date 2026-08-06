// @requirements REQ-AGRITECH-ENGAGEMENT-019
/* eslint-disable no-await-in-loop -- table-driven cases mutate stateful mocks and must remain ordered */
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
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

  it('covers the remaining engagement commands, reads, validation bounds, and safe result mapping', async () => {
    const repository = fixtureRepository();
    const service = new MarketplaceEngagementDomainService(repository);
    const success = { status: 'ok' as const, value: {} as never };
    for (const method of [
      repository.addFavorite,
      repository.removeFavorite,
      repository.requestSample,
      repository.transitionSample,
      repository.submitSampleFeedback,
      repository.getSampleUsage,
      repository.activateSamplePolicy,
      repository.submitReview,
      repository.listPublicReviews,
      repository.replyToReview,
      repository.reportReview,
      repository.moderateReviewReport,
    ]) {
      vi.mocked(method).mockResolvedValue(success);
    }
    vi.mocked(repository.listFavorites).mockResolvedValue([]);
    vi.mocked(repository.listSamples).mockResolvedValue([]);
    vi.mocked(repository.getSamplePolicy).mockResolvedValue({ activeFrom: new Date(), monthlyLimit: 5, version: 1 });
    vi.mocked(repository.listReviewModerationQueue).mockResolvedValue([]);

    await expect(service.addFavorite(owner, 'listing-1', 'favorite:add-01')).resolves.toEqual({});
    await expect(service.removeFavorite(owner, 'listing-1', 'favorite:remove-01')).resolves.toEqual({});
    await expect(service.listFavorites(owner)).resolves.toEqual([]);
    await expect(
      service.requestSample(
        owner,
        { deliveryMethod: 'pickup', listingPublicationId: 'listing-1' },
        'sample:request-01',
      ),
    ).resolves.toEqual({});
    await expect(
      service.transitionSample(
        owner,
        'sample-1',
        { action: 'approve', deliveryQuoteUzs: 0, expectedRevision: 0 },
        'sample:approve-01',
      ),
    ).resolves.toEqual({});
    await expect(
      service.submitSampleFeedback(
        owner,
        'sample-1',
        { comment: '  Excellent   seed ', expectedRevision: 1, rating: 5 },
        'sample:feedback-01',
      ),
    ).resolves.toEqual({});
    await expect(
      service.submitSampleFeedback(owner, 'sample-1', { expectedRevision: 1, rating: 4 }, 'sample:feedback-02'),
    ).resolves.toEqual({});
    await expect(service.listSamples(owner)).resolves.toEqual([]);
    await expect(service.getSampleUsage(owner)).resolves.toEqual({});
    await expect(service.getSamplePolicy(owner.tenantId)).resolves.toMatchObject({ monthlyLimit: 5 });
    await expect(
      service.activateSamplePolicy(owner, { expectedVersion: 1, monthlyLimit: 5 }, 'sample:policy-01'),
    ).resolves.toEqual({});
    await expect(
      service.submitReview(
        owner,
        { assetReferences: [], listingPublicationId: 'listing-1', rating: 4 },
        'review:submit-01',
      ),
    ).resolves.toEqual({});
    await expect(service.listPublicReviews('listing-1')).resolves.toEqual({});
    await expect(
      service.replyToReview(owner, 'review-1', { comment: '  Thank   you ', expectedRevision: 0 }, 'review:reply-01'),
    ).resolves.toEqual({});
    await expect(
      service.reportReview(owner, 'review-1', { comment: '  duplicate ', reason: 'spam' }, 'review:report-01'),
    ).resolves.toEqual({});
    await expect(service.reportReview(owner, 'review-1', { reason: 'off_topic' }, 'review:report-02')).resolves.toEqual(
      {},
    );
    await expect(service.listReviewModerationQueue(owner.tenantId)).resolves.toEqual([]);
    await expect(
      service.moderateReviewReport(
        owner,
        'report-1',
        { decision: 'hidden', expectedRevision: 0 },
        'review:moderate-01',
      ),
    ).resolves.toEqual({});

    const invalidCalls: Array<() => unknown> = [
      () =>
        service.requestSample(
          owner,
          { deliveryMethod: 'courier' as 'pickup', listingPublicationId: 'listing-1' },
          'sample:invalid-01',
        ),
      () =>
        service.transitionSample(owner, 'sample-1', { action: 'approve', expectedRevision: -1 }, 'sample:invalid-02'),
      () =>
        service.transitionSample(owner, 'sample-1', { action: 'approve', expectedRevision: 0.5 }, 'sample:invalid-03'),
      () =>
        service.transitionSample(
          owner,
          'sample-1',
          { action: 'approve', deliveryQuoteUzs: 0.5, expectedRevision: 0 },
          'sample:invalid-04',
        ),
      () =>
        service.transitionSample(
          owner,
          'sample-1',
          { action: 'approve', deliveryQuoteUzs: -1, expectedRevision: 0 },
          'sample:invalid-05',
        ),
      () =>
        service.transitionSample(
          owner,
          'sample-1',
          { action: 'approve', deliveryQuoteUzs: 10_000_000_000_000, expectedRevision: 0 },
          'sample:invalid-06',
        ),
      () => service.submitSampleFeedback(owner, 'sample-1', { expectedRevision: 0, rating: 0 }, 'sample:invalid-07'),
      () => service.submitSampleFeedback(owner, 'sample-1', { expectedRevision: 0, rating: 6 }, 'sample:invalid-08'),
      () => service.submitSampleFeedback(owner, 'sample-1', { expectedRevision: 0, rating: 1.5 }, 'sample:invalid-09'),
      () => service.submitSampleFeedback(owner, 'sample-1', { expectedRevision: -1, rating: 5 }, 'sample:invalid-10'),
      () => service.submitSampleFeedback(owner, 'sample-1', { expectedRevision: 0.5, rating: 5 }, 'sample:invalid-11'),
      () =>
        service.submitSampleFeedback(
          owner,
          'sample-1',
          { comment: '   ', expectedRevision: 0, rating: 5 },
          'sample:invalid-12',
        ),
      () => service.activateSamplePolicy(owner, { expectedVersion: 1, monthlyLimit: 0 }, 'sample:invalid-13'),
      () => service.activateSamplePolicy(owner, { expectedVersion: 1, monthlyLimit: 101 }, 'sample:invalid-14'),
      () => service.activateSamplePolicy(owner, { expectedVersion: 1, monthlyLimit: 1.5 }, 'sample:invalid-15'),
      () => service.activateSamplePolicy(owner, { expectedVersion: 0, monthlyLimit: 5 }, 'sample:invalid-16'),
      () => service.activateSamplePolicy(owner, { expectedVersion: 1.5, monthlyLimit: 5 }, 'sample:invalid-17'),
      () =>
        service.submitReview(
          owner,
          { assetReferences: [], listingPublicationId: 'listing-1', rating: 0 },
          'review:invalid-01',
        ),
      () =>
        service.submitReview(
          owner,
          { assetReferences: [], listingPublicationId: 'listing-1', rating: 6 },
          'review:invalid-02',
        ),
      () =>
        service.submitReview(
          owner,
          { assetReferences: [], listingPublicationId: 'listing-1', rating: 1.5 },
          'review:invalid-03',
        ),
      () =>
        service.submitReview(
          owner,
          { assetReferences: undefined as never, listingPublicationId: 'listing-1', rating: 5 },
          'review:invalid-04',
        ),
      () =>
        service.submitReview(
          owner,
          {
            assetReferences: ['public-asset:a', 'public-asset:b', 'public-asset:c', 'public-asset:d'],
            listingPublicationId: 'listing-1',
            rating: 5,
          },
          'review:invalid-05',
        ),
      () =>
        service.submitReview(
          owner,
          { assetReferences: ['public-asset:a', 'public-asset:a'], listingPublicationId: 'listing-1', rating: 5 },
          'review:invalid-06',
        ),
      () => service.replyToReview(owner, 'review-1', { comment: 'ok', expectedRevision: -1 }, 'review:invalid-07'),
      () => service.replyToReview(owner, 'review-1', { comment: 'ok', expectedRevision: 0.5 }, 'review:invalid-08'),
      () => service.replyToReview(owner, 'review-1', { comment: '   ', expectedRevision: 0 }, 'review:invalid-09'),
      () => service.reportReview(owner, 'review-1', { reason: 'other' as 'spam' }, 'review:invalid-10'),
      () =>
        service.moderateReviewReport(
          owner,
          'report-1',
          { decision: 'delete' as 'hidden', expectedRevision: 0 },
          'review:invalid-11',
        ),
      () =>
        service.moderateReviewReport(
          owner,
          'report-1',
          { decision: 'dismissed', expectedRevision: -1 },
          'review:invalid-12',
        ),
      () =>
        service.moderateReviewReport(
          owner,
          'report-1',
          { decision: 'dismissed', expectedRevision: 0.5 },
          'review:invalid-13',
        ),
    ];
    for (const invoke of invalidCalls) {
      await expect(Promise.resolve().then(invoke)).rejects.toBeInstanceOf(BadRequestException);
    }

    for (const [result, ErrorType] of [
      [{ status: 'not_found' }, ResourceNotFoundException],
      [{ status: 'forbidden' }, ForbiddenException],
      [{ status: 'partner_unapproved' }, ForbiddenException],
      [{ status: 'conflict' }, ConflictException],
      [{ status: 'invalid_state' }, ConflictException],
      [{ status: 'validation_failed', field: 'listingPublicationId' }, BadRequestException],
    ] as const) {
      vi.mocked(repository.addFavorite).mockResolvedValueOnce(result as never);
      await expect(service.addFavorite(owner, 'listing-1', `favorite:${result.status}-key`)).rejects.toBeInstanceOf(
        ErrorType,
      );
    }
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
