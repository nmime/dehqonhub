// @requirements REQ-AGRITECH-PUBLIC-018
import { MarketplacePublicDomainService } from '@app/backend-feature-agritech-main-marketplace-public-domain-service';
import type {
  AgriTechOwner,
  MarketplaceListingPublication,
  MarketplacePublicCatalogCursor,
  MarketplacePublicCatalogQuery,
  MarketplacePublicListing,
  MarketplacePublicPage,
  MarketplacePublicRepository,
  MarketplacePublicRequest,
  MarketplacePublicSeller,
  MarketplacePublishedListingRecord,
  MarketplacePublishedRequestRecord,
  MarketplacePublishedSellerRecord,
  MarketplaceSellerProfileModerationItem,
  OperationResult,
  PublishMarketplaceListingInput,
  ReviewMarketplaceListingPublicationInput,
  ReviewMarketplaceSellerProfileInput,
} from '@app/backend-feature-agritech-shared';

type ProjectionEligibility = 'approved' | 'approved-with-pending-edit' | 'approved-keyset' | 'ineligible';
type ModerationDecision = 'approved' | 'rejected';

const approvedSeller: MarketplacePublishedSellerRecord = {
  description: 'Verified supplier',
  displayName: 'Zarafshon Agro',
  publicId: '33333333-3333-4333-8333-333333333333',
  region: 'Samarkand',
  verified: true,
};

const publicationTime = new Date('2030-01-01T00:00:00.000Z');
const updateTime = new Date('2030-01-02T00:00:00.000Z');
const sellerContentFingerprint = 'a'.repeat(64);

const approvedListings: MarketplacePublishedListingRecord[] = [
  {
    availableQuantity: 20,
    description: 'Certified seed',
    images: [],
    priceUzs: 4_200_000,
    productCategory: 'seed',
    promoted: false,
    publicId: '11111111-1111-4111-8111-111111111111',
    rating: { average: 4.5, count: 2 },
    publishedAt: publicationTime,
    region: 'Samarkand',
    sampleAvailable: true,
    section: 'seeds',
    sellerDisplayName: approvedSeller.displayName,
    sellerPublicId: approvedSeller.publicId,
    sellerRegion: approvedSeller.region,
    sourceKind: 'product',
    title: 'Corn F1',
    titleRu: 'Кукуруза F1',
    titleUz: "Makkajo'xori F1",
    titleUzCyrl: 'Маккажўхори F1',
    unit: 't',
    updatedAt: updateTime,
  },
  {
    availableQuantity: 12,
    description: 'Grade A harvest',
    images: [],
    priceUzs: 920_000,
    produceCrop: 'tomato',
    produceGrade: 'A',
    promoted: false,
    publicId: '22222222-2222-4222-8222-222222222222',
    rating: { average: null, count: 0 },
    publishedAt: publicationTime,
    region: 'Samarkand',
    sampleAvailable: false,
    section: 'produce',
    sellerDisplayName: approvedSeller.displayName,
    sellerPublicId: approvedSeller.publicId,
    sellerRegion: approvedSeller.region,
    sourceKind: 'produce',
    title: 'Tomato',
    titleRu: 'Томат',
    titleUz: 'Pomidor',
    titleUzCyrl: 'Помидор',
    unit: 'kg',
    updatedAt: updateTime,
  },
];

const approvedRequest: MarketplacePublishedRequestRecord = {
  budgetUzs: 45_000_000,
  buyerDisplayName: 'Bahor Farm',
  createdAt: publicationTime,
  deadline: '2030-01-20',
  product: 'Corn F1',
  publicId: '44444444-4444-4444-8444-444444444444',
  region: 'Samarkand',
  requirements: 'Certified',
  title: 'Corn seeds, 10 tons',
  updatedAt: updateTime,
  volume: '10 t',
};

const pendingListingPublication: MarketplaceListingPublication = {
  id: approvedListings[0]?.publicId ?? '11111111-1111-4111-8111-111111111111',
  moderationStatus: 'pending',
  revision: 0,
  section: 'seeds',
  sellerPublicId: approvedSeller.publicId,
  sourceId: '55555555-5555-4555-8555-555555555555',
  sourceKind: 'product',
  status: 'published',
  updatedAt: updateTime,
};

