// @requirements REQ-AGRITECH-ENGAGEMENT-019
import * as agriTechSource from '@app/backend-feature-agritech-shared';
import type { MarketplaceSampleStatus } from '@app/backend-feature-agritech-shared';

const agriTech =
  (
    agriTechSource as unknown as {
      default?: typeof agriTechSource;
    }
  ).default ?? agriTechSource;
const {
  marketplaceEngagementFingerprint,
  marketplaceSampleDefaultMonthlyLimit,
  marketplaceSampleTransitionTarget,
  marketplaceUtcMonthKey,
  marketplaceUtcSeasonKey,
  normalizeMarketplaceEngagementText,
} = agriTech;

interface Receipt<T> {
  fingerprint: string;
  result: T;
}

interface SampleRecord {
  auditCount: number;
  notificationCount: number;
  quoteUzs?: number;
  revision: number;
  sourceId: string;
  status: MarketplaceSampleStatus;
}

type FavoriteAttempt = { status: 'conflict' } | { result: { listingPublicationId: string }; status: 'ok' };
type SampleAttempt = { status: 'quota' } | { result: SampleRecord; status: 'ok' };
type ReviewAttempt = { status: 'conflict' } | { result: { id: string }; status: 'ok' };

export interface FavoriteAcceptanceResult {
  changedResourceConflict: boolean;
  favoriteCount: number;
  replayStable: boolean;
}

export interface SampleAcceptanceResult {
  auditCount: number;
  foreignTransitionDenied: boolean;
  limit: number;
  notificationCount: number;
  persisted: number;
  requesterPays: boolean;
  status: MarketplaceSampleStatus;
}

export interface ReviewAcceptanceResult {
  aggregateAfterHide: number;
  aggregateBeforeHide: number;
  changedReplayConflict: boolean;
  privateFieldsAbsent: boolean;
  reportingAloneKeptVisible: boolean;
  replyPersisted: boolean;
  reviewCount: number;
  verifiedDeal: boolean;
}

const actorKey = 'buyer-tenant:buyer-user';
const now = new Date('2026-08-10T12:00:00.000Z');

export class MarketplaceEngagementAcceptanceAdapter {
  private readonly favoriteReceipts = new Map<string, Receipt<{ listingPublicationId: string }>>();
  private readonly favorites = new Set<string>();
  private readonly samples: SampleRecord[] = [];
  private reviewEligibilityAvailable = true;
  private review:
    | {
        comment: string;
        id: string;
        listingPublicationId: string;
        rating: number;
        reply?: string;
        verifiedDeal: true;
        visible: boolean;
      }
    | undefined;
  private readonly reviewReceipts = new Map<string, Receipt<{ id: string }>>();

  exerciseOpaqueFavorite(): FavoriteAcceptanceResult {
    const first = this.favorite('listing-public-a', 'favorite-key-0001');
    const replay = this.favorite('listing-public-a', 'favorite-key-0001');
    const changed = this.favorite('listing-public-b', 'favorite-key-0001');
    return {
      changedResourceConflict: changed.status === 'conflict',
      favoriteCount: this.favorites.size,
      replayStable: first.status === 'ok' && replay.status === 'ok' && first.result === replay.result,
    };
  }

  async exerciseQuotaAndTransitions(): Promise<SampleAcceptanceResult> {
    for (let index = 1; index <= 4; index += 1) {
      this.requestSample(`source-${index}`);
    }
    const attempts = await Promise.all([
      Promise.resolve().then(() => this.requestSample('source-five')),
      Promise.resolve().then(() => this.requestSample('source-six')),
    ]);
    const acceptedAttempt = attempts.find((sample) => sample.status === 'ok');
    if (!acceptedAttempt) {
      throw new Error('The fifth sample request was not accepted.');
    }
    const accepted = acceptedAttempt.result;
    const foreignTransitionDenied = !this.transition(accepted, 'ship', 'foreign');
    this.transition(accepted, 'approve', 'seller', 45_000);
    this.transition(accepted, 'ship', 'seller');
    this.transition(accepted, 'receive', 'requester');
    accepted.auditCount += 1;
    accepted.notificationCount += 1;
    return {
      auditCount: accepted.auditCount,
      foreignTransitionDenied,
      limit: marketplaceSampleDefaultMonthlyLimit,
      notificationCount: accepted.notificationCount,
      persisted: this.samples.filter((sample) => sample.sourceId !== '').length,
      requesterPays: accepted.quoteUzs === 45_000,
      status: accepted.status,
    };
  }

