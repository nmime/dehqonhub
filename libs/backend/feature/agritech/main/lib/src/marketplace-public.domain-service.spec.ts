// @requirements REQ-AGRITECH-PUBLIC-018
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketplacePublicRepository,
  MarketplacePublishedListingRecord,
  MarketplacePublishedRequestRecord,
  MarketplacePublishedSellerRecord,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePublicDomainService } from './marketplace-public.domain-service';

const productRecord: MarketplacePublishedListingRecord = {
  availableQuantity: 20,
  description: 'Certified seed',
  images: ['https://cdn.example.test/seed.webp'],
  priceUzs: 4_200_000,
  productCategory: 'seed',
  promoted: false,
  sampleAvailable: false,
  publicId: '11111111-1111-4111-8111-111111111111',
  publishedAt: new Date('2030-01-01T00:00:00.000Z'),
  region: 'Samarkand',
  section: 'seeds',
  sellerDisplayName: 'Zarafshon Agro',
  sellerPublicId: '33333333-3333-4333-8333-333333333333',
  sellerRegion: 'Samarkand',
  sourceKind: 'product',
  title: 'Corn F1',
  titleRu: 'Кукуруза F1',
  titleUz: "Makkajo'xori F1",
  titleUzCyrl: 'Маккажўхори F1',
  unit: 't',
  updatedAt: new Date('2030-01-02T00:00:00.000Z'),
};

const sellerRecord: MarketplacePublishedSellerRecord = {
  description: 'Verified seed supplier',
  displayName: 'Zarafshon Agro',
  publicId: '33333333-3333-4333-8333-333333333333',
  region: 'Samarkand',
  verified: true,
};

const requestRecord: MarketplacePublishedRequestRecord = {
  budgetUzs: 45_000_000,
  buyerDisplayName: 'Bahor Farm',
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  deadline: '2030-01-20',
  product: 'Corn F1',
  publicId: '66666666-6666-4666-8666-666666666666',
  region: 'Samarkand',
  requirements: 'Certified',
  title: 'Corn seeds, 10 tons',
  updatedAt: new Date('2030-01-02T00:00:00.000Z'),
  volume: '10 t',
};

const listingPublication = {
  id: productRecord.publicId,
  moderationStatus: 'pending' as const,
  publishedAt: productRecord.publishedAt,
  revision: 0,
  section: 'seeds' as const,
  sellerPublicId: productRecord.sellerPublicId,
  sourceId: '44444444-4444-4444-8444-444444444444',
  sourceKind: 'product' as const,
  status: 'published' as const,
  updatedAt: productRecord.updatedAt,
};

const repository = (): MarketplacePublicRepository => ({
  findPublishedListing: vi.fn(() => Promise.resolve(productRecord)),
  findPublishedSeller: vi.fn(() => Promise.resolve(sellerRecord)),
  listPublishedListings: vi.fn(() =>
    Promise.resolve({
      items: [productRecord],
      nextCursor: {
        id: productRecord.publicId,
        kind: 'catalog' as const,
        promoted: productRecord.promoted,
        publishedAt: productRecord.publishedAt.toISOString(),
        sort: 'newest' as const,
      },
    }),
  ),
  listPublishedRequests: vi.fn(() => Promise.resolve({ items: [requestRecord] })),
  listPublishedSellerListings: vi.fn(() => Promise.resolve({ items: [productRecord] })),
  listPublishedSuggestions: vi.fn(() =>
    Promise.resolve([
      {
        id: productRecord.publicId,
        kind: 'listing' as const,
        label: productRecord.title,
        section: productRecord.section,
      },
    ]),
  ),
  listPendingModeration: vi.fn(() => Promise.resolve({ listings: [], requests: [], sellerProfiles: [] })),
  listOwnedPublications: vi.fn(() =>
    Promise.resolve({
      listings: [
        {
          id: listingPublication.id,
          kind: 'listing' as const,
          moderationStatus: listingPublication.moderationStatus,
          revision: listingPublication.revision,
          section: listingPublication.section,
          sellerPublicId: listingPublication.sellerPublicId,
          sourceKind: listingPublication.sourceKind,
          status: listingPublication.status,
          title: productRecord.title,
          updatedAt: listingPublication.updatedAt,
        },
      ],
      requests: [],
    }),
  ),
  publishListing: vi.fn(() => Promise.resolve({ status: 'ok' as const, value: listingPublication })),
  publishRequest: vi.fn(() =>
    Promise.resolve({
      status: 'ok' as const,
      value: {
        id: requestRecord.publicId,
        moderationStatus: 'pending' as const,
        publishedAt: requestRecord.createdAt,
        requestId: requestRecord.publicId,
        revision: 0,
        status: 'published' as const,
        updatedAt: requestRecord.updatedAt,
      },
    }),
  ),
  reviewListingPublication: vi.fn(() => Promise.resolve({ status: 'ok' as const, value: listingPublication })),
  reviewSellerProfile: vi.fn(() =>
    Promise.resolve({
      status: 'ok' as const,
      value: {
        contentFingerprint: 'a'.repeat(64),
        contentRevision: 1,
        displayName: 'Zarafshon Agro',
        moderationStatus: 'approved' as const,
        region: 'Samarkand',
        sellerPublicId: productRecord.sellerPublicId,
        submittedAt: productRecord.publishedAt,
      },
    }),
  ),
  reviewRequestPublication: vi.fn(() =>
    Promise.resolve({
      status: 'ok' as const,
      value: {
        id: requestRecord.publicId,
        moderationStatus: 'approved' as const,
        publishedAt: requestRecord.createdAt,
        requestId: requestRecord.publicId,
        revision: 1,
        status: 'published' as const,
        updatedAt: requestRecord.updatedAt,
      },
    }),
  ),
});