const pendingSellerProfile = (): MarketplaceSellerProfileModerationItem => ({
  contentFingerprint: sellerContentFingerprint,
  contentRevision: 1,
  description: approvedSeller.description,
  displayName: approvedSeller.displayName,
  moderationStatus: 'pending',
  region: approvedSeller.region,
  sellerPublicId: approvedSeller.publicId,
  submittedAt: publicationTime,
});

const canonicalInput = (input: PublishMarketplaceListingInput): string =>
  JSON.stringify({
    section: input.section,
    sellerPartnerId: input.sellerPartnerId,
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
  });

export interface MarketplacePublicGuestProjection {
  catalog: MarketplacePublicPage<MarketplacePublicListing>;
  requests: MarketplacePublicPage<MarketplacePublicRequest>;
  seller: (MarketplacePublicSeller & { description?: string }) | undefined;
  suggestions: Awaited<ReturnType<MarketplacePublicDomainService['listSuggestions']>>;
}

export interface MarketplacePublicModerationRace {
  completedDecision: ModerationDecision;
  decisionWrites: number;
  exactReplay: ModerationDecision;
  listingDecisionAfterSellerReview: ModerationDecision;
  sellerCompletedDecision: ModerationDecision;
  sellerDecisionBeforeIndependentReview: ModerationDecision | undefined;
  sellerDecisionWrites: number;
  sellerContentFingerprint: string;
  sellerExactReplay: ModerationDecision;
  staleSellerFingerprintDecision: unknown;
  staleOppositeDecision: unknown;
}

export interface MarketplacePublicKeysetExercise {
  firstPage: MarketplacePublicPage<MarketplacePublicListing>;
  secondPage: MarketplacePublicPage<MarketplacePublicListing>;
  observedQueries: MarketplacePublicCatalogQuery[];
  callsBeforeInvalidCursors: number;
  callsAfterInvalidCursors: number;
  extraFieldCursorError: unknown;
  malformedCursorError: unknown;
  oversizedCursorError: unknown;
  sortMismatchError: unknown;
}

export interface MarketplacePublicSellerRejectionFanout {
  pendingOtherRevisionIds: string[];
  rejectedPinnedListingIds: string[];
  remainingPinnedListingIds: string[];
  reviewedContentFingerprint: string;
  sellerAfter: MarketplacePublicSeller | undefined;
  sellerBefore: MarketplacePublicSeller | undefined;
  visibleListingIdsAfter: string[];
  visibleListingIdsBefore: string[];
}

const catalogCursorFor = (
  record: MarketplacePublishedListingRecord,
  sort: MarketplacePublicCatalogQuery['sort'],
): MarketplacePublicCatalogCursor =>
  sort === 'newest'
    ? {
        id: record.publicId,
        kind: 'catalog',
        promoted: record.promoted,
        publishedAt: record.publishedAt.toISOString(),
        sort,
      }
    : { id: record.publicId, kind: 'catalog', priceUzs: record.priceUzs, sort };

