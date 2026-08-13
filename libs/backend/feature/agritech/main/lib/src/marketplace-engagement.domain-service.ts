import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  demoReviewPage,
  isMarketplacePublicAssetReference,
  marketplaceReviewModerationDecisions,
  marketplaceReviewReportReasons,
  normalizeMarketplaceEngagementText,
  type ActivateMarketplaceSamplePolicyInput,
  type AgriTechOwner,
  type MarketplaceEngagementRepository,
  type MarketplaceFavoriteMutationResult,
  type MarketplaceFavoriteView,
  type MarketplaceReviewModerationItem,
  type MarketplaceReviewModerationResult,
  type MarketplaceReviewPage,
  type MarketplaceReviewReportReceipt,
  type MarketplaceReviewView,
  type MarketplaceSamplePolicyView,
  type MarketplaceSampleUsageView,
  type MarketplaceSampleView,
  type ModerateMarketplaceReviewReportInput,
  type OperationResult,
  type ReplyMarketplaceReviewInput,
  type ReportMarketplaceReviewInput,
  type RequestMarketplaceSampleInput,
  type SubmitMarketplaceReviewInput,
  type SubmitMarketplaceSampleFeedbackInput,
  type TransitionMarketplaceSampleInput,
} from '@app/backend-feature-agritech-shared';

const maximumUzsAmount = 9_999_999_999_999;
const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;

const unwrap = <T>(result: OperationResult<T>, resource: string): T => {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(resource);
  }
  if (result.status === 'forbidden' || result.status === 'partner_unapproved') {
    throw new ForbiddenException(resource);
  }
  if (result.status === 'conflict' || result.status === 'invalid_state') {
    throw new ConflictException(resource);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType: resource } });
};

export class MarketplaceEngagementDomainService {
  constructor(protected readonly repository: MarketplaceEngagementRepository) {}

