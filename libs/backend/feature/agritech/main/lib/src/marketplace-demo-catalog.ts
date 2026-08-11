// @requirements REQ-AGRITECH-DEMO-024
import type {
  MarketplacePublicCatalogQuery,
  MarketplacePublicListing,
  MarketplacePublicSeller,
  MarketplacePublicSuggestion,
} from '@app/backend-feature-agritech-shared';

export const MarketplaceDemoCatalogFlagKey = 'marketplace.demo';

const demoSeller: MarketplacePublicSeller & { description: string } = {
  id: '9d000000-0000-4000-8000-000000000001',
  displayName: 'DehqonHub demo xo\u02bbjaligi',
  description: 'Synthetic preview profile. It cannot receive orders or marketplace reviews.',
  provenance: 'demo',
  region: 'Samarqand',
  verified: false,
};

const base = {
  description: 'Synthetic catalog preview for evaluating the DehqonHub marketplace.',
  images: [] as string[],
  promoted: false,
  provenance: 'demo' as const,
  sampleAvailable: false,
  seller: demoSeller,
  transactional: false,
  unit: 'dona',
};

const demoListings: MarketplacePublicListing[] = [
  {
    ...base,
    availableQuantity: 80,
    category: 'seed',
    id: '9d000000-0000-4000-8000-000000000101',
    kind: 'product',
    priceUzs: 320_000,
    publishedAt: new Date('2026-08-06T09:00:00.000Z'),
    region: 'Samarqand',
    sampleAvailable: true,
    section: 'seeds',
    title: 'Premium cotton seed',
    titleRu:
      '\u0421\u0435\u043c\u0435\u043d\u0430 \u0445\u043b\u043e\u043f\u0447\u0430\u0442\u043d\u0438\u043a\u0430 \u043f\u0440\u0435\u043c\u0438\u0443\u043c-\u043a\u043b\u0430\u0441\u0441\u0430',
    titleUz: 'Sifatli paxta urug\u02bbi',
    titleUzCyrl:
      '\u0421\u0438\u0444\u0430\u0442\u043b\u0438 \u043f\u0430\u0445\u0442\u0430 \u0443\u0440\u0443\u0493\u0438',
    updatedAt: new Date('2026-08-06T09:00:00.000Z'),
  },
  {
    ...base,
    availableQuantity: 14,
    category: 'irrigation',
    id: '9d000000-0000-4000-8000-000000000102',
    kind: 'product',
    priceUzs: 4_850_000,
    publishedAt: new Date('2026-08-05T09:00:00.000Z'),
    region: 'Toshkent',
    section: 'equipment',
    title: 'Drip irrigation kit',
    titleRu:
      '\u041a\u043e\u043c\u043f\u043b\u0435\u043a\u0442 \u043a\u0430\u043f\u0435\u043b\u044c\u043d\u043e\u0433\u043e \u043e\u0440\u043e\u0448\u0435\u043d\u0438\u044f',
    titleUz: 'Tomchilatib sug\u02bborish to\u02bbplami',
    titleUzCyrl:
      '\u0422\u043e\u043c\u0447\u0438\u043b\u0430\u0442\u0438\u0431 \u0441\u0443\u0493\u043e\u0440\u0438\u0448 \u0442\u045e\u043f\u043b\u0430\u043c\u0438',
    updatedAt: new Date('2026-08-05T09:00:00.000Z'),
  },
  {
    ...base,
    availableQuantity: 150,
    category: 'fertilizer',
    id: '9d000000-0000-4000-8000-000000000103',
    kind: 'product',
    priceUzs: 145_000,
    publishedAt: new Date('2026-08-04T09:00:00.000Z'),
    region: 'Buxoro',
    section: 'seeds',
    title: 'Organic soil fertilizer',
    titleRu:
      '\u041e\u0440\u0433\u0430\u043d\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u0443\u0434\u043e\u0431\u0440\u0435\u043d\u0438\u0435',
    titleUz: 'Organik tuproq o\u02bbg\u02bbiti',
    titleUzCyrl:
      '\u041e\u0440\u0433\u0430\u043d\u0438\u043a \u0442\u0443\u043f\u0440\u043e\u049b \u045e\u0493\u0438\u0442\u0438',
    updatedAt: new Date('2026-08-04T09:00:00.000Z'),
  },
  {
    ...base,
    availableQuantity: 2_400,
    crop: 'Tomato',
    grade: 'A',
    id: '9d000000-0000-4000-8000-000000000104',
    kind: 'produce',
    priceUzs: 18_000,
    publishedAt: new Date('2026-08-03T09:00:00.000Z'),
    region: 'Farg\u02bbona',
    sampleAvailable: true,
    section: 'produce',
    title: 'Grade A tomatoes',
    titleRu: '\u0422\u043e\u043c\u0430\u0442\u044b \u0441\u043e\u0440\u0442\u0430 A',
    titleUz: 'A navli pomidor',
    titleUzCyrl: 'A \u043d\u0430\u0432\u043b\u0438 \u043f\u043e\u043c\u0438\u0434\u043e\u0440',
    unit: 'kg',
    updatedAt: new Date('2026-08-03T09:00:00.000Z'),
  },
  {
    ...base,
    availableQuantity: 5_200,
    crop: 'Apple',
    grade: 'A',
    id: '9d000000-0000-4000-8000-000000000105',
    kind: 'produce',
    priceUzs: 16_500,
    publishedAt: new Date('2026-08-02T09:00:00.000Z'),
    region: 'Namangan',
    section: 'produce',
    title: 'Fresh orchard apples',
    titleRu:
      '\u0421\u0432\u0435\u0436\u0438\u0435 \u0441\u0430\u0434\u043e\u0432\u044b\u0435 \u044f\u0431\u043b\u043e\u043a\u0438',
    titleUz: 'Yangi bog\u02bb olmasi',
    titleUzCyrl: '\u042f\u043d\u0433\u0438 \u0431\u043e\u0493 \u043e\u043b\u043c\u0430\u0441\u0438',
    unit: 'kg',
    updatedAt: new Date('2026-08-02T09:00:00.000Z'),
  },
  {
    ...base,
    availableQuantity: 3,
    category: 'equipment',
    id: '9d000000-0000-4000-8000-000000000106',
    kind: 'product',
    priceUzs: 72_000_000,
    publishedAt: new Date('2026-08-01T09:00:00.000Z'),
    region: 'Qashqadaryo',
    section: 'equipment',
    title: 'Precision seed drill',
    titleRu:
      '\u0421\u0435\u044f\u043b\u043a\u0430 \u0442\u043e\u0447\u043d\u043e\u0433\u043e \u0432\u044b\u0441\u0435\u0432\u0430',
    titleUz: 'Aniq urug\u02bb ekish seyalkasi',
    titleUzCyrl:
      '\u0410\u043d\u0438\u049b \u0443\u0440\u0443\u0493 \u044d\u043a\u0438\u0448 \u0441\u0435\u044f\u043b\u043a\u0430\u0441\u0438',
    updatedAt: new Date('2026-08-01T09:00:00.000Z'),
  },
];