const listingPage = (
  source: MarketplacePublishedListingRecord[],
  input: MarketplacePublicCatalogQuery,
): { items: MarketplacePublishedListingRecord[]; nextCursor?: MarketplacePublicCatalogCursor } => {
  const query = input.query?.toLocaleLowerCase('en');
  const filtered = source.filter(
    (record) =>
      (!input.section || record.section === input.section) &&
      (!input.category || record.productCategory === input.category) &&
      (!input.crop || record.produceCrop === input.crop) &&
      (!input.region || record.region === input.region) &&
      (input.minPriceUzs === undefined || record.priceUzs >= input.minPriceUzs) &&
      (input.maxPriceUzs === undefined || record.priceUzs <= input.maxPriceUzs) &&
      (input.minAvailableQuantity === undefined || record.availableQuantity >= input.minAvailableQuantity) &&
      (!query ||
        [record.title, record.titleRu, record.titleUz, record.titleUzCyrl, record.sellerDisplayName].some((value) =>
          value?.toLocaleLowerCase('en').includes(query),
        )),
  );
  const ordered = [...filtered].sort((left, right) => {
    if (input.sort === 'price_asc' || input.sort === 'price_desc') {
      const priceOrder = left.priceUzs - right.priceUzs;
      if (priceOrder !== 0) {
        return input.sort === 'price_asc' ? priceOrder : -priceOrder;
      }
    } else {
      const promotionOrder = Number(right.promoted) - Number(left.promoted);
      if (promotionOrder !== 0) {
        return promotionOrder;
      }
      const publishedOrder = right.publishedAt.valueOf() - left.publishedAt.valueOf();
      if (publishedOrder !== 0) {
        return publishedOrder;
      }
    }
    return left.publicId.localeCompare(right.publicId);
  });
  const cursorIndex = input.cursor ? ordered.findIndex((record) => record.publicId === input.cursor?.id) : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const items = ordered.slice(start, start + input.limit);
  const last = items.at(-1);
  const hasNext = start + items.length < ordered.length;
  return {
    items,
    ...(hasNext && last ? { nextCursor: catalogCursorFor(last, input.sort) } : {}),
  };
};

/**
 * Thin Cucumber boundary around the production public domain service. Repository
 * fixtures select the scenario state; PostgreSQL eligibility is separate mapped
 * component evidence for the same requirement.
 */
export class MarketplacePublicAcceptanceAdapter {
  private readonly service: MarketplacePublicDomainService;
  private readonly catalogQueries: MarketplacePublicCatalogQuery[] = [];
  private readonly publications = new Map<string, { fingerprint: string; value: MarketplaceListingPublication }>();
  private publicationWrites = 0;
  private readonly listingModerationOperations = new Map<
    string,
    { fingerprint: string; value: MarketplaceListingPublication }
  >();
  private listingModerationDecision: ModerationDecision | undefined;
  private listingModerationWrites = 0;
  private readonly sellerModerationOperations = new Map<
    string,
    { fingerprint: string; value: MarketplaceSellerProfileModerationItem }
  >();
  private sellerModerationDecision: ModerationDecision | undefined;
  private sellerModerationWrites = 0;
  private readonly pendingListingIdsBySellerRevision = new Map<number, string[]>([
    [1, ['pending-listing-a', 'pending-listing-b']],
    [2, ['pending-listing-other-revision']],
  ]);
  private readonly rejectedPendingListingIds: string[] = [];

