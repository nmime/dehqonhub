// @requirements REQ-AGRITECH-PUBLIC-018
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
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

const encode = (payload: unknown): string => Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
const publishedAt = productRecord.publishedAt.toISOString();

describe('MarketplacePublicDomainService opaque cursors', () => {
  it.each([
    ['an empty cursor', ''],
    ['a cursor beyond the accepted length', 'a'.repeat(513)],
    ['a padded cursor', ' YWJj'],
    ['a cursor outside the base64url alphabet', 'not*a*cursor'],
    ['a cursor that is not canonically encoded', 'QR'],
    ['a cursor that is not JSON', Buffer.from('not json', 'utf8').toString('base64url')],
    ['a cursor holding an array', encode([1, 2])],
    ['a cursor holding a scalar', encode('catalog')],
    ['a cursor for another page kind', encode({ id: productRecord.publicId, kind: 'request', sort: 'newest' })],
    ['a cursor for another sort', encode({ id: productRecord.publicId, kind: 'catalog', sort: 'price_asc' })],
    ['a cursor without a listing UUID', encode({ id: 'listing-1', kind: 'catalog', sort: 'newest' })],
    [
      'a newest cursor missing a key',
      encode({ id: productRecord.publicId, kind: 'catalog', publishedAt, sort: 'newest' }),
    ],
    [
      'a newest cursor whose promotion flag is not boolean',
      encode({ id: productRecord.publicId, kind: 'catalog', promoted: 'yes', publishedAt, sort: 'newest' }),
    ],
    [
      'a newest cursor whose timestamp is not canonical',
      encode({
        id: productRecord.publicId,
        kind: 'catalog',
        promoted: false,
        publishedAt: '2030-01-01',
        sort: 'newest',
      }),
    ],
    [
      'a newest cursor whose timestamp is not a string',
      encode({ id: productRecord.publicId, kind: 'catalog', promoted: false, publishedAt: 1, sort: 'newest' }),
    ],
    [
      'a newest cursor whose timestamp is unparseable',
      encode({
        id: productRecord.publicId,
        kind: 'catalog',
        promoted: false,
        publishedAt: 'not-a-timestamp',
        sort: 'newest',
      }),
    ],
  ])('refuses %s before reaching persistence', async (_label, cursor) => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listCatalog({ cursor })).rejects.toBeInstanceOf(Error);
    expect(repo.listPublishedListings).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a price cursor carrying an extra key',
      { extra: 1, id: productRecord.publicId, kind: 'catalog', priceUzs: 1, sort: 'price_asc' },
    ],
    ['a fractional price cursor', { id: productRecord.publicId, kind: 'catalog', priceUzs: 1.5, sort: 'price_asc' }],
    ['a negative price cursor', { id: productRecord.publicId, kind: 'catalog', priceUzs: -1, sort: 'price_asc' }],
    [
      'a price cursor above the accepted amount',
      { id: productRecord.publicId, kind: 'catalog', priceUzs: 10_000_000_000_000, sort: 'price_asc' },
    ],
  ])('refuses %s', async (_label, payload) => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listCatalog({ cursor: encode(payload), sort: 'price_asc' })).rejects.toBeInstanceOf(Error);
    expect(repo.listPublishedListings).not.toHaveBeenCalled();
  });

  it.each([
    ['another page kind', { id: productRecord.publicId, kind: 'catalog', publishedAt }],
    ['an extra key', { extra: 1, id: productRecord.publicId, kind: 'request', publishedAt }],
    ['a non-UUID id', { id: 'request-1', kind: 'request', publishedAt }],
    ['a non-canonical timestamp', { id: productRecord.publicId, kind: 'request', publishedAt: '2030-01-01' }],
  ])('refuses a request cursor carrying %s', async (_label, payload) => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listRequests({ cursor: encode(payload) })).rejects.toBeInstanceOf(Error);
    expect(repo.listPublishedRequests).not.toHaveBeenCalled();
  });

  it('accepts a well-formed request cursor and a newest catalog cursor', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await service.listRequests({
      cursor: encode({ id: productRecord.publicId, kind: 'request', publishedAt }),
      limit: 5,
      query: ' corn ',
    });
    await service.listCatalog({
      cursor: encode({ id: productRecord.publicId, kind: 'catalog', promoted: true, publishedAt, sort: 'newest' }),
    });

    expect(repo.listPublishedRequests).toHaveBeenCalledWith({
      cursor: { id: productRecord.publicId, kind: 'request', publishedAt },
      limit: 5,
      query: 'corn',
    });
    expect(repo.listPublishedListings).toHaveBeenCalledWith({
      cursor: { id: productRecord.publicId, kind: 'catalog', promoted: true, publishedAt, sort: 'newest' },
      limit: 20,
      sort: 'newest',
    });
  });

  it.each([
    ['a fractional minimum price', { minPriceUzs: 1.5 }],
    ['a minimum price below zero', { minPriceUzs: -1 }],
    ['a maximum price above the accepted amount', { maxPriceUzs: 10_000_000_000_000 }],
    ['a zero minimum quantity', { minAvailableQuantity: 0 }],
    ['a category combined with a crop', { category: 'seed' as const, crop: 'corn', section: 'produce' as const }],
    ['a category inside the produce section', { category: 'seed' as const, section: 'produce' as const }],
  ])('refuses %s', async (_label, input) => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listCatalog(input)).rejects.toBeInstanceOf(Error);
    expect(repo.listPublishedListings).not.toHaveBeenCalled();
  });

  it.each([
    [0, 1],
    [-5, 1],
    [1.5, 20],
    [50, 50],
  ])('clamps a page size of %p to %p', async (limit, expected) => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await service.listCatalog({ crop: ' corn ', limit, sampleAvailable: true, section: 'produce' });

    expect(repo.listPublishedListings).toHaveBeenCalledWith({
      crop: 'corn',
      limit: expected,
      sampleAvailable: true,
      section: 'produce',
      sort: 'newest',
    });
  });
});

