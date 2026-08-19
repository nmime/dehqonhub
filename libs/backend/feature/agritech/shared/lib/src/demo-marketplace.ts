import { marketplaceReviewAverageRating } from './marketplace-engagement';
import type { MarketplaceReviewPage, MarketplaceReviewView } from './marketplace-engagement';
import type { BuyerRequest } from './marketplace.types';

/**
 * Demo marketplace activity, served by the API alongside the demo catalog.
 *
 * A tenant with no buyer requests renders an empty reverse-auction feed, and a
 * product with no reviews renders an empty ratings block — both surfaces then
 * look broken rather than new. These fixtures stand in for that tenant so the
 * feed and the ratings can be read end to end, and they are delivered through
 * the same `marketplace/requests` and public-catalog review reads as real
 * activity.
 *
 * They are never mixed into live tenant data: each read reaches for them only
 * when the tenant's own rows come back empty. Free text stays single-language on
 * purpose — it stands in for what a buyer or a farmer typed, not for app copy.
 *
 * Identifiers are v4-shaped because the marketplace routes parse ids as UUIDs.
 * The `dec0de01`/`dec0de02` prefixes mark demo content. Ratings are keyed by the
 * `9d000000-…-0000000001NN` **publication** ids the demo catalog publishes, which
 * is what `marketplace/public/catalog/:listingPublicationId/reviews` is addressed
 * by; keying them by private product id — as they were — pointed the fixture at
 * ids that never reach this read, so the demo ratings could not be fetched at all
 * and every demo product answered the ratings request with a 404.
 */

/** Fixed timestamps keep the dataset deterministic across requests and tests. */
const createdAt = new Date('2026-03-02T08:00:00.000Z');
const updatedAt = new Date('2026-07-28T08:00:00.000Z');

const demoId = (group: '01' | '02', index: number): string =>
  `dec0de${group}-0000-4000-8000-${String(index).padStart(12, '0')}`;

/** Reverse-auction feed entries, one per request state worth showing. */
export const DemoBuyerRequests: readonly BuyerRequest[] = [
  {
    budgetUzs: 96_000_000,
    buyerPartnerId: 'demo-buyer-partner-1',
    buyerUserId: 'demo-buyer-1',
    createdAt,
    deadline: '2026-09-15',
    id: demoId('01', 1),
    product: 'Виноград столовый',
    region: 'Samarqand',
    requirements: 'Калибр 22+, охлаждённая доставка, партия одним рейсом.',
    status: 'open',
    tenantId: 'demo-tenant',
    title: 'Нужен столовый виноград, 8 т к сентябрю',
    updatedAt,
    volume: '8 т',
  },
  {
    budgetUzs: 34_000_000,
    buyerPartnerId: 'demo-buyer-partner-2',
    buyerUserId: 'demo-buyer-2',
    createdAt,
    deadline: '2026-08-30',
    id: demoId('01', 2),
    product: 'Лук репчатый',
    region: 'Xorazm',
    requirements: 'Калибр 60+, сетка 25 кг, отгрузка со склада продавца.',
    status: 'offering',
    tenantId: 'demo-tenant',
    title: 'Закупаем лук репчатый, 12 т',
    updatedAt,
    volume: '12 т',
  },
  {
    budgetUzs: 18_500_000,
    buyerPartnerId: 'demo-buyer-partner-1',
    buyerUserId: 'demo-buyer-1',
    createdAt,
    deadline: '2026-10-01',
    id: demoId('01', 3),
    product: 'Семена озимой пшеницы',
    region: "Farg'ona",
    requirements: 'Первая репродукция, сертификат обязателен.',
    status: 'open',
    tenantId: 'demo-tenant',
    title: 'Семена озимой пшеницы, 60 мешков',
    updatedAt,
    volume: '60 мешков',
  },
];

/**
 * Demo ratings, keyed by the publication a visitor is looking at. Free text is
 * what a farmer typed, so it stays single-language; every row is marked as a
 * verified deal because only a settled contract can produce a review here. Two of
 * the six demo listings are deliberately left unrated, so the empty ratings block
 * is reachable in the preview instead of only in a test.
 */
const demoRatedListingIds = {
  cottonSeed: '9d000000-0000-4000-8000-000000000101',
  dripIrrigationKit: '9d000000-0000-4000-8000-000000000102',
  tomatoes: '9d000000-0000-4000-8000-000000000104',
  seedDrill: '9d000000-0000-4000-8000-000000000106',
} as const;

/** Every publication id a demo rating is filed under. */
export const DemoRatedListingPublicationIds: readonly string[] = Object.values(demoRatedListingIds);