  constructor(eligibility: ProjectionEligibility) {
    const visible = eligibility !== 'ineligible';
    const approvedProduct = approvedListings[0];
    if (!approvedProduct) {
      throw new Error('Approved Product fixture is missing.');
    }
    const listingRecords: MarketplacePublishedListingRecord[] =
      eligibility === 'approved-with-pending-edit' ? [{ ...approvedProduct, priceUzs: 4_100_000 }] : approvedListings;
    const repository: MarketplacePublicRepository = {
      findPublishedListing: (publicId) =>
        Promise.resolve(visible ? listingRecords.find((record) => record.publicId === publicId) : undefined),
      findPublishedSeller: (publicId) =>
        Promise.resolve(visible && publicId === approvedSeller.publicId ? approvedSeller : undefined),
      listPublishedListings: (input) => {
        this.catalogQueries.push(structuredClone(input));
        return Promise.resolve(visible ? listingPage(listingRecords, input) : { items: [] });
      },
      isDemoCatalogEnabled: () => Promise.resolve(false),
      listPublishedRequests: () => Promise.resolve({ items: visible ? [approvedRequest] : [] }),
      listPublishedSellerListings: (sellerPublicId, input) =>
        Promise.resolve(
          visible && sellerPublicId === approvedSeller.publicId ? listingPage(listingRecords, input) : { items: [] },
        ),
      listPublishedSuggestions: () =>
        Promise.resolve(
          visible
            ? listingRecords.map((record) => ({
                id: record.publicId,
                kind: 'listing' as const,
                label: record.title,
                section: record.section,
              }))
            : [],
        ),
      listOwnedPublications: () => Promise.resolve({ listings: [], requests: [] }),
      listPendingModeration: () =>
        Promise.resolve({
          listings: [
            {
              content: {
                category: 'seed',
                description: 'Certified seed',
                images: [],
                region: 'Samarkand',
                title: 'Corn F1',
                titleRu: 'Кукуруза F1',
                titleUz: "Makkajo'xori F1",
                titleUzCyrl: 'Маккажўхори F1',
                unit: 't',
              },
              publication: pendingListingPublication,
              seller: {
                contentFingerprint: sellerContentFingerprint,
                contentRevision: 1,
                description: approvedSeller.description,
                displayName: approvedSeller.displayName,
                id: approvedSeller.publicId,
                moderationStatus: 'pending',
                region: approvedSeller.region,
              },
            },
          ],
          requests: [],
          sellerProfiles: [pendingSellerProfile()],
        }),
      publishListing: (owner, idempotencyKey, input) => this.publishListing(owner, idempotencyKey, input),
      publishRequest: () => Promise.resolve({ status: 'invalid_state', field: 'requestId' }),
      reviewListingPublication: (tenantId, publicationId, reviewerUserId, input) =>
        this.reviewListingPublication(tenantId, publicationId, reviewerUserId, input),
      reviewRequestPublication: () => Promise.resolve({ status: 'not_found' }),
      reviewSellerProfile: (tenantId, sellerPublicId, reviewerUserId, input) =>
        this.reviewSellerProfile(tenantId, sellerPublicId, reviewerUserId, input),
    };
    this.service = new MarketplacePublicDomainService(repository);
  }

  async readGuestProjection(): Promise<MarketplacePublicGuestProjection> {
    const [catalog, requests, seller, suggestions] = await Promise.all([
      this.service.listCatalog({ limit: 50 }),
      this.service.listRequests({ limit: 50 }),
      this.service.getSeller(approvedSeller.publicId),
      this.service.listSuggestions('corn', 10),
    ]);
    return { catalog, requests, seller, suggestions };
  }

  publish(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceListingInput,
  ): Promise<MarketplaceListingPublication> {
    return this.service.publishListing(owner, idempotencyKey, input);
  }

  writeCount(): number {
    return this.publicationWrites;
  }