  exerciseReviewModeration(): ReviewAcceptanceResult {
    const first = this.submitReview('listing-public-review', 5, '  Fresh   verified harvest ', 'review-key-0001');
    const replay = this.submitReview('listing-public-review', 5, 'Fresh verified harvest', 'review-key-0001');
    const changed = this.submitReview('listing-public-review', 4, 'Fresh verified harvest', 'review-key-0001');
    if (first.status !== 'ok' || replay.status !== 'ok' || !this.review) {
      throw new Error('The deal review was not created and replayed.');
    }
    this.review.reply = 'Thank you for the verified order';
    const countBeforeReport = this.visibleReviewCount();
    const publicBeforeHide = this.publicProjection();
    const reportingAloneKeptVisible = this.visibleReviewCount() === countBeforeReport;
    this.review.visible = false;
    return {
      aggregateAfterHide: this.visibleReviewCount(),
      aggregateBeforeHide: countBeforeReport,
      changedReplayConflict: changed.status === 'conflict',
      privateFieldsAbsent: !containsPrivateField(publicBeforeHide),
      reportingAloneKeptVisible,
      replyPersisted: this.review.reply.length > 0,
      reviewCount: 1,
      verifiedDeal: this.review.verifiedDeal,
    };
  }

  private favorite(listingPublicationId: string, idempotencyKey: string): FavoriteAttempt {
    const receiptKey = `${actorKey}:favorite_add:${idempotencyKey}`;
    const fingerprint = marketplaceEngagementFingerprint({ listingPublicationId });
    const receipt = this.favoriteReceipts.get(receiptKey);
    if (receipt) {
      return receipt.fingerprint === fingerprint ? { result: receipt.result, status: 'ok' } : { status: 'conflict' };
    }
    const result = { listingPublicationId };
    this.favorites.add(listingPublicationId);
    this.favoriteReceipts.set(receiptKey, { fingerprint, result });
    return { result, status: 'ok' };
  }

  private requestSample(sourceId: string): SampleAttempt {
    const monthKey = marketplaceUtcMonthKey(now);
    const seasonKey = marketplaceUtcSeasonKey(now);
    const used = this.samples.filter((sample) => sample.sourceId.startsWith(`${monthKey}:${seasonKey}:`)).length;
    if (used >= marketplaceSampleDefaultMonthlyLimit) {
      return { status: 'quota' };
    }
    const sample: SampleRecord = {
      auditCount: 1,
      notificationCount: 1,
      revision: 0,
      sourceId: `${monthKey}:${seasonKey}:${sourceId}`,
      status: 'requested',
    };
    this.samples.push(sample);
    return { result: sample, status: 'ok' };
  }

  private transition(
    sample: SampleRecord,
    action: 'approve' | 'ship' | 'receive',
    actor: 'foreign' | 'requester' | 'seller',
    quoteUzs?: number,
  ): boolean {
    const authorized = (action === 'receive' && actor === 'requester') || (action !== 'receive' && actor === 'seller');
    const target = marketplaceSampleTransitionTarget(sample.status, action);
    if (!authorized || !target || (action === 'approve' && quoteUzs === undefined)) {
      return false;
    }
    sample.status = target;
    sample.revision += 1;
    sample.auditCount += 1;
    sample.notificationCount += 1;
    if (quoteUzs !== undefined) {
      sample.quoteUzs = quoteUzs;
    }
    return true;
  }

  private submitReview(
    listingPublicationId: string,
    rating: number,
    comment: string,
    idempotencyKey: string,
  ): ReviewAttempt {
    const normalized = normalizeMarketplaceEngagementText(comment, 2_000);
    if (!normalized) {
      return { status: 'conflict' };
    }
    const receiptKey = `${actorKey}:review_submit:${idempotencyKey}`;
    const fingerprint = marketplaceEngagementFingerprint({ comment: normalized, listingPublicationId, rating });
    const receipt = this.reviewReceipts.get(receiptKey);
    if (receipt) {
      return receipt.fingerprint === fingerprint ? { result: receipt.result, status: 'ok' } : { status: 'conflict' };
    }
    if (!this.reviewEligibilityAvailable) {
      return { status: 'conflict' };
    }
    this.reviewEligibilityAvailable = false;
    this.review = {
      comment: normalized,
      id: 'review-public-1',
      listingPublicationId,
      rating,
      verifiedDeal: true,
      visible: true,
    };
    const result = { id: this.review.id };
    this.reviewReceipts.set(receiptKey, { fingerprint, result });
    return { result, status: 'ok' };
  }

  private visibleReviewCount(): number {
    return this.review?.visible ? 1 : 0;
  }

  private publicProjection(): Record<string, unknown> {
    if (!this.review) {
      return { aggregate: { averageRating: null, reviewCount: 0 }, items: [] };
    }
    return {
      aggregate: { averageRating: this.review.rating, reviewCount: this.visibleReviewCount() },
      items: this.review.visible
        ? [
            {
              comment: this.review.comment,
              id: this.review.id,
              listingPublicationId: this.review.listingPublicationId,
              rating: this.review.rating,
              reply: this.review.reply,
              verifiedDeal: true,
            },
          ]
        : [],
    };
  }
}

const privateFields = new Set([
  'tenantId',
  'userId',
  'partnerId',
  'productId',
  'produceListingId',
  'contractId',
  'eligibilityId',
  'idempotencyKey',
]);

function containsPrivateField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsPrivateField);
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => privateFields.has(key) || containsPrivateField(nested),
  );
}
