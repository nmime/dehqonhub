// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-DEMO-024
/* eslint-disable no-await-in-loop -- table-driven cases mutate stateful mocks and must remain ordered */
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketplacePublicRepository,
  MarketplacePublishedListingRecord,
  MarketplacePublishedRequestRecord,
  MarketplacePublishedSellerRecord,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePublicDomainService } from './marketplace-public.domain-service';
import {
  findMarketplaceDemoListing,
  findMarketplaceDemoSeller,
  listMarketplaceDemoListings,
  listMarketplaceDemoSellerListings,
  listMarketplaceDemoSuggestions,
} from './marketplace-demo-catalog';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';

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
  isDemoCatalogEnabled: vi.fn().mockResolvedValue(false),
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
          provenance: 'live',
          publishedAt: productRecord.publishedAt,
          region: 'Samarkand',
          sampleAvailable: false,
          section: 'seeds',
          seller: {
            displayName: 'Zarafshon Agro',
            id: productRecord.sellerPublicId,
            provenance: 'live',
            region: 'Samarkand',
            verified: true,
          },
          title: 'Corn F1',
          titleRu: 'Кукуруза F1',
          titleUz: "Makkajo'xori F1",
          titleUzCyrl: 'Маккажўхори F1',
          unit: 't',
          transactional: true,
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
      provenance: 'live',
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

  it('adds clearly non-transactional demo listings only when the governed flag is enabled', async () => {
    const repo = repository();
    vi.mocked(repo.isDemoCatalogEnabled).mockResolvedValue(true);
    vi.mocked(repo.listPublishedListings).mockResolvedValue({ items: [] });
    vi.mocked(repo.findPublishedListing).mockResolvedValue(undefined);
    vi.mocked(repo.findPublishedSeller).mockResolvedValue(undefined);
    vi.mocked(repo.listPublishedSuggestions).mockResolvedValue([]);
    const service = new MarketplacePublicDomainService(repo);

    const page = await service.listCatalog({ limit: 10, sampleAvailable: true, section: 'seeds' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      provenance: 'demo',
      title: 'Premium cotton seed',
      transactional: false,
      seller: { provenance: 'demo', verified: false },
    });
    const listingId = page.items[0]?.id ?? '';
    await expect(service.getListing(listingId)).resolves.toMatchObject({ provenance: 'demo' });
    await expect(service.getSeller(page.items[0]?.seller.id ?? '')).resolves.toMatchObject({
      provenance: 'demo',
      verified: false,
    });
    await expect(service.listSuggestions('cotton', 8)).resolves.toEqual([
      expect.objectContaining({ id: listingId, kind: 'listing' }),
    ]);
    vi.mocked(repo.listPublishedSuggestions).mockResolvedValueOnce([
      { id: '9d000000-0000-4000-8000-000000000001', kind: 'seller', label: 'Existing demo seller' },
    ]);
    await expect(service.listSuggestions('demo', 8)).resolves.toHaveLength(7);
    vi.mocked(repo.listPublishedSuggestions).mockResolvedValueOnce([
      { id: productRecord.publicId, kind: 'listing', label: productRecord.title, section: productRecord.section },
    ]);
    await expect(service.listSuggestions('demo', 2)).resolves.toHaveLength(2);

    vi.mocked(repo.listPublishedListings).mockResolvedValueOnce({ items: [productRecord] });
    await expect(service.listCatalog({ limit: 2 })).resolves.toHaveProperty('items', [
      expect.objectContaining({ id: productRecord.publicId, provenance: 'live' }),
      expect.objectContaining({ provenance: 'demo' }),
    ]);
    vi.mocked(repo.listPublishedListings).mockResolvedValueOnce({
      items: [{ ...productRecord, publicId: listingId }],
    });
    await expect(service.listCatalog({ limit: 10 })).resolves.toHaveProperty('items.length', 6);

    vi.mocked(repo.listPublishedSellerListings).mockResolvedValue({ items: [] });
    const sellerCatalog = await service.listSellerCatalog('9d000000-0000-4000-8000-000000000001');
    expect(sellerCatalog.items).toHaveLength(6);
    expect(sellerCatalog.items.every((item) => item.provenance === 'demo')).toBe(true);

    expect(
      listMarketplaceDemoListings({
        crop: 'apple',
        limit: 10,
        maxPriceUzs: 20_000,
        minAvailableQuantity: 5_000,
        minPriceUzs: 10_000,
        region: 'Namangan',
        sampleAvailable: false,
        section: 'produce',
        sort: 'price_asc',
      }),
    ).toEqual([expect.objectContaining({ crop: 'Apple', region: 'Namangan' })]);
    expect(listMarketplaceDemoListings({ category: 'equipment', limit: 10, sort: 'price_desc' })).toEqual([
      expect.objectContaining({ title: 'Precision seed drill' }),
    ]);
    expect(listMarketplaceDemoListings({ limit: 10, sort: 'price_asc' })[0]).toMatchObject({
      title: 'Fresh orchard apples',
    });
    expect(listMarketplaceDemoListings({ limit: 10, sort: 'price_desc' })[0]).toMatchObject({
      title: 'Precision seed drill',
    });
    expect(listMarketplaceDemoListings({ limit: 10, query: 'tomato' })).toEqual([
      expect.objectContaining({ kind: 'produce' }),
    ]);
    expect(findMarketplaceDemoListing('missing')).toBeUndefined();
    expect(findMarketplaceDemoSeller('missing')).toBeUndefined();
    expect(listMarketplaceDemoSellerListings('missing', { limit: 10 })).toEqual([]);
    expect(listMarketplaceDemoSuggestions('demo', 1)).toEqual([expect.objectContaining({ kind: 'seller' })]);

    vi.mocked(repo.isDemoCatalogEnabled).mockResolvedValue(false);
    await expect(service.getListing(listingId)).resolves.toBeUndefined();
  });

  it('fails closed to authoritative records when demo governance is unreadable', async () => {
    const repo = repository();
    vi.mocked(repo.isDemoCatalogEnabled).mockRejectedValue(new Error('feature flag storage unavailable'));
    const service = new MarketplacePublicDomainService(repo);

    await expect(service.listCatalog()).resolves.toMatchObject({
      items: [{ id: productRecord.publicId, provenance: 'live', transactional: true }],
    });
    vi.mocked(repo.findPublishedListing).mockResolvedValueOnce(undefined);
    await expect(service.getListing('9d000000-0000-4000-8000-000000000101')).resolves.toBeUndefined();
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

  it('covers every public projection, cursor, bounded query, and authenticated publication result boundary', async () => {
    const repo = repository();
    const service = new MarketplacePublicDomainService(repo);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const produceRecord: MarketplacePublishedListingRecord = {
      ...productRecord,
      description: undefined,
      productCategory: undefined,
      produceCrop: 'corn',
      produceGrade: 'A',
      sampleAvailable: true,
      section: 'produce',
      sourceKind: 'produce',
      titleRu: undefined,
      titleUz: undefined,
      titleUzCyrl: undefined,
    };
    vi.mocked(repo.findPublishedListing).mockResolvedValueOnce(undefined).mockResolvedValueOnce(produceRecord);
    vi.mocked(repo.findPublishedSeller)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...sellerRecord,
        description: undefined,
      });
    await expect(service.getListing('missing')).resolves.toBeUndefined();
    await expect(service.getListing(produceRecord.publicId)).resolves.toMatchObject({
      crop: 'corn',
      grade: 'A',
      kind: 'produce',
    });
    await expect(service.getSeller('missing')).resolves.toBeUndefined();
    await expect(service.getSeller(sellerRecord.publicId)).resolves.not.toHaveProperty('description');

    for (const invalidProduce of [
      { ...produceRecord, produceCrop: undefined },
      { ...produceRecord, produceGrade: undefined },
      { ...produceRecord, section: 'seeds' as const },
    ]) {
      vi.mocked(repo.findPublishedListing).mockResolvedValueOnce(invalidProduce);
      await expect(service.getListing(invalidProduce.publicId)).rejects.toThrow('Invalid published produce projection');
    }
    vi.mocked(repo.findPublishedListing).mockResolvedValueOnce({ ...productRecord, productCategory: undefined });
    await expect(service.getListing(productRecord.publicId)).rejects.toThrow('Invalid published product projection');

    vi.mocked(repo.listPublishedSellerListings).mockResolvedValueOnce({
      items: [produceRecord],
      nextCursor: {
        id: produceRecord.publicId,
        kind: 'catalog',
        promoted: false,
        publishedAt: produceRecord.publishedAt.toISOString(),
        sort: 'newest',
      },
    });
    await expect(service.listSellerCatalog(sellerRecord.publicId)).resolves.toMatchObject({
      items: [{ kind: 'produce' }],
      nextCursor: expect.any(String),
    });
    await expect(service.listSellerCatalog(sellerRecord.publicId)).resolves.not.toHaveProperty('nextCursor');

    vi.mocked(repo.listPublishedRequests).mockResolvedValueOnce({
      items: [
        {
          ...requestRecord,
          budgetUzs: undefined,
          deadline: undefined,
          product: undefined,
          requirements: undefined,
          volume: undefined,
        },
      ],
      nextCursor: {
        id: requestRecord.publicId,
        kind: 'request',
        publishedAt: requestRecord.createdAt.toISOString(),
      },
    });
    const requestCursor = encode({
      id: requestRecord.publicId,
      kind: 'request',
      publishedAt: requestRecord.createdAt.toISOString(),
    });
    await expect(
      service.listRequests({ cursor: requestCursor, limit: 0, query: ' ', region: ' ' }),
    ).resolves.toMatchObject({ items: [{ id: requestRecord.publicId }], nextCursor: expect.any(String) });
    await service.listRequests({ query: ' corn ' });
    expect(repo.listPublishedRequests).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'corn' }));

    vi.mocked(repo.listPublishedSuggestions).mockResolvedValueOnce([
      { id: 'suggestion-1', kind: 'seller', label: 'Seller' },
    ]);
    await expect(service.listSuggestions('   ')).resolves.toEqual([]);
    await expect(service.listSuggestions('seller', -5)).resolves.toEqual([
      { id: 'suggestion-1', kind: 'seller', label: 'Seller' },
    ]);

    await service.listCatalog({
      crop: ' corn ',
      limit: 0,
      maxPriceUzs: 10,
      minAvailableQuantity: 1,
      minPriceUzs: 0,
      query: ' ',
      region: ' region ',
      sampleAvailable: false,
      section: 'produce',
    });
    expect(repo.listPublishedListings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        crop: 'corn',
        limit: 1,
        maxPriceUzs: 10,
        minAvailableQuantity: 1,
        minPriceUzs: 0,
        region: 'region',
        sampleAvailable: false,
      }),
    );
    await service.listCatalog({ limit: 1.5 });
    expect(repo.listPublishedListings).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 20 }));
    vi.mocked(repo.listPublishedListings).mockResolvedValueOnce({ items: [] });
    await expect(service.listCatalog()).resolves.toEqual({ items: [] });

    const newestCursor = encode({
      id: productRecord.publicId,
      kind: 'catalog',
      promoted: false,
      publishedAt: productRecord.publishedAt.toISOString(),
      sort: 'newest',
    });
    await service.listCatalog({ cursor: newestCursor });
    expect(repo.listPublishedListings).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: expect.objectContaining({ sort: 'newest' }) }),
    );

    const malformedPayloadCursors = [
      '',
      'a'.repeat(513),
      ' e30 ',
      'abc=',
      'a',
      encode(null),
      encode([]),
      encode('value'),
    ];
    for (const cursor of malformedPayloadCursors) {
      await expect(service.listCatalog({ cursor })).rejects.toBeInstanceOf(BadRequestException);
    }

    const invalidNewestValues = [
      {
        id: productRecord.publicId,
        kind: 'wrong',
        promoted: false,
        publishedAt: productRecord.publishedAt.toISOString(),
        sort: 'newest',
      },
      {
        id: productRecord.publicId,
        kind: 'catalog',
        promoted: false,
        publishedAt: productRecord.publishedAt.toISOString(),
        sort: 'price_asc',
      },
      {
        id: 'not-a-uuid',
        kind: 'catalog',
        promoted: false,
        publishedAt: productRecord.publishedAt.toISOString(),
        sort: 'newest',
      },
      {
        id: productRecord.publicId,
        kind: 'catalog',
        promoted: false,
        publishedAt: productRecord.publishedAt.toISOString(),
        sort: 'newest',
        extra: true,
      },
      {
        id: productRecord.publicId,
        kind: 'catalog',
        promoted: 'false',
        publishedAt: productRecord.publishedAt.toISOString(),
        sort: 'newest',
      },
      { id: productRecord.publicId, kind: 'catalog', promoted: false, publishedAt: 1, sort: 'newest' },
      { id: productRecord.publicId, kind: 'catalog', promoted: false, publishedAt: 'invalid', sort: 'newest' },
      { id: productRecord.publicId, kind: 'catalog', promoted: false, publishedAt: '2030-01-01', sort: 'newest' },
    ];
    for (const value of invalidNewestValues) {
      await expect(service.listCatalog({ cursor: encode(value) })).rejects.toBeInstanceOf(BadRequestException);
    }

    const invalidPriceValues = [
      { id: productRecord.publicId, kind: 'catalog', priceUzs: 1, sort: 'price_asc', extra: true },
      { id: productRecord.publicId, kind: 'catalog', priceUzs: 1.5, sort: 'price_asc' },
      { id: productRecord.publicId, kind: 'catalog', priceUzs: -1, sort: 'price_asc' },
      { id: productRecord.publicId, kind: 'catalog', priceUzs: 10_000_000_000_000, sort: 'price_asc' },
    ];
    for (const value of invalidPriceValues) {
      await expect(service.listCatalog({ cursor: encode(value), sort: 'price_asc' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }

    const invalidRequestValues = [
      { id: requestRecord.publicId, kind: 'request', publishedAt: requestRecord.createdAt.toISOString(), extra: true },
      { id: requestRecord.publicId, kind: 'catalog', publishedAt: requestRecord.createdAt.toISOString() },
      { id: 'bad', kind: 'request', publishedAt: requestRecord.createdAt.toISOString() },
      { id: requestRecord.publicId, kind: 'request', publishedAt: 'invalid' },
    ];
    for (const value of invalidRequestValues) {
      await expect(service.listRequests({ cursor: encode(value) })).rejects.toBeInstanceOf(BadRequestException);
    }

    for (const input of [
      { minPriceUzs: 0.5 },
      { minPriceUzs: -1 },
      { maxPriceUzs: 10_000_000_000_000 },
      { minAvailableQuantity: 0 },
      { minAvailableQuantity: 2_147_483_648 },
      { category: 'seed' as const, crop: 'corn', section: 'produce' as const },
      { category: 'seed' as const, section: 'produce' as const },
      { crop: 'corn', section: 'seeds' as const },
    ]) {
      await expect(service.listCatalog(input)).rejects.toBeInstanceOf(BadRequestException);
    }

    const owner = { tenantId: 'seller-tenant', userId: 'seller-user' };
    const requestPublication = {
      id: requestRecord.publicId,
      moderationStatus: 'pending' as const,
      publishedAt: requestRecord.createdAt,
      requestId: requestRecord.publicId,
      revision: 0,
      status: 'published' as const,
      updatedAt: requestRecord.updatedAt,
    };
    await expect(service.publishRequest(owner, 'publish-request-1', {} as never)).resolves.toEqual(requestPublication);
    await expect(service.listPendingModeration(owner.tenantId)).resolves.toEqual({
      listings: [],
      requests: [],
      sellerProfiles: [],
    });
    await expect(
      service.reviewListingPublication(owner.tenantId, listingPublication.id, owner.userId, {} as never),
    ).resolves.toEqual(listingPublication);
    await expect(
      service.reviewSellerProfile(owner.tenantId, sellerRecord.publicId, owner.userId, {} as never),
    ).resolves.toMatchObject({ sellerPublicId: sellerRecord.publicId });
    await expect(
      service.reviewRequestPublication(owner.tenantId, requestPublication.id, owner.userId, {} as never),
    ).resolves.toMatchObject({ id: requestPublication.id });

    for (const [result, ErrorType] of [
      [{ status: 'not_found' }, ResourceNotFoundException],
      [{ status: 'forbidden' }, ForbiddenException],
      [{ status: 'partner_unapproved' }, ForbiddenException],
      [{ status: 'conflict' }, ConflictException],
      [{ status: 'invalid_state', field: 'status' }, BadRequestException],
    ] as const) {
      vi.mocked(repo.publishRequest).mockResolvedValueOnce(result);
      await expect(service.publishRequest(owner, `publish-${result.status}-key`, {} as never)).rejects.toBeInstanceOf(
        ErrorType,
      );
    }
  });
});
