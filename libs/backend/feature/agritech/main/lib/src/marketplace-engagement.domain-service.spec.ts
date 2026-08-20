// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import { MarketplaceEngagementDomainService } from './marketplace-engagement.domain-service';

const owner = { tenantId: 'tenant-buyer', userId: 'buyer-user' };
const listingPublicationId = 'public-listing-1';
// Demo ratings are addressed by the publication ids the demo catalog publishes,
// which is what the public reviews route is keyed by.
const demoListingPublicationId = '9d000000-0000-4000-8000-000000000101';
// A demo listing the fixture deliberately leaves unrated.
const unratedDemoListingPublicationId = '9d000000-0000-4000-8000-000000000103';
const key = 'engagement-0001';
const ok = <T>(value: T) => ({ status: 'ok' as const, value });

function fixture() {
  const repository = {
    activateSamplePolicy: vi.fn().mockResolvedValue(ok({ monthlyLimit: 3, version: 2 })),
    addFavorite: vi.fn().mockResolvedValue(ok({ favorited: true })),
    getReviewSelfState: vi.fn().mockResolvedValue(ok({ canReview: true, listingPublicationId })),
    getSamplePolicy: vi.fn().mockResolvedValue({ monthlyLimit: 2, version: 1 }),
    getSampleUsage: vi.fn().mockResolvedValue(ok({ remaining: 1, used: 1 })),
    listFavorites: vi.fn().mockResolvedValue([{ listingPublicationId }]),
    listPublicReviews: vi.fn().mockResolvedValue(ok({ aggregate: { reviewCount: 1 }, items: [{ id: 'review-1' }] })),
    listReviewModerationQueue: vi.fn().mockResolvedValue([{ id: 'report-1' }]),
    listOwnReviews: vi
      .fn()
      .mockResolvedValue(ok({ awaitingReview: [], received: [], written: [{ review: { id: 'review-1' } }] })),
    listSamples: vi.fn().mockResolvedValue([{ id: 'sample-1' }]),
    moderateReviewReport: vi.fn().mockResolvedValue(ok({ decision: 'hidden' })),
    removeFavorite: vi.fn().mockResolvedValue(ok({ favorited: false })),
    replyToReview: vi.fn().mockResolvedValue(ok({ id: 'review-1' })),
    reportReview: vi.fn().mockResolvedValue(ok({ reportId: 'report-1' })),
    requestSample: vi.fn().mockResolvedValue(ok({ id: 'sample-1' })),
    submitReview: vi.fn().mockResolvedValue(ok({ id: 'review-1' })),
    submitSampleFeedback: vi.fn().mockResolvedValue(ok({ id: 'sample-1' })),
    transitionSample: vi.fn().mockResolvedValue(ok({ id: 'sample-1' })),
  };
  // A review may only carry photographs the reviewing account uploaded. The
  // guard is a collaborator so this suite can assert it is consulted, and so a
  // future asset store cannot be swapped in without the check going with it.
  const assets = { requireOwnedReferences: vi.fn().mockResolvedValue(undefined) };
  return { assets, repository, service: new MarketplaceEngagementDomainService(repository as never, assets) };
}

