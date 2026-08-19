// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-DEMO-024
import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { FarmerEntity } from '../entities/farmer.entity';
import { BuyerRequestEntity, VerificationEntity } from '../entities/marketplace.entity';
import {
  MarketplaceListingPublicationEntity,
  MarketplacePublicSellerEntity,
  MarketplacePublicSellerRevisionEntity,
  MarketplaceRequestPublicationEntity,
} from '../entities/marketplace-public.entity';
import { MarketplaceRequestOrganizationBindingEntity } from '../entities/marketplace-source-binding.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';
import { PostgresMarketplacePublicRepository } from './marketplace-public.repository';

const owner = { tenantId: 'tenant-seller', userId: 'user-seller' };

const entityManager = () => {
  const execute = vi.fn().mockResolvedValue([]);
  const em = {
    find: vi.fn(),
    findOne: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    getConnection: vi.fn(() => ({ execute })),
    persist: vi.fn(),
    transactional: vi.fn((callback: (manager: EntityManager) => unknown) => callback(em as unknown as EntityManager)),
  };
  return { em, execute };
};

describe('PostgresMarketplacePublicRepository', () => {
  it('returns only the caller-owned bounded publication status projection', async () => {
    const { em } = entityManager();
    const updatedAt = new Date('2030-01-02T00:00:00.000Z');
    em.find
      .mockResolvedValueOnce([
        Object.assign(new MarketplaceListingPublicationEntity(), {
          id: '11111111-1111-4111-8111-111111111111',
          moderationStatus: 'pending' as const,
          ownerUserId: owner.userId,
          productId: '44444444-4444-4444-8444-444444444444',
          publicTitle: 'Corn F1',
          revision: 0,
          section: 'seeds' as const,
          sellerPublicId: '33333333-3333-4333-8333-333333333333',
          sourceKind: 'product' as const,
          status: 'paused' as const,
          tenantId: owner.tenantId,
          updatedAt,
        }),
      ])
      .mockResolvedValueOnce([
        Object.assign(new MarketplaceRequestPublicationEntity(), {
          buyerUserId: owner.userId,
          buyerDisplayName: 'Bahor Farm',
          id: '55555555-5555-4555-8555-555555555555',
          moderationStatus: 'approved' as const,
          requestId: '66666666-6666-4666-8666-666666666666',
          revision: 1,
          status: 'published' as const,
          tenantId: owner.tenantId,
          publicTitle: 'Corn seeds, 10 tons',
          updatedAt,
        }),
      ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const result = await repository.listOwnedPublications(owner, 20);

    expect(em.find).toHaveBeenNthCalledWith(
      1,
      MarketplaceListingPublicationEntity,
      { ownerUserId: owner.userId, tenantId: owner.tenantId },
      { limit: 20, orderBy: { id: 'DESC', updatedAt: 'DESC' } },
    );
    expect(em.find).toHaveBeenNthCalledWith(
      2,
      MarketplaceRequestPublicationEntity,
      { buyerUserId: owner.userId, tenantId: owner.tenantId },
      { limit: 20, orderBy: { id: 'DESC', updatedAt: 'DESC' } },
    );
    expect(result).toMatchObject({
      listings: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'listing',
          moderationStatus: 'pending',
          title: 'Corn F1',
        },
      ],
      requests: [
        {
          buyerDisplayName: 'Bahor Farm',
          id: '55555555-5555-4555-8555-555555555555',
          kind: 'request',
          moderationStatus: 'approved',
          title: 'Corn seeds, 10 tons',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/tenantId|ownerUserId|buyerUserId|partnerId|sourceId|requestId/u);
  });

  it('reads only publication-backed active catalog rows and preserves a bounded cursor', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      {
        available_quantity: 8,
        description: 'Certified seed',
        images: ['https://cdn.example.test/corn.webp'],
        price_uzs: '4200000.00',
        product_category: 'seed',
        promoted: false,
        produce_crop: null,
        produce_grade: null,
        public_id: '11111111-1111-4111-8111-111111111111',
        published_at: new Date('2030-01-01T00:00:00.000Z'),
        region: 'Samarkand',
        section: 'seeds',
        seller_display_name: 'Zarafshon Agro',
        seller_owner_user_id: 'private-user',
        seller_partner_id: '22222222-2222-4222-8222-222222222222',
        seller_public_id: '33333333-3333-4333-8333-333333333333',
        seller_region: 'Samarkand',
        seller_tenant_id: 'private-tenant',
        source_id: '44444444-4444-4444-8444-444444444444',
        source_kind: 'product',
        source_tenant_id: 'private-tenant',
        title: 'Corn F1',
        unit: 't',
        updated_at: new Date('2030-01-02T00:00:00.000Z'),
      },
      {
        public_id: '55555555-5555-4555-8555-555555555555',
      },
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const page = await repository.listPublishedListings({
      category: 'seed',
      cursor: {
        id: '77777777-7777-4777-8777-777777777777',
        kind: 'catalog',
        priceUzs: 4_000_000,
        sort: 'price_asc',
      },
      limit: 1,
      maxPriceUzs: 5_000_000,
      minAvailableQuantity: 2,
      minPriceUzs: 4_000_000,
      query: 'corn',
      section: 'seeds',
      sort: 'price_asc',
    });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'catalog',
      priceUzs: 4_200_000,
      sort: 'price_asc',
    });
    expect(page.items[0]).toMatchObject({
      priceUzs: 4_200_000,
      publicId: '11111111-1111-4111-8111-111111111111',
      sourceKind: 'product',
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining(`publication.status = 'published'`), [
      'seeds',
      'seed',
      4_000_000,
      5_000_000,
      2,
      '%corn%',
      '%corn%',
      '%corn%',
      '%corn%',
      '%corn%',
      4_000_000,
      4_000_000,
      '77777777-7777-4777-8777-777777777777',
      2,
    ]);
  });

  it('uses stable request keysets and escapes wildcard search characters', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      {
        budget_uzs: '45000000',
        buyer_display_name: 'Bahor Farm',
        created_at: new Date('2030-01-01T00:00:00.000Z'),
        deadline: '2030-01-20',
        product: 'Corn F1',
        public_id: '11111111-1111-4111-8111-111111111111',
        published_at: new Date('2030-01-03T00:00:00.000Z'),
        region: 'Samarkand',
        requirements: null,
        title: 'Corn seeds',
        updated_at: new Date('2030-01-02T00:00:00.000Z'),
        volume: '10 t',
      },
      { public_id: '55555555-5555-4555-8555-555555555555' },
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const page = await repository.listPublishedRequests({
      cursor: {
        id: '77777777-7777-4777-8777-777777777777',
        kind: 'request',
        publishedAt: '2030-01-04T00:00:00.000Z',
      },
      limit: 1,
      query: '%_corn\\',
    });

    expect(page.nextCursor).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'request',
      publishedAt: '2030-01-03T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining(`escape '\\'`), [
      '%\\%\\_corn\\\\%',
      '%\\%\\_corn\\\\%',
      '%\\%\\_corn\\\\%',
      '2030-01-04T00:00:00.000Z',
      '2030-01-04T00:00:00.000Z',
      '77777777-7777-4777-8777-777777777777',
      2,
    ]);
  });

  it('fails closed before loading a source when the actor lacks verified seller authority', async () => {
    const { em } = entityManager();
    em.findOne.mockResolvedValue(undefined);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const result = await repository.publishListing(owner, 'publish-listing-1', {
      section: 'seeds',
      sellerPartnerId: '22222222-2222-4222-8222-222222222222',
      sourceId: '44444444-4444-4444-8444-444444444444',
      sourceKind: 'product',
    });

    expect(result).toEqual({ status: 'partner_unapproved' });
    expect(em.findOne).toHaveBeenCalledWith(
      VerificationEntity,
      expect.objectContaining({ status: 'verified', tenantId: owner.tenantId, userId: owner.userId }),
      expect.objectContaining({ lockMode: expect.anything() }),
    );
    expect(em.findOne).not.toHaveBeenCalledWith(ProductEntity, expect.anything(), expect.anything());
  });

  it('publishes an owned active product under an approved supplier with an opaque seller profile', async () => {
    const { em } = entityManager();
    const partner = Object.assign(new AgriTechPartnerEntity(), {
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'supplier' as const,
      ownerUserId: owner.userId,
      legalName: 'Zarafshon Agro',
      region: 'Samarkand',
      status: 'approved' as const,
      tenantId: owner.tenantId,
    });
    const product = Object.assign(new ProductEntity(), {
      category: 'seed' as const,
      id: '44444444-4444-4444-8444-444444444444',
      status: 'active' as const,
      supplierId: partner.id,
      tenantId: owner.tenantId,
    });
    em.findOne.mockImplementation((entity: unknown) => {
      if (entity === VerificationEntity) {
        return Promise.resolve({ role: 'seller', status: 'verified' });
      }
      if (entity === AgriTechPartnerEntity) {
        return Promise.resolve(partner);
      }
      if (entity === ProductEntity) {
        return Promise.resolve(product);
      }
      return Promise.resolve(undefined);
    });
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const result = await repository.publishListing(owner, 'publish-listing-1', {
      section: 'seeds',
      sellerPartnerId: partner.id,
      sourceId: product.id,
      sourceKind: 'product',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error('Expected a publication.');
    }
    expect(result.value).toMatchObject({
      section: 'seeds',
      sourceId: product.id,
      sourceKind: 'product',
      status: 'published',
      moderationStatus: 'pending',
    });
    expect(em.persist).toHaveBeenCalledWith(expect.any(MarketplacePublicSellerEntity));
    expect(em.persist).toHaveBeenCalledWith(expect.any(MarketplacePublicSellerRevisionEntity));
    expect(em.persist).toHaveBeenCalledWith(expect.any(MarketplaceListingPublicationEntity));
    expect(em.flush).toHaveBeenCalledOnce();
  });

  it('does not classify Product.other as Produce', async () => {
    const { em } = entityManager();
    em.findOne.mockImplementation((entity: unknown) => {
      if (entity === VerificationEntity) {
        return Promise.resolve({ role: 'seller', status: 'verified' });
      }
      if (entity === AgriTechPartnerEntity) {
        return Promise.resolve(
          Object.assign(new AgriTechPartnerEntity(), {
            id: '22222222-2222-4222-8222-222222222222',
            legalName: 'Seller',
            region: 'Samarkand',
          }),
        );
      }
      if (entity === ProductEntity) {
        return Promise.resolve(Object.assign(new ProductEntity(), { category: 'other' }));
      }
      return Promise.resolve(undefined);
    });
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    await expect(
      repository.publishListing(owner, 'publish-listing-1', {
        section: 'produce',
        sellerPartnerId: '22222222-2222-4222-8222-222222222222',
        sourceId: '44444444-4444-4444-8444-444444444444',
        sourceKind: 'product',
      }),
    ).resolves.toEqual({ field: 'section', status: 'invalid_state' });
  });

  it('keeps request publication bound to an owned open request and approved buyer organization', async () => {
    const { em } = entityManager();
    const partner = Object.assign(new AgriTechPartnerEntity(), {
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'buyer' as const,
      legalName: 'Bahor Farm',
      ownerUserId: owner.userId,
      status: 'approved' as const,
      tenantId: owner.tenantId,
    });
    const request = Object.assign(new BuyerRequestEntity(), {
      buyerUserId: owner.userId,
      id: '66666666-6666-4666-8666-666666666666',
      status: 'open' as const,
      tenantId: owner.tenantId,
    });
    em.findOne.mockImplementation((entity: unknown) => {
      if (entity === VerificationEntity) {
        return Promise.resolve({ role: 'buyer', status: 'verified' });
      }
      if (entity === AgriTechPartnerEntity) {
        return Promise.resolve(partner);
      }
      if (entity === BuyerRequestEntity) {
        return Promise.resolve(request);
      }
      if (entity === MarketplaceRequestOrganizationBindingEntity) {
        return Promise.resolve(
          Object.assign(new MarketplaceRequestOrganizationBindingEntity(), {
            buyerPartnerId: partner.id,
            buyerUserId: owner.userId,
            requestId: request.id,
            tenantId: owner.tenantId,
          }),
        );
      }
      return Promise.resolve(undefined);
    });
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const result = await repository.publishRequest(owner, 'publish-request-1', {
      buyerPartnerId: partner.id,
      requestId: request.id,
    });

    expect(result.status).toBe('ok');
    expect(em.persist).toHaveBeenCalledWith(expect.any(MarketplaceRequestPublicationEntity));
    expect(em.findOne).not.toHaveBeenCalledWith(FarmerEntity, expect.anything());
    expect(em.findOne).not.toHaveBeenCalledWith(ProduceListingEntity, expect.anything(), expect.anything());
  });

  /**
   * The raw-SQL read path is the only place a timestamp is not hydrated by
   * MikroORM: its PostgreSQL dialect installs `pg` type parsers that return the
   * wire string, so `getConnection().execute()` yields `'2026-08-07 08:00:00+00'`
   * rather than a `Date`. These rows therefore carry the driver's own string
   * form, and both pages are asked for fewer rows than exist — the cursor is
   * only built when the page is truncated, so a page larger than the data can
   * never exercise it.
   */
  const driverTimestamp = '2026-08-07 08:00:00+00';

  const listingRow = (publicId: string, publishedAt: string, rating = { ratingSum: 0, reviewCount: 0 }) => ({
    public_id: publicId,
    source_kind: 'product' as const,
    section: 'seeds' as const,
    title: 'Cotton seed',
    title_ru: null,
    title_uz: null,
    title_uz_cyrl: null,
    description: null,
    price_uzs: '412000',
    unit: '25 kg',
    available_quantity: 480,
    sample_available: true,
    region: 'Andijon',
    images: ['/media/marketplace/cotton-bolls.webp'],
    promoted: false,
    product_category: 'seed' as const,
    produce_crop: null,
    produce_grade: null,
    // The aggregate join is a left join, so an unrated listing arrives as the
    // coalesced zeroes rather than as absent columns.
    review_count: rating.reviewCount,
    rating_sum: rating.ratingSum,
    published_at: publishedAt,
    updated_at: publishedAt,
    seller_public_id: '33333333-3333-4333-8333-333333333333',
    seller_display_name: "Andijon Urug'chilik",
    seller_region: 'Andijon',
  });

  const requestRow = (publicId: string, publishedAt: string) => ({
    public_id: publicId,
    title: 'Table grapes, 8 tonnes',
    product: 'Table grapes, grade 1',
    volume: '8 t',
    region: 'Samarqand',
    deadline: '2026-09-15',
    budget_uzs: '96000000',
    requirements: null,
    buyer_display_name: 'Xaridor Demo Savdo',
    published_at: publishedAt,
    created_at: publishedAt,
    updated_at: publishedAt,
  });

  it('returns a well-formed keyset cursor when the catalog page is truncated', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      listingRow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', driverTimestamp),
      listingRow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '2026-08-06 08:00:00+00'),
      listingRow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '2026-08-05 08:00:00+00'),
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const page = await repository.listPublishedListings({ limit: 2, sort: 'newest' });

    expect(page.items).toHaveLength(2);
    expect(page.items.map((item) => item.publicId)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    ]);
    expect(page.items[0]?.publishedAt).toBeInstanceOf(Date);
    expect(page.items[0]?.publishedAt.toISOString()).toBe('2026-08-07T08:00:00.000Z');
    expect(page.nextCursor).toEqual({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      kind: 'catalog',
      promoted: false,
      publishedAt: '2026-08-06T08:00:00.000Z',
      sort: 'newest',
    });
  });

  it('returns a price cursor when a price-sorted catalog page is truncated', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      listingRow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', driverTimestamp),
      listingRow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', driverTimestamp),
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const page = await repository.listPublishedListings({ limit: 1, sort: 'price_asc' });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      kind: 'catalog',
      priceUzs: 412_000,
      sort: 'price_asc',
    });
  });

  it('returns a well-formed keyset cursor when the public request feed is truncated', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      requestRow('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', driverTimestamp),
      requestRow('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '2026-08-06 09:30:00+00'),
      requestRow('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', '2026-08-05 09:30:00+00'),
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const page = await repository.listPublishedRequests({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.createdAt).toBeInstanceOf(Date);
    expect(page.nextCursor).toEqual({
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
      kind: 'request',
      publishedAt: '2026-08-06T09:30:00.000Z',
    });
  });

  it('continues a truncated catalog page from the returned cursor without repeating a row', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      listingRow('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', driverTimestamp),
      listingRow('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '2026-08-06 08:00:00+00'),
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const first = await repository.listPublishedListings({ limit: 1, sort: 'newest' });
    execute.mockResolvedValueOnce([listingRow('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '2026-08-06 08:00:00+00')]);
    const second = await repository.listPublishedListings({
      cursor: first.nextCursor!,
      limit: 1,
      sort: 'newest',
    });

    expect(second.items.map((item) => item.publicId)).toEqual(['dddddddd-dddd-4ddd-8ddd-ddddddddddd2']);
    expect(second.nextCursor).toBeUndefined();
    const [, parameters] = execute.mock.calls[1] as [string, unknown[]];
    expect(parameters).toContain('2026-08-07T08:00:00.000Z');
    expect(parameters).toContain('dddddddd-dddd-4ddd-8ddd-ddddddddddd1');
  });

  it('fails loudly when PostgreSQL returns a timestamp the cursor cannot represent', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      listingRow('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'not-a-timestamp'),
      listingRow('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'not-a-timestamp'),
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    await expect(repository.listPublishedListings({ limit: 1, sort: 'newest' })).rejects.toThrow(
      /unparseable timestamp/u,
    );
  });

  /**
   * The rating a public listing publishes. This is the only place the aggregate
   * columns become the number a catalog card prints, so both the rounding and
   * the unrated case are pinned here rather than in the renderer.
   */
  it('publishes a one-decimal average beside the count it was derived from', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([
      listingRow('ffffffff-ffff-4fff-8fff-fffffffffff1', driverTimestamp, { ratingSum: 14, reviewCount: 3 }),
    ]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const page = await repository.listPublishedListings({ limit: 10, sort: 'newest' });

    // 14 / 3 is 4.666…: a true quotient and an unpublishable number.
    expect(page.items[0]?.rating).toEqual({ average: 4.7, count: 3 });
  });

  it('publishes a null average and a zero count for a listing nobody has reviewed', async () => {
    const { em, execute } = entityManager();
    execute.mockResolvedValueOnce([listingRow('ffffffff-ffff-4fff-8fff-fffffffffff2', driverTimestamp)]);
    const repository = new PostgresMarketplacePublicRepository(em as unknown as EntityManager);

    const page = await repository.listPublishedListings({ limit: 10, sort: 'newest' });

    expect(page.items[0]?.rating).toEqual({ average: null, count: 0 });
  });
});