const demoReviews: readonly MarketplaceReviewView[] = [
  {
    assetReferences: [],
    comment: 'Всхожесть совпала с заявленной, посеяли 12 га — вышло ровно.',
    createdAt: new Date('2026-05-18T09:12:00.000Z'),
    id: demoId('02', 1),
    listingPublicationId: demoRatedListingIds.cottonSeed,
    rating: 5,
    revision: 1,
    updatedAt: new Date('2026-05-18T09:12:00.000Z'),
    verifiedDeal: true,
  },
  {
    assetReferences: [],
    comment: 'Партия пришла на четыре дня позже срока, в остальном без нареканий.',
    createdAt: new Date('2026-06-02T14:40:00.000Z'),
    id: demoId('02', 2),
    listingPublicationId: demoRatedListingIds.cottonSeed,
    rating: 4,
    revision: 1,
    updatedAt: new Date('2026-06-02T14:40:00.000Z'),
    verifiedDeal: true,
  },
  {
    assetReferences: [],
    comment: 'Брали второй раз на следующий сезон, качество то же.',
    createdAt: new Date('2026-07-11T07:25:00.000Z'),
    id: demoId('02', 3),
    listingPublicationId: demoRatedListingIds.cottonSeed,
    rating: 5,
    revision: 1,
    updatedAt: new Date('2026-07-11T07:25:00.000Z'),
    verifiedDeal: true,
  },
  {
    assetReferences: [],
    comment: 'Фильтростанция в комплекте, монтаж занял один день. Расход воды упал заметно.',
    createdAt: new Date('2026-04-21T11:05:00.000Z'),
    id: demoId('02', 4),
    listingPublicationId: demoRatedListingIds.dripIrrigationKit,
    rating: 5,
    revision: 1,
    updatedAt: new Date('2026-04-21T11:05:00.000Z'),
    verifiedDeal: true,
  },
  {
    assetReferences: [],
    comment: 'Капельницы работают, но инструкция только на английском.',
    createdAt: new Date('2026-06-19T16:30:00.000Z'),
    id: demoId('02', 5),
    listingPublicationId: demoRatedListingIds.dripIrrigationKit,
    rating: 4,
    revision: 1,
    updatedAt: new Date('2026-06-19T16:30:00.000Z'),
    verifiedDeal: true,
  },
  {
    assetReferences: [],
    comment: 'Калибр ровный, довезли без боя.',
    createdAt: new Date('2026-07-02T06:50:00.000Z'),
    id: demoId('02', 6),
    listingPublicationId: demoRatedListingIds.tomatoes,
    rating: 5,
    revision: 1,
    updatedAt: new Date('2026-07-02T06:50:00.000Z'),
    verifiedDeal: true,
  },
  {
    assetReferences: [],
    comment: 'Два ящика из двадцати пришли перезревшими.',
    createdAt: new Date('2026-07-24T13:15:00.000Z'),
    id: demoId('02', 7),
    listingPublicationId: demoRatedListingIds.tomatoes,
    rating: 3,
    revision: 1,
    updatedAt: new Date('2026-07-24T13:15:00.000Z'),
    verifiedDeal: true,
  },
  {
    assetReferences: [],
    comment: 'Сеялка настраивается быстро, шланги бы покрепче.',
    createdAt: new Date('2026-05-05T08:40:00.000Z'),
    id: demoId('02', 8),
    listingPublicationId: demoRatedListingIds.seedDrill,
    rating: 4,
    revision: 1,
    updatedAt: new Date('2026-05-05T08:40:00.000Z'),
    verifiedDeal: true,
  },
];

/**
 * Demo ratings for one publication, newest first, or nothing when it has none.
 * The order mirrors `PostgresMarketplaceEngagementRepository.listPublicReviews`,
 * which reads `created_at desc`, so the demo block and a live block cannot
 * disagree about which review a visitor reads first.
 */
export const demoProductReviews = (listingPublicationId: string): MarketplaceReviewView[] =>
  demoReviews
    .filter((review) => review.listingPublicationId === listingPublicationId)
    .sort((left, right) => right.createdAt.valueOf() - left.createdAt.valueOf());

/**
 * The demo ratings block for one publication, aggregate included, or nothing
 * when the publication has no demo ratings to show. The aggregate is derived
 * rather than stored so it can never drift from the rows beside it.
 */
export function demoReviewPage(listingPublicationId: string): MarketplaceReviewPage | undefined {
  const items = demoProductReviews(listingPublicationId);
  if (items.length === 0) {
    return undefined;
  }
  const total = items.reduce((sum, review) => sum + review.rating, 0);
  return {
    aggregate: {
      averageRating: marketplaceReviewAverageRating(total, items.length),
      listingPublicationId,
      reviewCount: items.length,
      revision: 1,
    },
    items,
  };
}

/** Mirrors the repository's status filter so demo and live feeds read alike. */
export function filterDemoBuyerRequests(status?: string): BuyerRequest[] {
  if (!status || status === 'all') {
    return [...DemoBuyerRequests];
  }
  return DemoBuyerRequests.filter((request) => request.status === status);
}