describe('MarketplacePublicDomainService paging', () => {
  it('omits the next cursor on the last catalogue page and forwards a region filter', async () => {
    const repo = repository();
    vi.mocked(repo.listPublishedListings).mockResolvedValue({ items: [] });
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listCatalog({ region: ' Samarkand ' })).resolves.toEqual({ items: [] });
    expect(repo.listPublishedListings).toHaveBeenCalledWith({ limit: 20, region: 'Samarkand', sort: 'newest' });
  });

  it('encodes the next cursor of a request page', async () => {
    const repo = repository();
    vi.mocked(repo.listPublishedRequests).mockResolvedValue({
      items: [requestRecord],
      nextCursor: { id: requestRecord.publicId, kind: 'request', publishedAt },
    });
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listRequests()).resolves.toMatchObject({
      nextCursor: encode({ id: requestRecord.publicId, kind: 'request', publishedAt }),
    });
  });
});

describe('MarketplacePublicDomainService projections', () => {
  const produceRecord: MarketplacePublishedListingRecord = {
    availableQuantity: 12,
    images: [],
    priceUzs: 1_500_000,
    produceCrop: 'corn',
    produceGrade: 'A',
    promoted: true,
    publicId: '77777777-7777-4777-8777-777777777777',
    publishedAt: productRecord.publishedAt,
    region: 'Fergana',
    sampleAvailable: true,
    section: 'produce',
    sellerDisplayName: 'Fergana Seeds',
    sellerPublicId: productRecord.sellerPublicId,
    sellerRegion: 'Fergana',
    sourceKind: 'produce',
    title: 'Corn, grade A',
    unit: 'kg',
    updatedAt: productRecord.updatedAt,
  };

  it('maps a produce listing without inventing optional translations or a description', async () => {
    const repo = repository();
    vi.mocked(repo.findPublishedListing).mockResolvedValue(produceRecord);
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.getListing(produceRecord.publicId)).resolves.toEqual({
      availableQuantity: 12,
      crop: 'corn',
      grade: 'A',
      id: produceRecord.publicId,
      images: [],
      kind: 'produce',
      priceUzs: 1_500_000,
      promoted: true,
      publishedAt: produceRecord.publishedAt,
      region: 'Fergana',
      sampleAvailable: true,
      section: 'produce',
      seller: {
        displayName: 'Fergana Seeds',
        id: produceRecord.sellerPublicId,
        region: 'Fergana',
        verified: true,
      },
      title: 'Corn, grade A',
      unit: 'kg',
      updatedAt: produceRecord.updatedAt,
    });
  });

  it.each([
    ['a missing crop', { ...produceRecord, produceCrop: undefined }],
    ['a missing grade', { ...produceRecord, produceGrade: undefined }],
    ['a section that is not produce', { ...produceRecord, section: 'seeds' as const }],
  ])('refuses a produce projection with %s', async (_label, record) => {
    const repo = repository();
    vi.mocked(repo.findPublishedListing).mockResolvedValue(record);
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.getListing(record.publicId)).rejects.toThrow('Invalid published produce projection.');
  });

  it('omits every absent optional field of a request, a seller, and a suggestion', async () => {
    const repo = repository();
    vi.mocked(repo.listPublishedRequests).mockResolvedValue({
      items: [
        {
          buyerDisplayName: 'Bahor Farm',
          createdAt: requestRecord.createdAt,
          publicId: requestRecord.publicId,
          region: 'Samarkand',
          title: 'Corn seeds, 10 tons',
          updatedAt: requestRecord.updatedAt,
        },
      ],
    });
    vi.mocked(repo.findPublishedSeller).mockResolvedValue({
      displayName: 'Zarafshon Agro',
      publicId: sellerRecord.publicId,
      region: 'Samarkand',
      verified: true,
    });
    vi.mocked(repo.listPublishedSuggestions).mockResolvedValue([
      { id: sellerRecord.publicId, kind: 'seller', label: 'Zarafshon Agro' },
    ]);
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listRequests()).resolves.toEqual({
      items: [
        {
          buyerDisplayName: 'Bahor Farm',
          createdAt: requestRecord.createdAt,
          id: requestRecord.publicId,
          region: 'Samarkand',
          title: 'Corn seeds, 10 tons',
          updatedAt: requestRecord.updatedAt,
        },
      ],
    });
    await expect(service.getSeller(sellerRecord.publicId)).resolves.toEqual({
      displayName: 'Zarafshon Agro',
      id: sellerRecord.publicId,
      region: 'Samarkand',
      verified: true,
    });
    await expect(service.listSuggestions('agro')).resolves.toEqual([
      { id: sellerRecord.publicId, kind: 'seller', label: 'Zarafshon Agro' },
    ]);
  });

  it('reports a missing listing or seller as absent rather than empty', async () => {
    const repo = repository();
    vi.mocked(repo.findPublishedListing).mockResolvedValue(undefined);
    vi.mocked(repo.findPublishedSeller).mockResolvedValue(undefined);
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.getListing(productRecord.publicId)).resolves.toBeUndefined();
    await expect(service.getSeller(sellerRecord.publicId)).resolves.toBeUndefined();
  });

  it('answers a blank suggestion query without touching persistence', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listSuggestions('   ')).resolves.toEqual([]);
    expect(repo.listPublishedSuggestions).not.toHaveBeenCalled();
  });

  it('scopes a seller catalogue to that seller and forwards its keyset cursor', async () => {
    const repo = repository();
    vi.mocked(repo.listPublishedSellerListings).mockResolvedValue({
      items: [productRecord],
      nextCursor: {
        id: productRecord.publicId,
        kind: 'catalog',
        priceUzs: productRecord.priceUzs,
        sort: 'price_asc',
      },
    });
    const service = new MarketplacePublicDomainService(repo);

    const page = await service.listSellerCatalog(sellerRecord.publicId, { sort: 'price_asc' });

    expect(repo.listPublishedSellerListings).toHaveBeenCalledWith(sellerRecord.publicId, {
      limit: 20,
      sort: 'price_asc',
    });
    expect(page.nextCursor).toBe(
      encode({ id: productRecord.publicId, kind: 'catalog', priceUzs: productRecord.priceUzs, sort: 'price_asc' }),
    );

    vi.mocked(repo.listPublishedSellerListings).mockResolvedValue({ items: [] });
    await expect(service.listSellerCatalog(sellerRecord.publicId)).resolves.toEqual({ items: [] });
  });
});