describe('MarketplacePublicDomainService', () => {
  it('maps catalog records through an explicit anonymous allowlist', async () => {
    const service = new MarketplacePublicDomainService(repository());

    const page = await service.listCatalog({ limit: 500, query: '  corn  ', section: 'seeds' });

    expect(page).toEqual({
      items: [
        {
          availableQuantity: 20,
          category: 'seed',
          description: 'Certified seed',
          id: productRecord.publicId,
          images: productRecord.images,
          kind: 'product',
          priceUzs: 4_200_000,
          promoted: false,
          publishedAt: productRecord.publishedAt,
          region: 'Samarkand',
          sampleAvailable: false,
          section: 'seeds',
          seller: {
            displayName: 'Zarafshon Agro',
            id: productRecord.sellerPublicId,
            region: 'Samarkand',
            verified: true,
          },
          title: 'Corn F1',
          titleRu: 'Кукуруза F1',
          titleUz: "Makkajo'xori F1",
          titleUzCyrl: 'Маккажўхори F1',
          unit: 't',
          updatedAt: productRecord.updatedAt,
        },
      ],
      nextCursor: Buffer.from(
        JSON.stringify({
          id: productRecord.publicId,
          kind: 'catalog',
          promoted: false,
          publishedAt: productRecord.publishedAt.toISOString(),
          sort: 'newest',
        }),
        'utf8',
      ).toString('base64url'),
    });
    const serialized = JSON.stringify(page);
    for (const forbidden of ['tenantId', 'ownerUserId', 'partnerId', 'sourceId', 'taxId']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('maps seller and public request records without party identifiers', async () => {
    const service = new MarketplacePublicDomainService(repository());

    const [seller, requests] = await Promise.all([
      service.getSeller(sellerRecord.publicId),
      service.listRequests({ region: ' Samarkand ' }),
    ]);

    expect(seller).toEqual({
      description: 'Verified seed supplier',
      displayName: 'Zarafshon Agro',
      id: sellerRecord.publicId,
      region: 'Samarkand',
      verified: true,
    });
    expect(requests.items).toEqual([
      {
        budgetUzs: 45_000_000,
        buyerDisplayName: 'Bahor Farm',
        createdAt: requestRecord.createdAt,
        deadline: '2030-01-20',
        id: requestRecord.publicId,
        product: 'Corn F1',
        region: 'Samarkand',
        requirements: 'Certified',
        title: 'Corn seeds, 10 tons',
        updatedAt: requestRecord.updatedAt,
        volume: '10 t',
      },
    ]);
    expect(JSON.stringify({ requests, seller })).not.toMatch(/tenantId|userId|partnerId|legalName|taxId/u);
  });

  it('rejects malformed source/section combinations instead of guessing Produce', async () => {
    const invalid = { ...productRecord, section: 'produce' as const };
    const repo = repository();
    vi.mocked(repo.findPublishedListing).mockResolvedValue(invalid);
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.getListing(invalid.publicId)).rejects.toThrow('Invalid published product projection.');
  });

  it('allowlists search suggestions and drops private source fields', async () => {
    const service = new MarketplacePublicDomainService(repository());

    const suggestions = await service.listSuggestions(' corn ', 100);

    expect(suggestions).toEqual([
      {
        id: productRecord.publicId,
        kind: 'listing',
        label: productRecord.title,
        section: 'seeds',
      },
    ]);
    expect(JSON.stringify(suggestions)).not.toMatch(/tenantId|sourceId/u);
  });

  it('rejects malformed opaque cursors before reaching persistence', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listCatalog({ cursor: 'not-a-keyset-cursor' })).rejects.toBeInstanceOf(Error);
    expect(repo.listPublishedListings).not.toHaveBeenCalled();
  });

  it('binds keyset cursors to the requested sort and validates bounded filters', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);
    const cursor = Buffer.from(
      JSON.stringify({
        id: productRecord.publicId,
        kind: 'catalog',
        priceUzs: 4_200_000,
        sort: 'price_asc',
      }),
      'utf8',
    ).toString('base64url');

    await service.listCatalog({
      category: 'seed',
      cursor,
      maxPriceUzs: 5_000_000,
      minAvailableQuantity: 10,
      minPriceUzs: 4_000_000,
      section: 'seeds',
      sort: 'price_asc',
    });

    expect(repo.listPublishedListings).toHaveBeenCalledWith({
      category: 'seed',
      cursor: {
        id: productRecord.publicId,
        kind: 'catalog',
        priceUzs: 4_200_000,
        sort: 'price_asc',
      },
      limit: 20,
      maxPriceUzs: 5_000_000,
      minAvailableQuantity: 10,
      minPriceUzs: 4_000_000,
      section: 'seeds',
      sort: 'price_asc',
    });
    await expect(service.listCatalog({ cursor, sort: 'price_desc' })).rejects.toBeInstanceOf(Error);
    await expect(service.listCatalog({ maxPriceUzs: 2, minPriceUzs: 3 })).rejects.toBeInstanceOf(Error);
    await expect(service.listCatalog({ crop: 'corn', section: 'seeds' })).rejects.toBeInstanceOf(Error);
  });

  it('bounds and scopes authenticated publication status reads', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);
    const owner = { tenantId: 'seller-tenant', userId: 'seller-user' };

    await expect(service.listOwnedPublications(owner, 500)).resolves.toEqual({
      listings: [
        {
          id: listingPublication.id,
          kind: 'listing',
          moderationStatus: listingPublication.moderationStatus,
          revision: listingPublication.revision,
          section: listingPublication.section,
          sellerPublicId: listingPublication.sellerPublicId,
          sourceKind: listingPublication.sourceKind,
          status: listingPublication.status,
          title: productRecord.title,
          updatedAt: listingPublication.updatedAt,
        },
      ],
      requests: [],
    });
    expect(repo.listOwnedPublications).toHaveBeenCalledWith(owner, 50);
  });

  it('delegates authenticated publication commands and preserves typed conflicts', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);
    const owner = { tenantId: 'seller-tenant', userId: 'seller-user' };
    const input = {
      section: 'seeds' as const,
      sellerPartnerId: '22222222-2222-4222-8222-222222222222',
      sellerDisplayName: 'Zarafshon Agro',
      sourceId: '44444444-4444-4444-8444-444444444444',
      sourceKind: 'product' as const,
    };

    await expect(service.publishListing(owner, 'publish-listing-1', input)).resolves.toEqual(listingPublication);
    expect(repo.publishListing).toHaveBeenCalledWith(owner, 'publish-listing-1', input);

    vi.mocked(repo.publishListing).mockResolvedValueOnce({ status: 'conflict', field: 'idempotencyKey' });
    await expect(service.publishListing(owner, 'publish-listing-1', input)).rejects.toBeInstanceOf(Error);
  });
});