describe('MarketplaceEngagementDomainService favorites and reads', () => {
  it('passes a favorite toggle and every plain read straight through', async () => {
    const { repository, service } = fixture();

    await expect(service.addFavorite(owner, listingPublicationId, key)).resolves.toEqual({ favorited: true });
    await expect(service.removeFavorite(owner, listingPublicationId, key)).resolves.toEqual({ favorited: false });
    await expect(service.listFavorites(owner)).resolves.toEqual([{ listingPublicationId }]);
    await expect(service.listSamples(owner)).resolves.toEqual([{ id: 'sample-1' }]);
    await expect(service.getSampleUsage(owner)).resolves.toEqual({ remaining: 1, used: 1 });
    await expect(service.getSamplePolicy(owner.tenantId)).resolves.toEqual({ monthlyLimit: 2, version: 1 });
    await expect(service.listReviewModerationQueue(owner.tenantId)).resolves.toEqual([{ id: 'report-1' }]);

    expect(repository.addFavorite).toHaveBeenCalledWith(owner, listingPublicationId, key);
    expect(repository.removeFavorite).toHaveBeenCalledWith(owner, listingPublicationId, key);
  });

  /**
   * The own-review read has no demo fallback, unlike `listPublicReviews`. A demo
   * fixture standing in for a personal review history would be a claim about what
   * this account did, so an account with no reviews answers with empty lists and a
   * repository refusal stays a refusal.
   */
  it('reads the caller own review record without ever substituting demo rows', async () => {
    const { repository, service } = fixture();

    await expect(service.listOwnReviews(owner)).resolves.toEqual({
      awaitingReview: [],
      received: [],
      written: [{ review: { id: 'review-1' } }],
    });
    expect(repository.listOwnReviews).toHaveBeenCalledWith(owner);

    repository.listOwnReviews.mockResolvedValue(ok({ awaitingReview: [], received: [], written: [] }));
    await expect(service.listOwnReviews(owner)).resolves.toEqual({
      awaitingReview: [],
      received: [],
      written: [],
    });

    repository.listOwnReviews.mockResolvedValue({ status: 'forbidden' });
    await expect(service.listOwnReviews(owner)).rejects.toThrow(ForbiddenException);
  });

  /**
   * Every guard in this service throws before the repository promise exists, so a
   * bad command never reaches persistence even in a caller that forgets to await.
   */
  it('refuses an idempotency key too short, too long, or carrying unsafe characters', () => {
    const { repository, service } = fixture();

    for (const badKey of ['short', 'k'.repeat(101), 'has space', 'has/slash', '']) {
      expect(() => service.addFavorite(owner, listingPublicationId, badKey)).toThrow(BadRequestException);
    }
    expect(repository.addFavorite).not.toHaveBeenCalled();
    expect(() => service.removeFavorite(owner, listingPublicationId, 'short')).toThrow(BadRequestException);
    expect(repository.removeFavorite).not.toHaveBeenCalled();
  });

  it('maps every repository refusal onto its canonical failure', async () => {
    const cases = [
      [{ status: 'not_found' }, ResourceNotFoundException],
      [{ status: 'forbidden' }, ForbiddenException],
      [{ status: 'partner_unapproved' }, ForbiddenException],
      [{ status: 'conflict' }, ConflictException],
      [{ status: 'invalid_state' }, ConflictException],
      [{ status: 'invalid', field: 'listingPublicationId' }, BadRequestException],
    ] as const;

    for (const [result, expected] of cases) {
      const { repository, service } = fixture();
      repository.addFavorite.mockResolvedValue(result);

      await expect(service.addFavorite(owner, listingPublicationId, key)).rejects.toThrow(expected);
    }
  });
});

describe('MarketplaceEngagementDomainService samples', () => {
  const sampleId = 'sample-1';

  it('accepts both delivery methods and rejects anything else', async () => {
    const { repository, service } = fixture();

    for (const deliveryMethod of ['pickup', 'seller_delivery'] as const) {
      await expect(
        service.requestSample(owner, { deliveryMethod, listingPublicationId } as never, key),
      ).resolves.toEqual({ id: sampleId });
    }
    expect(() => service.requestSample(owner, { deliveryMethod: 'courier' } as never, key)).toThrow(
      BadRequestException,
    );
    expect(repository.requestSample).toHaveBeenCalledTimes(2);
  });

  it('only lets an approval carry a bounded delivery quote', async () => {
    const { repository, service } = fixture();
    const transition = (input: unknown) => service.transitionSample(owner, sampleId, input as never, key);

    await expect(transition({ action: 'approve', deliveryQuoteUzs: 800_000, expectedRevision: 0 })).resolves.toEqual({
      id: sampleId,
    });
    await expect(transition({ action: 'approve', deliveryQuoteUzs: 0, expectedRevision: 1 })).resolves.toEqual({
      id: sampleId,
    });
    await expect(transition({ action: 'decline', expectedRevision: 1 })).resolves.toEqual({ id: sampleId });

    // A quote on a non-approval is meaningless, and an unbounded one is unsafe.
    for (const input of [
      { action: 'decline', deliveryQuoteUzs: 1, expectedRevision: 1 },
      { action: 'approve', deliveryQuoteUzs: -1, expectedRevision: 1 },
      { action: 'approve', deliveryQuoteUzs: 10_000_000_000_000, expectedRevision: 1 },
      { action: 'approve', deliveryQuoteUzs: 1.5, expectedRevision: 1 },
      { action: 'approve', expectedRevision: -1 },
      { action: 'approve', expectedRevision: 1.5 },
    ]) {
      expect(() => transition(input)).toThrow(BadRequestException);
    }
    expect(repository.transitionSample).toHaveBeenCalledTimes(3);
  });

  it('keeps feedback within one to five stars and drops a blank comment', async () => {
    const { repository, service } = fixture();
    const feedback = (input: unknown) => service.submitSampleFeedback(owner, sampleId, input as never, key);

    await feedback({ comment: '  Sifatli namuna  ', expectedRevision: 0, rating: 5 });
    expect(repository.submitSampleFeedback).toHaveBeenCalledWith(
      owner,
      sampleId,
      { comment: 'Sifatli namuna', expectedRevision: 0, rating: 5 },
      key,
    );

    await feedback({ expectedRevision: 0, rating: 1 });
    expect(repository.submitSampleFeedback).toHaveBeenLastCalledWith(
      owner,
      sampleId,
      { expectedRevision: 0, rating: 1 },
      key,
    );

    for (const input of [
      { expectedRevision: 0, rating: 0 },
      { expectedRevision: 0, rating: 6 },
      { expectedRevision: 0, rating: 4.5 },
      { expectedRevision: -1, rating: 4 },
      { expectedRevision: 1.5, rating: 4 },
      { comment: '   ', expectedRevision: 0, rating: 4 },
    ]) {
      expect(() => feedback(input)).toThrow(BadRequestException);
    }
  });

  it('keeps a sample policy inside its published bounds', async () => {
    const { repository, service } = fixture();
    const activate = (input: unknown) => service.activateSamplePolicy(owner, input as never, key);

    await expect(activate({ expectedVersion: 1, monthlyLimit: 3 })).resolves.toEqual({ monthlyLimit: 3, version: 2 });
    for (const input of [
      { expectedVersion: 1, monthlyLimit: 0 },
      { expectedVersion: 1, monthlyLimit: 101 },
      { expectedVersion: 1, monthlyLimit: 2.5 },
      { expectedVersion: 0, monthlyLimit: 3 },
      { expectedVersion: 1.5, monthlyLimit: 3 },
    ]) {
      expect(() => activate(input)).toThrow(BadRequestException);
    }
    expect(repository.activateSamplePolicy).toHaveBeenCalledTimes(1);
  });
});