describe('MarketplacePublicDomainService moderation commands', () => {
  const owner = { tenantId: 'seller-tenant', userId: 'seller-user' };
  const reviewer = 'moderator-user';

  it('delegates every publication and moderation command with its exact arguments', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);
    const requestInput = { buyerPartnerId: '22222222-2222-4222-8222-222222222222', requestId: requestRecord.publicId };
    const listingReview = {
      decision: 'approved' as const,
      expectedRevision: 0,
      expectedSellerContentFingerprint: 'a'.repeat(64),
      expectedSellerContentRevision: 1,
      idempotencyKey: 'review-listing-1',
    };
    const sellerReview = {
      decision: 'approved' as const,
      expectedContentFingerprint: 'a'.repeat(64),
      expectedContentRevision: 1,
      idempotencyKey: 'review-seller-01',
    };
    const requestReview = { decision: 'rejected' as const, expectedRevision: 0, idempotencyKey: 'review-request-1' };

    await expect(service.publishRequest(owner, 'publish-request-1', requestInput)).resolves.toMatchObject({
      moderationStatus: 'pending',
    });
    await expect(service.listPendingModeration(owner.tenantId)).resolves.toEqual({
      listings: [],
      requests: [],
      sellerProfiles: [],
    });
    await expect(
      service.reviewListingPublication(owner.tenantId, listingPublication.id, reviewer, listingReview),
    ).resolves.toEqual(listingPublication);
    await expect(
      service.reviewSellerProfile(owner.tenantId, productRecord.sellerPublicId, reviewer, sellerReview),
    ).resolves.toMatchObject({ moderationStatus: 'approved' });
    await expect(
      service.reviewRequestPublication(owner.tenantId, requestRecord.publicId, reviewer, requestReview),
    ).resolves.toMatchObject({ moderationStatus: 'approved' });

    expect(repo.publishRequest).toHaveBeenCalledWith(owner, 'publish-request-1', requestInput);
    expect(repo.listPendingModeration).toHaveBeenCalledWith(owner.tenantId);
    expect(repo.reviewListingPublication).toHaveBeenCalledWith(
      owner.tenantId,
      listingPublication.id,
      reviewer,
      listingReview,
    );
    expect(repo.reviewSellerProfile).toHaveBeenCalledWith(
      owner.tenantId,
      productRecord.sellerPublicId,
      reviewer,
      sellerReview,
    );
    expect(repo.reviewRequestPublication).toHaveBeenCalledWith(
      owner.tenantId,
      requestRecord.publicId,
      reviewer,
      requestReview,
    );
  });

  it.each([
    ['not_found', ResourceNotFoundException],
    ['forbidden', ForbiddenException],
    ['partner_unapproved', ForbiddenException],
    ['conflict', ConflictException],
    ['invalid_state', BadRequestException],
  ] as const)('translates a %s publication outcome into its typed failure', async (status, expected) => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);
    const outcome = { field: 'requestId', status } as never;
    vi.mocked(repo.publishRequest).mockResolvedValue(outcome);
    vi.mocked(repo.reviewListingPublication).mockResolvedValue(outcome);
    vi.mocked(repo.reviewSellerProfile).mockResolvedValue(outcome);
    vi.mocked(repo.reviewRequestPublication).mockResolvedValue(outcome);

    await expect(
      service.publishRequest(owner, 'publish-request-2', {
        buyerPartnerId: '22222222-2222-4222-8222-222222222222',
        requestId: requestRecord.publicId,
      }),
    ).rejects.toBeInstanceOf(expected);
    await expect(
      service.reviewListingPublication(owner.tenantId, listingPublication.id, reviewer, {
        decision: 'approved',
        expectedRevision: 0,
        expectedSellerContentFingerprint: 'a'.repeat(64),
        expectedSellerContentRevision: 1,
        idempotencyKey: 'review-listing-2',
      }),
    ).rejects.toBeInstanceOf(expected);
    await expect(
      service.reviewSellerProfile(owner.tenantId, productRecord.sellerPublicId, reviewer, {
        decision: 'approved',
        expectedContentFingerprint: 'a'.repeat(64),
        expectedContentRevision: 1,
        idempotencyKey: 'review-seller-02',
      }),
    ).rejects.toBeInstanceOf(expected);
    await expect(
      service.reviewRequestPublication(owner.tenantId, requestRecord.publicId, reviewer, {
        decision: 'approved',
        expectedRevision: 0,
        idempotencyKey: 'review-request-2',
      }),
    ).rejects.toBeInstanceOf(expected);
  });
});
