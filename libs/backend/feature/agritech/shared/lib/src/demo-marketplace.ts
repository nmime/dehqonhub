import type { BuyerRequest, Review } from './marketplace.types';

/**
 * Demo marketplace activity, served by the API alongside the demo catalog.
 *
 * A tenant with no buyer requests renders an empty reverse-auction feed, and a
 * product with no reviews renders an empty ratings block — both surfaces then
 * look broken rather than new. These fixtures stand in for that tenant so the
 * feed and the ratings can be read end to end, and they are delivered through
 * the same `marketplace/requests` and `marketplace/reviews/:productId` reads as
 * real activity.
 *
 * They are never mixed into live tenant data: each read reaches for them only
 * when the tenant's own rows come back empty. Free text stays single-language on
 * purpose — it stands in for what a buyer or a farmer typed, not for app copy.
 *
 * Identifiers are v4-shaped because the marketplace routes parse ids as UUIDs.
 * The `dec0de01`/`dec0de02` prefixes mark demo content, matching the `dec0de00`
 * product ids the demo catalog uses; the review rows point at the first demo
 * product (`…000000000001`) and the drip-irrigation kit (`…000000000011`).
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

const demoReviews: readonly Review[] = [
  {
    comment: 'Всхожесть совпала с заявленной, посеяли 12 га — вышло ровно.',
    createdAt: new Date('2026-05-18T09:12:00.000Z'),
    id: demoId('02', 1),
    productId: 'dec0de00-0000-4000-8000-000000000001',
    rating: 5,
    tenantId: 'demo-tenant',
    userId: 'demo-farmer-7',
  },
  {
    comment: 'Партия пришла на четыре дня позже срока, в остальном без нареканий.',
    createdAt: new Date('2026-06-02T14:40:00.000Z'),
    id: demoId('02', 2),
    productId: 'dec0de00-0000-4000-8000-000000000001',
    rating: 4,
    tenantId: 'demo-tenant',
    userId: 'demo-farmer-11',
  },
  {
    comment: 'Фильтростанция в комплекте, монтаж заняли один день. Расход воды упал заметно.',
    createdAt: new Date('2026-04-21T11:05:00.000Z'),
    id: demoId('02', 3),
    productId: 'dec0de00-0000-4000-8000-000000000011',
    rating: 5,
    tenantId: 'demo-tenant',
    userId: 'demo-farmer-3',
  },
];

/** Demo ratings for one product, or nothing when that product has none. */
export const demoProductReviews = (productId: string): Review[] =>
  demoReviews.filter((review) => review.productId === productId);

/** Mirrors the repository's status filter so demo and live feeds read alike. */
export function filterDemoBuyerRequests(status?: string): BuyerRequest[] {
  if (!status || status === 'all') {
    return [...DemoBuyerRequests];
  }
  return DemoBuyerRequests.filter((request) => request.status === status);
}