const searchableText = (listing: MarketplacePublicListing): string =>
  [
    listing.title,
    listing.titleRu,
    listing.titleUz,
    listing.titleUzCyrl,
    listing.seller.displayName,
    listing.kind === 'produce' ? listing.crop : listing.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

export const listMarketplaceDemoListings = (query: MarketplacePublicCatalogQuery): MarketplacePublicListing[] => {
  const needle = query.query?.toLocaleLowerCase();
  const items = demoListings.filter(
    (listing) =>
      (!needle || searchableText(listing).includes(needle)) &&
      (!query.region || listing.region === query.region) &&
      (!query.section || listing.section === query.section) &&
      (!query.category || (listing.kind === 'product' && listing.category === query.category)) &&
      (!query.crop ||
        (listing.kind === 'produce' && listing.crop.toLocaleLowerCase() === query.crop.toLocaleLowerCase())) &&
      (query.minPriceUzs === undefined || listing.priceUzs >= query.minPriceUzs) &&
      (query.maxPriceUzs === undefined || listing.priceUzs <= query.maxPriceUzs) &&
      (query.minAvailableQuantity === undefined || listing.availableQuantity >= query.minAvailableQuantity) &&
      (query.sampleAvailable === undefined || listing.sampleAvailable === query.sampleAvailable),
  );
  return [...items]
    .sort((left, right) => {
      if (query.sort === 'price_asc') {
        return left.priceUzs - right.priceUzs;
      }
      if (query.sort === 'price_desc') {
        return right.priceUzs - left.priceUzs;
      }
      return right.publishedAt.valueOf() - left.publishedAt.valueOf();
    })
    .slice(0, query.limit);
};

export const findMarketplaceDemoListing = (id: string): MarketplacePublicListing | undefined =>
  demoListings.find((listing) => listing.id === id);

export const findMarketplaceDemoSeller = (
  id: string,
): (MarketplacePublicSeller & { description: string }) | undefined => (id === demoSeller.id ? demoSeller : undefined);

export const listMarketplaceDemoSellerListings = (
  sellerId: string,
  query: MarketplacePublicCatalogQuery,
): MarketplacePublicListing[] => (sellerId === demoSeller.id ? listMarketplaceDemoListings(query) : []);

export const listMarketplaceDemoSuggestions = (query: string, limit: number): MarketplacePublicSuggestion[] => {
  const needle = query.toLocaleLowerCase();
  const listings: MarketplacePublicSuggestion[] = demoListings
    .filter((listing) => searchableText(listing).includes(needle))
    .map((listing) => ({ id: listing.id, kind: 'listing', label: listing.title, section: listing.section }));
  if (demoSeller.displayName.toLocaleLowerCase().includes(needle)) {
    listings.unshift({ id: demoSeller.id, kind: 'seller', label: demoSeller.displayName });
  }
  return listings.slice(0, limit);
};