describe('MarketplaceEngagementDomainService reviews', () => {
  const reviewId = 'review-1';

  it('refuses a photograph the reviewing party did not upload, and never reaches the repository', async () => {
    const { assets, repository, service } = fixture();
    const input = { assetReferences: ['public-asset:abcdefgh'], listingPublicationId, rating: 4 };

    await service.submitReview(owner, input as never, key);
    // The guard sees exactly the handles the review will carry, so a reference
    // cannot be checked and then replaced on the way to persistence.
    expect(assets.requireOwnedReferences).toHaveBeenCalledWith(owner, ['public-asset:abcdefgh'], 'assetReferences');

    assets.requireOwnedReferences.mockRejectedValueOnce(
      new BadRequestException({ meta: { field: 'assetReferences' } }),
    );
    repository.submitReview.mockClear();
    await expect(service.submitReview(owner, input as never, key)).rejects.toThrow(BadRequestException);
    expect(repository.submitReview).not.toHaveBeenCalled();
  });

  it('accepts up to three distinct public asset references and normalizes the comment', async () => {
    const { repository, service } = fixture();
    const submit = (input: unknown) => service.submitReview(owner, input as never, key);

    await submit({
      assetReferences: ['public-asset:abcdefgh', 'public-asset:ijklmnop'],
      comment: '  Yaxshi mahsulot  ',
      listingPublicationId,
      rating: 5,
    });

    expect(repository.submitReview).toHaveBeenCalledWith(
      owner,
      {
        assetReferences: ['public-asset:abcdefgh', 'public-asset:ijklmnop'],
        comment: 'Yaxshi mahsulot',
        listingPublicationId,
        rating: 5,
      },
      key,
    );

    await submit({ assetReferences: [], listingPublicationId, rating: 3 });
    expect(repository.submitReview).toHaveBeenLastCalledWith(
      owner,
      { assetReferences: [], listingPublicationId, rating: 3 },
      key,
    );

    for (const input of [
      { assetReferences: [], listingPublicationId, rating: 0 },
      { assetReferences: [], listingPublicationId, rating: 6 },
      { assetReferences: [], listingPublicationId, rating: 4.5 },
      // Four references, a duplicate, a non-array, and an off-scheme reference.
      {
        assetReferences: [
          'public-asset:aaaaaaaa',
          'public-asset:bbbbbbbb',
          'public-asset:cccccccc',
          'public-asset:dddddddd',
        ],
        listingPublicationId,
        rating: 4,
      },
      { assetReferences: ['public-asset:aaaaaaaa', 'public-asset:aaaaaaaa'], listingPublicationId, rating: 4 },
      { assetReferences: 'public-asset:aaaaaaaa', listingPublicationId, rating: 4 },
      { assetReferences: ['https://example.test/pic.png'], listingPublicationId, rating: 4 },
      { assetReferences: [], comment: '   ', listingPublicationId, rating: 4 },
    ]) {
      expect(() => submit(input)).toThrow(BadRequestException);
    }
  });

  it('shows demo ratings only while a publication has none of its own', async () => {
    const { repository, service } = fixture();

    // A real review wins over the demo block even on a demo publication.
    await expect(service.listPublicReviews(demoListingPublicationId)).resolves.toMatchObject({
      items: [{ id: 'review-1' }],
    });

    repository.listPublicReviews.mockResolvedValue(ok({ aggregate: { reviewCount: 0 }, items: [] }));
    await expect(service.listPublicReviews(demoListingPublicationId)).resolves.toMatchObject({
      aggregate: { listingPublicationId: demoListingPublicationId, reviewCount: 3 },
    });
    // A demo publication the repository has never heard of still gets its block:
    // it exists only as a fixture, so the repository cannot find it at all.
    repository.listPublicReviews.mockResolvedValue({ status: 'not_found' });
    await expect(service.listPublicReviews(demoListingPublicationId)).resolves.toMatchObject({
      aggregate: { reviewCount: 3 },
    });

    // A governed listing nobody has reviewed is a listing with no reviews, and it
    // says so rather than borrowing a fixture's stars. A missing one stays missing.
    repository.listPublicReviews.mockResolvedValue(ok({ aggregate: { reviewCount: 0 }, items: [] }));
    await expect(service.listPublicReviews(listingPublicationId)).resolves.toMatchObject({ items: [] });
    repository.listPublicReviews.mockResolvedValue({ status: 'not_found' });
    await expect(service.listPublicReviews(listingPublicationId)).rejects.toThrow(ResourceNotFoundException);

    // An unrated demo listing answers with its own empty block, not a 404.
    await expect(service.listPublicReviews(unratedDemoListingPublicationId)).resolves.toEqual({
      aggregate: {
        averageRating: null,
        listingPublicationId: unratedDemoListingPublicationId,
        reviewCount: 0,
        revision: 0,
      },
      items: [],
    });
  });

  /**
   * The caller's own standing is read from persisted eligibility, never guessed
   * from the author-free public projection. A demo listing is not transactional,
   * so it can never produce the completed contract this read looks for.
   */
  it('reports the own review standing of a caller, and refuses no one a demo listing', async () => {
    const { repository, service } = fixture();

    await expect(service.getReviewSelfState(owner, listingPublicationId)).resolves.toEqual({
      canReview: true,
      listingPublicationId,
    });
    expect(repository.getReviewSelfState).toHaveBeenCalledWith(owner, listingPublicationId);

    repository.getReviewSelfState.mockResolvedValue({ status: 'not_found' });
    await expect(service.getReviewSelfState(owner, demoListingPublicationId)).resolves.toEqual({
      canReview: false,
      listingPublicationId: demoListingPublicationId,
    });
    await expect(service.getReviewSelfState(owner, listingPublicationId)).rejects.toThrow(ResourceNotFoundException);
  });

  it('requires a seller reply to actually say something', async () => {
    const { repository, service } = fixture();
    const reply = (input: unknown) => service.replyToReview(owner, reviewId, input as never, key);

    await reply({ comment: '  Rahmat!  ', expectedRevision: 2 });
    expect(repository.replyToReview).toHaveBeenCalledWith(
      owner,
      reviewId,
      { comment: 'Rahmat!', expectedRevision: 2 },
      key,
    );

    for (const input of [
      { comment: '   ', expectedRevision: 2 },
      { comment: 'ok', expectedRevision: -1 },
      { comment: 'ok', expectedRevision: 1.5 },
    ]) {
      expect(() => reply(input)).toThrow(BadRequestException);
    }
  });

  it('accepts each report reason and each moderation decision, and nothing outside them', async () => {
    const { repository, service } = fixture();

    for (const reason of ['spam', 'abuse', 'privacy', 'off_topic'] as const) {
      await expect(service.reportReview(owner, reviewId, { reason }, key)).resolves.toEqual({ reportId: 'report-1' });
    }
    await service.reportReview(owner, reviewId, { comment: '  duplicate  ', reason: 'spam' }, key);
    expect(repository.reportReview).toHaveBeenLastCalledWith(
      owner,
      reviewId,
      { comment: 'duplicate', reason: 'spam' },
      key,
    );
    expect(() => service.reportReview(owner, reviewId, { reason: 'because' } as never, key)).toThrow(
      BadRequestException,
    );
    expect(() => service.reportReview(owner, reviewId, { comment: '  ', reason: 'spam' }, key)).toThrow(
      BadRequestException,
    );

    for (const decision of ['dismissed', 'hidden'] as const) {
      await expect(
        service.moderateReviewReport(owner, 'report-1', { decision, expectedRevision: 0 }, key),
      ).resolves.toEqual({ decision: 'hidden' });
    }
    for (const input of [
      { decision: 'deleted', expectedRevision: 0 },
      { decision: 'hidden', expectedRevision: -1 },
      { decision: 'hidden', expectedRevision: 1.5 },
    ]) {
      expect(() => service.moderateReviewReport(owner, 'report-1', input as never, key)).toThrow(BadRequestException);
    }
  });
});