  async exerciseBoundedKeysetDiscovery(): Promise<MarketplacePublicKeysetExercise> {
    const filters = {
      limit: 1,
      maxPriceUzs: 5_000_000,
      minAvailableQuantity: 1,
      minPriceUzs: 1,
      query: '  a  ',
      region: '  Samarkand  ',
      sort: 'newest' as const,
    };
    const firstPage = await this.service.listCatalog(filters);
    if (!firstPage.nextCursor) {
      throw new Error('Expected a next keyset cursor for the bounded first page.');
    }
    const secondPage = await this.service.listCatalog({ ...filters, cursor: firstPage.nextCursor });
    const callsBeforeInvalidCursors = this.catalogQueries.length;
    let malformedCursorError: unknown;
    let extraFieldCursorError: unknown;
    let oversizedCursorError: unknown;
    let sortMismatchError: unknown;
    try {
      await this.service.listCatalog({ ...filters, cursor: `${firstPage.nextCursor}!!!` });
    } catch (error) {
      malformedCursorError = error;
    }
    try {
      const cursorPayload = JSON.parse(Buffer.from(firstPage.nextCursor, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      const extraFieldCursor = Buffer.from(
        JSON.stringify({ ...cursorPayload, tenantId: 'private-tenant-selector' }),
        'utf8',
      ).toString('base64url');
      await this.service.listCatalog({ ...filters, cursor: extraFieldCursor });
    } catch (error) {
      extraFieldCursorError = error;
    }
    try {
      await this.service.listCatalog({ ...filters, cursor: 'x'.repeat(513) });
    } catch (error) {
      oversizedCursorError = error;
    }
    try {
      await this.service.listCatalog({ ...filters, cursor: firstPage.nextCursor, sort: 'price_asc' });
    } catch (error) {
      sortMismatchError = error;
    }
    return {
      callsAfterInvalidCursors: this.catalogQueries.length,
      callsBeforeInvalidCursors,
      extraFieldCursorError,
      firstPage,
      malformedCursorError,
      observedQueries: structuredClone(this.catalogQueries),
      oversizedCursorError,
      secondPage,
      sortMismatchError,
    };
  }

  async exerciseModerationRace(): Promise<MarketplacePublicModerationRace> {
    const queue = await this.service.listPendingModeration('tenant-seller');
    const listingQueueItem = queue.listings[0];
    const sellerQueueItem = queue.sellerProfiles[0];
    if (!listingQueueItem || !sellerQueueItem) {
      throw new Error('Expected listing and seller-profile moderation queue fixtures.');
    }
    if (listingQueueItem.seller.contentFingerprint !== sellerQueueItem.contentFingerprint) {
      throw new Error('Listing and seller-profile queue fingerprints diverged.');
    }
    const publication = listingQueueItem.publication;
    const queuedSellerFingerprint = sellerQueueItem.contentFingerprint;
    const rejectedAttempt = {
      decision: 'rejected' as const,
      idempotencyKey: 'listing-review-rejected',
      reviewerUserId: 'reviewer-a',
    };
    const approvedAttempt = {
      decision: 'approved' as const,
      idempotencyKey: 'listing-review-approved',
      reviewerUserId: 'reviewer-b',
    };
    const [rejectedResult, approvedResult] = await Promise.allSettled([
      this.service.reviewListingPublication('tenant-seller', publication.id, rejectedAttempt.reviewerUserId, {
        decision: rejectedAttempt.decision,
        expectedRevision: 0,
        expectedSellerContentFingerprint: queuedSellerFingerprint,
        expectedSellerContentRevision: 1,
        idempotencyKey: rejectedAttempt.idempotencyKey,
      }),
      this.service.reviewListingPublication('tenant-seller', publication.id, approvedAttempt.reviewerUserId, {
        decision: approvedAttempt.decision,
        expectedRevision: 0,
        expectedSellerContentFingerprint: queuedSellerFingerprint,
        expectedSellerContentRevision: 1,
        idempotencyKey: approvedAttempt.idempotencyKey,
      }),
    ]);
    let winner: { attempt: typeof rejectedAttempt | typeof approvedAttempt; decision: ModerationDecision } | undefined;
    if (rejectedResult.status === 'fulfilled') {
      winner = {
        attempt: rejectedAttempt,
        decision: rejectedResult.value.moderationStatus as ModerationDecision,
      };
    } else if (approvedResult.status === 'fulfilled') {
      winner = {
        attempt: approvedAttempt,
        decision: approvedResult.value.moderationStatus as ModerationDecision,
      };
    }
    if (!winner) {
      throw new Error('Expected one moderation decision to win.');
    }
    const exactReplay = await this.service.reviewListingPublication(
      'tenant-seller',
      publication.id,
      winner.attempt.reviewerUserId,
      {
        decision: winner.decision,
        expectedRevision: 0,
        expectedSellerContentFingerprint: queuedSellerFingerprint,
        expectedSellerContentRevision: 1,
        idempotencyKey: winner.attempt.idempotencyKey,
      },
    );
    let staleOppositeDecision: unknown;
    try {
      await this.service.reviewListingPublication('tenant-seller', publication.id, winner.attempt.reviewerUserId, {
        decision: winner.decision === 'approved' ? 'rejected' : 'approved',
        expectedRevision: 0,
        expectedSellerContentFingerprint: queuedSellerFingerprint,
        expectedSellerContentRevision: 1,
        idempotencyKey: winner.attempt.idempotencyKey,
      });
    } catch (error) {
      staleOppositeDecision = error;
    }
    const sellerDecisionBeforeIndependentReview = this.sellerModerationDecision;
    let staleSellerFingerprintDecision: unknown;
    try {
      await this.service.reviewSellerProfile('tenant-seller', approvedSeller.publicId, 'profile-reviewer', {
        decision: 'approved',
        expectedContentFingerprint: 'b'.repeat(64),
        expectedContentRevision: 1,
        idempotencyKey: 'seller-profile-review-stale-fingerprint',
      });
    } catch (error) {
      staleSellerFingerprintDecision = error;
    }
    const sellerReviewInput = {
      decision: 'approved' as const,
      expectedContentFingerprint: queuedSellerFingerprint,
      expectedContentRevision: 1,
      idempotencyKey: 'seller-profile-review-approved',
    };
    const sellerReview = await this.service.reviewSellerProfile(
      'tenant-seller',
      approvedSeller.publicId,
      'profile-reviewer',
      sellerReviewInput,
    );
    const sellerReplay = await this.service.reviewSellerProfile(
      'tenant-seller',
      approvedSeller.publicId,
      'profile-reviewer',
      sellerReviewInput,
    );
    const listingDecisionAfterSellerReview = this.listingModerationDecision;
    if (!listingDecisionAfterSellerReview) {
      throw new Error('Listing decision disappeared after independent seller-profile review.');
    }
    return {
      completedDecision: winner.decision,
      decisionWrites: this.listingModerationWrites,
      exactReplay: exactReplay.moderationStatus as ModerationDecision,
      listingDecisionAfterSellerReview,
      sellerCompletedDecision: sellerReview.moderationStatus as ModerationDecision,
      sellerContentFingerprint: sellerReview.contentFingerprint,
      sellerDecisionBeforeIndependentReview,
      sellerDecisionWrites: this.sellerModerationWrites,
      sellerExactReplay: sellerReplay.moderationStatus as ModerationDecision,
      staleSellerFingerprintDecision,
      staleOppositeDecision,
    };
  }

  async exerciseSellerRejectionFanout(): Promise<MarketplacePublicSellerRejectionFanout> {
    const before = await this.readGuestProjection();
    const queue = await this.service.listPendingModeration('tenant-seller');
    const queuedSellerFingerprint = queue.sellerProfiles[0]?.contentFingerprint;
    if (!queuedSellerFingerprint) {
      throw new Error('Expected a seller-profile queue fingerprint.');
    }
    await this.service.reviewSellerProfile('tenant-seller', approvedSeller.publicId, 'profile-reviewer', {
      decision: 'rejected',
      expectedContentFingerprint: queuedSellerFingerprint,
      expectedContentRevision: 1,
      idempotencyKey: 'seller-profile-review-rejected',
    });
    const after = await this.readGuestProjection();
    return {
      pendingOtherRevisionIds: [...(this.pendingListingIdsBySellerRevision.get(2) ?? [])],
      rejectedPinnedListingIds: [...this.rejectedPendingListingIds],
      remainingPinnedListingIds: [...(this.pendingListingIdsBySellerRevision.get(1) ?? [])],
      reviewedContentFingerprint: queuedSellerFingerprint,
      sellerAfter: after.seller,
      sellerBefore: before.seller,
      visibleListingIdsAfter: after.catalog.items.map((listing) => listing.id),
      visibleListingIdsBefore: before.catalog.items.map((listing) => listing.id),
    };
  }

  private publishListing(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceListingInput,
  ): Promise<OperationResult<MarketplaceListingPublication>> {
    if (owner.tenantId !== 'tenant-seller' || owner.userId !== 'seller-user') {
      return Promise.resolve({ status: 'forbidden' });
    }
    if (input.sourceId !== '55555555-5555-4555-8555-555555555555') {
      return Promise.resolve({ status: 'not_found' });
    }
    const scope = `${owner.tenantId}:${owner.userId}:${idempotencyKey}`;
    const fingerprint = canonicalInput(input);
    const existing = this.publications.get(scope);
    if (existing) {
      return Promise.resolve(
        existing.fingerprint === fingerprint
          ? { status: 'ok', value: existing.value }
          : { status: 'conflict', field: 'idempotencyKey' },
      );
    }
    const value: MarketplaceListingPublication = {
      id: '66666666-6666-4666-8666-666666666666',
      moderationStatus: 'pending',
      revision: 0,
      section: input.section,
      sellerPublicId: approvedSeller.publicId,
      sourceId: input.sourceId,
      sourceKind: input.sourceKind,
      status: 'published',
      updatedAt: updateTime,
    };
    this.publications.set(scope, { fingerprint, value });
    this.publicationWrites += 1;
    return Promise.resolve({ status: 'ok', value });
  }

  private reviewListingPublication(
    tenantId: string,
    publicationId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceListingPublicationInput,
  ): Promise<OperationResult<MarketplaceListingPublication>> {
    if (tenantId !== 'tenant-seller' || publicationId !== approvedListings[0]?.publicId) {
      return Promise.resolve({ status: 'not_found' });
    }
    const operationKey = `${tenantId}:${reviewerUserId}:${input.idempotencyKey}`;
    const fingerprint = JSON.stringify(input);
    const replay = this.listingModerationOperations.get(operationKey);
    if (replay) {
      return Promise.resolve(
        replay.fingerprint === fingerprint
          ? { status: 'ok', value: replay.value }
          : { status: 'conflict', field: 'idempotencyKey' },
      );
    }
    if (
      input.expectedRevision !== 0 ||
      input.expectedSellerContentRevision !== 1 ||
      input.expectedSellerContentFingerprint !== sellerContentFingerprint ||
      this.listingModerationDecision
    ) {
      return Promise.resolve({ status: 'conflict', field: 'revision' });
    }
    const value: MarketplaceListingPublication = {
      id: publicationId,
      moderationStatus: input.decision,
      ...(input.decision === 'approved' ? { publishedAt: updateTime } : {}),
      revision: 1,
      section: 'seeds',
      sellerPublicId: approvedSeller.publicId,
      sourceId: '55555555-5555-4555-8555-555555555555',
      sourceKind: 'product',
      status: input.decision === 'approved' ? 'published' : 'rejected',
      updatedAt: updateTime,
    };
    this.listingModerationDecision = input.decision;
    this.listingModerationWrites += 1;
    this.listingModerationOperations.set(operationKey, { fingerprint, value });
    return Promise.resolve({ status: 'ok', value });
  }

  private reviewSellerProfile(
    tenantId: string,
    sellerPublicId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceSellerProfileInput,
  ): Promise<OperationResult<MarketplaceSellerProfileModerationItem>> {
    if (tenantId !== 'tenant-seller' || sellerPublicId !== approvedSeller.publicId) {
      return Promise.resolve({ status: 'not_found' });
    }
    const operationKey = `${tenantId}:${reviewerUserId}:${input.idempotencyKey}`;
    const fingerprint = JSON.stringify(input);
    const replay = this.sellerModerationOperations.get(operationKey);
    if (replay) {
      return Promise.resolve(
        replay.fingerprint === fingerprint
          ? { status: 'ok', value: replay.value }
          : { status: 'conflict', field: 'idempotencyKey' },
      );
    }
    if (
      input.expectedContentRevision !== 1 ||
      input.expectedContentFingerprint !== sellerContentFingerprint ||
      this.sellerModerationDecision
    ) {
      return Promise.resolve({ status: 'conflict', field: 'sellerProfile' });
    }
    const value: MarketplaceSellerProfileModerationItem = {
      contentFingerprint: sellerContentFingerprint,
      contentRevision: 1,
      description: approvedSeller.description,
      displayName: approvedSeller.displayName,
      moderationStatus: input.decision,
      region: approvedSeller.region,
      sellerPublicId,
      submittedAt: publicationTime,
    };
    if (input.decision === 'rejected') {
      const pinnedListings = this.pendingListingIdsBySellerRevision.get(input.expectedContentRevision) ?? [];
      this.rejectedPendingListingIds.push(...pinnedListings);
      this.pendingListingIdsBySellerRevision.set(input.expectedContentRevision, []);
    }
    this.sellerModerationDecision = input.decision;
    this.sellerModerationWrites += 1;
    this.sellerModerationOperations.set(operationKey, { fingerprint, value });
    return Promise.resolve({ status: 'ok', value });
  }
}