  addFavorite(
    owner: AgriTechOwner,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<MarketplaceFavoriteMutationResult> {
    return this.repository
      .addFavorite(owner, listingPublicationId, requireIdempotencyKey(idempotencyKey))
      .then((result) => unwrap(result, 'marketplace-favorite'));
  }

  removeFavorite(
    owner: AgriTechOwner,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<MarketplaceFavoriteMutationResult> {
    return this.repository
      .removeFavorite(owner, listingPublicationId, requireIdempotencyKey(idempotencyKey))
      .then((result) => unwrap(result, 'marketplace-favorite'));
  }

  listFavorites(owner: AgriTechOwner): Promise<MarketplaceFavoriteView[]> {
    return this.repository.listFavorites(owner);
  }

  requestSample(
    owner: AgriTechOwner,
    input: RequestMarketplaceSampleInput,
    idempotencyKey: string,
  ): Promise<MarketplaceSampleView> {
    if (!['pickup', 'seller_delivery'].includes(input.deliveryMethod)) {
      throw validationError('deliveryMethod');
    }
    return this.repository
      .requestSample(owner, input, requireIdempotencyKey(idempotencyKey))
      .then((result) => unwrap(result, 'marketplace-sample'));
  }

  transitionSample(
    owner: AgriTechOwner,
    sampleId: string,
    input: TransitionMarketplaceSampleInput,
    idempotencyKey: string,
  ): Promise<MarketplaceSampleView> {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw validationError('expectedRevision');
    }
    if (
      input.deliveryQuoteUzs !== undefined &&
      (!Number.isSafeInteger(input.deliveryQuoteUzs) ||
        input.deliveryQuoteUzs < 0 ||
        input.deliveryQuoteUzs > maximumUzsAmount)
    ) {
      throw validationError('deliveryQuoteUzs');
    }
    if (input.action !== 'approve' && input.deliveryQuoteUzs !== undefined) {
      throw validationError('deliveryQuoteUzs');
    }
    return this.repository
      .transitionSample(owner, sampleId, input, requireIdempotencyKey(idempotencyKey))
      .then((result) => unwrap(result, 'marketplace-sample'));
  }

  submitSampleFeedback(
    owner: AgriTechOwner,
    sampleId: string,
    input: SubmitMarketplaceSampleFeedbackInput,
    idempotencyKey: string,
  ): Promise<MarketplaceSampleView> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw validationError('rating');
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw validationError('expectedRevision');
    }
    const comment = normalizeOptionalText(input.comment, 1_000, 'comment');
    return this.repository
      .submitSampleFeedback(
        owner,
        sampleId,
        { expectedRevision: input.expectedRevision, rating: input.rating, ...(comment ? { comment } : {}) },
        requireIdempotencyKey(idempotencyKey),
      )
      .then((result) => unwrap(result, 'marketplace-sample-feedback'));
  }

  listSamples(owner: AgriTechOwner): Promise<MarketplaceSampleView[]> {
    return this.repository.listSamples(owner);
  }

  getSampleUsage(owner: AgriTechOwner): Promise<MarketplaceSampleUsageView> {
    return this.repository.getSampleUsage(owner).then((result) => unwrap(result, 'marketplace-sample-usage'));
  }

  getSamplePolicy(tenantId: string): Promise<MarketplaceSamplePolicyView> {
    return this.repository.getSamplePolicy(tenantId);
  }

  activateSamplePolicy(
    owner: AgriTechOwner,
    input: ActivateMarketplaceSamplePolicyInput,
    idempotencyKey: string,
  ): Promise<MarketplaceSamplePolicyView> {
    if (
      !Number.isInteger(input.monthlyLimit) ||
      input.monthlyLimit < 1 ||
      input.monthlyLimit > 100 ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    ) {
      throw validationError('samplePolicy');
    }
    return this.repository
      .activateSamplePolicy(owner, input, requireIdempotencyKey(idempotencyKey))
      .then((result) => unwrap(result, 'marketplace-sample-policy'));
  }

  submitReview(
    owner: AgriTechOwner,
    input: SubmitMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<MarketplaceReviewView> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw validationError('rating');
    }
    if (
      !Array.isArray(input.assetReferences) ||
      input.assetReferences.length > 3 ||
      new Set(input.assetReferences).size !== input.assetReferences.length ||
      !input.assetReferences.every(isMarketplacePublicAssetReference)
    ) {
      throw validationError('assetReferences');
    }
    const comment = normalizeOptionalText(input.comment, 2_000, 'comment');
    return this.repository
      .submitReview(
        owner,
        {
          assetReferences: [...input.assetReferences],
          listingPublicationId: input.listingPublicationId,
          rating: input.rating,
          ...(comment ? { comment } : {}),
        },
        requireIdempotencyKey(idempotencyKey),
      )
      .then((result) => unwrap(result, 'marketplace-review'));
  }

  /**
   * The ratings block for one publication. A publication nobody has reviewed yet
   * — including a demo listing that exists only as a fixture, so the repository
   * cannot find it at all — falls back to the demo ratings, so the block reads as
   * a working surface rather than an empty one. A publication with even a single
   * real review only ever shows real reviews.
   */
  async listPublicReviews(listingPublicationId: string): Promise<MarketplaceReviewPage> {
    const result = await this.repository.listPublicReviews(listingPublicationId);
    if (result.status === 'not_found' || (result.status === 'ok' && result.value.items.length === 0)) {
      const demo = demoReviewPage(listingPublicationId);
      if (demo) {
        return demo;
      }
    }
    return unwrap(result, 'marketplace-public-review');
  }

  replyToReview(
    owner: AgriTechOwner,
    reviewId: string,
    input: ReplyMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<MarketplaceReviewView> {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw validationError('expectedRevision');
    }
    const comment = requireText(input.comment, 1_000, 'comment');
    return this.repository
      .replyToReview(
        owner,
        reviewId,
        { comment, expectedRevision: input.expectedRevision },
        requireIdempotencyKey(idempotencyKey),
      )
      .then((result) => unwrap(result, 'marketplace-review-reply'));
  }

  reportReview(
    owner: AgriTechOwner,
    reviewId: string,
    input: ReportMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<MarketplaceReviewReportReceipt> {
    if (!marketplaceReviewReportReasons.includes(input.reason)) {
      throw validationError('reason');
    }
    const comment = normalizeOptionalText(input.comment, 500, 'comment');
    return this.repository
      .reportReview(
        owner,
        reviewId,
        { reason: input.reason, ...(comment ? { comment } : {}) },
        requireIdempotencyKey(idempotencyKey),
      )
      .then((result) => unwrap(result, 'marketplace-review-report'));
  }

  listReviewModerationQueue(tenantId: string): Promise<MarketplaceReviewModerationItem[]> {
    return this.repository.listReviewModerationQueue(tenantId);
  }

  moderateReviewReport(
    owner: AgriTechOwner,
    reportId: string,
    input: ModerateMarketplaceReviewReportInput,
    idempotencyKey: string,
  ): Promise<MarketplaceReviewModerationResult> {
    if (
      !marketplaceReviewModerationDecisions.includes(input.decision) ||
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      throw validationError('moderation');
    }
    return this.repository
      .moderateReviewReport(owner, reportId, input, requireIdempotencyKey(idempotencyKey))
      .then((result) => unwrap(result, 'marketplace-review-report'));
  }
}

const requireIdempotencyKey = (value: string): string => {
  if (!idempotencyKeyPattern.test(value)) {
    throw validationError('idempotencyKey');
  }
  return value;
};

const normalizeOptionalText = (value: string | undefined, maximumLength: number, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeMarketplaceEngagementText(value, maximumLength);
  if (!normalized) {
    throw validationError(field);
  }
  return normalized;
};

const requireText = (value: string, maximumLength: number, field: string): string => {
  const normalized = normalizeMarketplaceEngagementText(value, maximumLength);
  if (!normalized) {
    throw validationError(field);
  }
  return normalized;
};

const validationError = (field: string): BadRequestException =>
  new BadRequestException({ meta: { field, resourceType: 'marketplace-engagement' } });
