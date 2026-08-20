import { createHash } from 'node:crypto';
import type { AgriTechOwner, OperationResult } from './agritech.types';

export const MarketplaceEngagementRepositoryInjectToken = Symbol('MarketplaceEngagementRepositoryInjectToken');

export const marketplaceSampleDefaultMonthlyLimit = 5;
export const marketplaceEngagementLocales = ['en', 'ru', 'uz', 'uz-cyrl'] as const;
export const marketplaceSampleStatuses = [
  'requested',
  'approved',
  'declined',
  'cancelled',
  'shipped',
  'received',
] as const;
export const marketplaceReviewReportReasons = ['spam', 'abuse', 'privacy', 'off_topic'] as const;
export const marketplaceReviewModerationDecisions = ['dismissed', 'hidden'] as const;

export type MarketplaceEngagementLocale = (typeof marketplaceEngagementLocales)[number];
export type MarketplaceEngagementSourceKind = 'product' | 'produce';
export type MarketplaceSampleStatus = (typeof marketplaceSampleStatuses)[number];
export type MarketplaceSampleDeliveryMethod = 'pickup' | 'seller_delivery';
export type MarketplaceReviewReportReason = (typeof marketplaceReviewReportReasons)[number];
export type MarketplaceReviewModerationDecision = (typeof marketplaceReviewModerationDecisions)[number];

export interface MarketplaceEngagementListingSummary {
  id: string;
  kind: MarketplaceEngagementSourceKind;
  title: string;
  titleRu?: string;
  titleUz?: string;
  titleUzCyrl?: string;
  sampleAvailable: boolean;
  seller: {
    id: string;
    displayName: string;
  };
}

export interface MarketplaceFavoriteView {
  listing: MarketplaceEngagementListingSummary;
  createdAt: Date;
}

export interface MarketplaceFavoriteMutationResult {
  listingPublicationId: string;
  favorited: boolean;
}

export interface MarketplaceSamplePolicyView {
  version: number;
  monthlyLimit: number;
  activeFrom: Date;
}

export interface MarketplaceSampleUsageView {
  period: string;
  used: number;
  limit: number;
  remaining: number;
  policyVersion: number;
}

export interface MarketplaceSampleFeedbackView {
  rating: number;
  comment?: string;
  createdAt: Date;
}

export interface MarketplaceSampleView {
  id: string;
  listing: MarketplaceEngagementListingSummary;
  actorRole: 'requester' | 'seller';
  seasonKey: string;
  policyVersion: number;
  status: MarketplaceSampleStatus;
  delivery: {
    method: MarketplaceSampleDeliveryMethod;
    requesterPays: true;
    itemPriceUzs: 0;
    quoteUzs?: number;
  };
  feedback?: MarketplaceSampleFeedbackView;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestMarketplaceSampleInput {
  listingPublicationId: string;
  deliveryMethod: MarketplaceSampleDeliveryMethod;
}

export interface TransitionMarketplaceSampleInput {
  action: 'approve' | 'decline' | 'cancel' | 'ship' | 'receive';
  expectedRevision: number;
  deliveryQuoteUzs?: number;
}

export interface SubmitMarketplaceSampleFeedbackInput {
  rating: number;
  comment?: string;
  expectedRevision: number;
}

export interface MarketplaceReviewReplyView {
  id: string;
  comment: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceReviewView {
  id: string;
  listingPublicationId: string;
  rating: number;
  comment?: string;
  assetReferences: string[];
  verifiedDeal: true;
  reply?: MarketplaceReviewReplyView;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceReviewAggregateView {
  listingPublicationId: string;
  reviewCount: number;
  averageRating: number | null;
  revision: number;
}

export interface MarketplaceReviewPage {
  aggregate: MarketplaceReviewAggregateView;
  items: MarketplaceReviewView[];
}

/**
 * What the authenticated visitor may do with one listing's ratings, plus the one
 * review they have already left on it.
 *
 * The public review projection is deliberately author-free, so a browser cannot
 * work out which visible row is its own and therefore cannot tell "you already
 * rated this" apart from "you were never able to". This read answers both
 * questions from persisted eligibility instead of from a client guess, and stays
 * one boolean plus the caller's own review: eligibility rows, contract ids and
 * remaining counts stay private.
 */
export interface MarketplaceReviewSelfState {
  listingPublicationId: string;
  /** An unconsumed completed-contract eligibility exists for this caller. */
  canReview: boolean;
  /** The caller's own review of this governed source, when they left one. */
  review?: MarketplaceReviewView;
}

/**
 * One review as the party it belongs to sees it, with the listing it was left
 * against.
 *
 * The public projection carries only `listingPublicationId`, which is enough for
 * a product page that already knows its own listing and useless in a cabinet
 * listing reviews across many listings. The summary here is the same allowlisted
 * `MarketplaceEngagementListingSummary` favorites and samples already return, so
 * no private source, partner or contract identifier is added to reach it.
 */
export interface MarketplaceOwnReviewEntry {
  listing: MarketplaceEngagementListingSummary;
  review: MarketplaceReviewView;
}

/**
 * A completed purchase this caller may still rate: one unconsumed
 * completed-contract eligibility, named by the listing it was earned on.
 *
 * It is the read side of exactly the gate `submitReview` enforces, so an
 * invitation shown here cannot be an invitation the write path would refuse. The
 * eligibility and contract identifiers behind it stay private.
 */
export interface MarketplaceOwnReviewInvitation {
  listing: MarketplaceEngagementListingSummary;
  completedAt: Date;
}

/**
 * The caller's whole review standing, split by which direction it points.
 *
 * `written` and `received` are opposite facts about reputation - what this party
 * said about others, and what others said about them - so they are two lists
 * rather than one list with a role flag: nothing may merge them by accident. Both
 * are bounded and newest first, and `received` covers every seller organization
 * this caller is an active member of, because a seller can hold several.
 */
export interface MarketplaceOwnReviews {
  written: MarketplaceOwnReviewEntry[];
  received: MarketplaceOwnReviewEntry[];
  /** Purchases with an unused eligibility. Empty for a caller who owes no rating. */
  awaitingReview: MarketplaceOwnReviewInvitation[];
}

/**
 * The published average of a rating aggregate: one decimal place, or nothing at
 * all while no visible deal-verified review exists.
 *
 * `rating_sum / review_count` is exact but unreadable - 5 + 4 + 5 over three
 * reviews is 4.666666666666667. Rounding here rather than in each renderer keeps
 * the demo block, the catalog card, the product page and the seller profile
 * quoting one number, and the review count always travels beside it so the
 * rounding stays checkable rather than a claim.
 */
export const marketplaceReviewAverageRating = (ratingSum: number, reviewCount: number): number | null => {
  if (!Number.isFinite(ratingSum) || !Number.isInteger(reviewCount) || reviewCount <= 0) {
    return null;
  }
  return Math.round((ratingSum / reviewCount) * 10) / 10;
};

export interface SubmitMarketplaceReviewInput {
  listingPublicationId: string;
  rating: number;
  comment?: string;
  assetReferences: string[];
}

export interface ReplyMarketplaceReviewInput {
  comment: string;
  expectedRevision: number;
}

export interface ReportMarketplaceReviewInput {
  reason: MarketplaceReviewReportReason;
  comment?: string;
}

export interface MarketplaceReviewReportReceipt {
  id: string;
  status: 'pending';
  revision: number;
  createdAt: Date;
}

export interface MarketplaceReviewModerationItem {
  reportId: string;
  reason: MarketplaceReviewReportReason;
  reportComment?: string;
  review: MarketplaceReviewView;
  expectedRevision: number;
  submittedAt: Date;
}

export interface ModerateMarketplaceReviewReportInput {
  decision: MarketplaceReviewModerationDecision;
  expectedRevision: number;
}

export interface MarketplaceReviewModerationResult {
  reportId: string;
  decision: MarketplaceReviewModerationDecision;
  reviewVisible: boolean;
  aggregate: MarketplaceReviewAggregateView;
  revision: number;
  decidedAt: Date;
}

export interface ActivateMarketplaceSamplePolicyInput {
  monthlyLimit: number;
  expectedVersion: number;
}

export interface MarketplaceEngagementRepository {
  addFavorite(
    owner: AgriTechOwner,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceFavoriteMutationResult>>;
  removeFavorite(
    owner: AgriTechOwner,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceFavoriteMutationResult>>;
  listFavorites(owner: AgriTechOwner): Promise<MarketplaceFavoriteView[]>;

  requestSample(
    owner: AgriTechOwner,
    input: RequestMarketplaceSampleInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSampleView>>;
  transitionSample(
    owner: AgriTechOwner,
    sampleId: string,
    input: TransitionMarketplaceSampleInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSampleView>>;
  submitSampleFeedback(
    owner: AgriTechOwner,
    sampleId: string,
    input: SubmitMarketplaceSampleFeedbackInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSampleView>>;
  listSamples(owner: AgriTechOwner): Promise<MarketplaceSampleView[]>;
  getSampleUsage(owner: AgriTechOwner): Promise<OperationResult<MarketplaceSampleUsageView>>;
  getSamplePolicy(tenantId: string): Promise<MarketplaceSamplePolicyView>;
  activateSamplePolicy(
    owner: AgriTechOwner,
    input: ActivateMarketplaceSamplePolicyInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSamplePolicyView>>;

  submitReview(
    owner: AgriTechOwner,
    input: SubmitMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewView>>;
  listPublicReviews(listingPublicationId: string): Promise<OperationResult<MarketplaceReviewPage>>;
  getReviewSelfState(
    owner: AgriTechOwner,
    listingPublicationId: string,
  ): Promise<OperationResult<MarketplaceReviewSelfState>>;
  listOwnReviews(owner: AgriTechOwner): Promise<OperationResult<MarketplaceOwnReviews>>;
  replyToReview(
    owner: AgriTechOwner,
    reviewId: string,
    input: ReplyMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewView>>;
  reportReview(
    owner: AgriTechOwner,
    reviewId: string,
    input: ReportMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewReportReceipt>>;
  listReviewModerationQueue(tenantId: string): Promise<MarketplaceReviewModerationItem[]>;
  moderateReviewReport(
    owner: AgriTechOwner,
    reportId: string,
    input: ModerateMarketplaceReviewReportInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewModerationResult>>;
}

export const marketplaceUtcMonthKey = (now: Date): string => {
  assertValidDate(now);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Calendar seasons are deterministic UTC quarters, not caller-supplied crop labels. */
export const marketplaceUtcSeasonKey = (now: Date): string => {
  assertValidDate(now);
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
};

export const marketplaceSampleTransitionTarget = (
  current: MarketplaceSampleStatus,
  action: TransitionMarketplaceSampleInput['action'],
): MarketplaceSampleStatus | undefined => {
  const transitions: Readonly<
    Record<
      MarketplaceSampleStatus,
      Partial<Record<TransitionMarketplaceSampleInput['action'], MarketplaceSampleStatus>>
    >
  > = {
    requested: { approve: 'approved', cancel: 'cancelled', decline: 'declined' },
    approved: { ship: 'shipped' },
    declined: {},
    cancelled: {},
    shipped: { receive: 'received' },
    received: {},
  };
  return transitions[current][action];
};

export const normalizeMarketplaceEngagementText = (value: unknown, maximumLength: number): string | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.normalize('NFC').trim().replaceAll(/\s+/gu, ' ');
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    /[\p{Cc}\p{Cf}]/u.test(normalized) ||
    /(?:https?:\/\/|www\.)/iu.test(normalized) ||
    /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}\b/iu.test(normalized) ||
    /(?:\+?\d[\s().-]*){7,}/u.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
};

export const isMarketplacePublicAssetReference = (value: unknown): value is string =>
  typeof value === 'string' && /^public-asset:[A-Za-z0-9_-]{8,100}$/u.test(value);

export const marketplaceEngagementFingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');

const canonicalValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
};

const assertValidDate = (value: Date): void => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError('A valid date is required.');
  }
};
