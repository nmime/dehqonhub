// @requirements REQ-AGRITECH-PUBLIC-018
import { randomUUID } from 'node:crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { type PostgreSqlDriver } from '@mikro-orm/postgresql';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import type {
  AgriTechOwner,
  MarketplaceListingPublication,
  MarketplacePublicCatalogCursor,
} from '@app/backend-feature-agritech-shared';
import {
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  FarmerEntitySchema,
  MarketplaceCommerceOperationEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceProduceOrganizationBindingEntitySchema,
  MarketplacePublicationModerationOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestOrganizationBindingEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  ProduceListingEntitySchema,
  ProductEntitySchema,
  VerificationEntitySchema,
} from '../entities';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceRepository } from './marketplace.repository';
import { PostgresMarketplacePublicRepository } from './marketplace-public.repository';
import { PostgresAgriTechOperationsRepository } from './operations.repository';

const publicationMigration = 'Migration20260810130000AddMarketplacePublications';
const previousMigration = 'Migration20260810124500AddMarketplaceVerificationProviders';

describe('AgriTech public marketplace PostgreSQL projection', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;
  const legacyProductId = randomUUID();

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error(
        'AgriTech public marketplace PostgreSQL component evidence requires an available Docker runtime; skipping is forbidden.',
      );
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, publicMarketplaceEntities, {
        extensions: [Migrator],
        migrations: agritechMigrationOptions,
      }),
    );
    await orm.migrator.up({ to: previousMigration });
    await insertProduct(orm.em, {
      id: legacyProductId,
      name: 'Legacy private seed',
      supplierId: randomUUID(),
      tenantId: 'tenant-public-opt-in',
    });
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm?.close(true);
    await stopPostgresContainer(container);
  });

  it('keeps pre-existing private sources unpublished after the opt-in migration', async () => {
    const database = requireOrm(orm);
    expect(
      await rows<{ count: number }>(database.em, `select count(*)::int as count from marketplace_listing_publications`),
    ).toEqual([{ count: 0 }]);
    expect(
      await rows<{ count: number }>(database.em, `select count(*)::int as count from products where id = ?`, [
        legacyProductId,
      ]),
    ).toEqual([{ count: 1 }]);
    await expect(publicRepository(database).listPublishedListings({ limit: 20, sort: 'newest' })).resolves.toEqual({
      items: [],
    });
  });

  it('pins immutable seller revisions and serializes independent profile and listing moderation', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-public-moderation';
    const owner = { tenantId, userId: 'seller-moderation' };
    const supplierPartnerId = randomUUID();
    const otherSupplierPartnerId = randomUUID();
    const firstProductId = randomUUID();
    const secondProductId = randomUUID();
    await insertPartner(database.em, {
      id: supplierPartnerId,
      legalName: 'Original Farm Cooperative',
      ownerUserId: owner.userId,
      tenantId,
    });
    await insertPartner(database.em, {
      id: otherSupplierPartnerId,
      legalName: 'Other Same-user Cooperative',
      ownerUserId: owner.userId,
      tenantId,
    });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: owner.userId });
    await insertProduct(database.em, {
      id: firstProductId,
      name: 'Moderated corn seed',
      priceUzs: 4_200_000,
      supplierId: supplierPartnerId,
      tenantId,
    });

    const repository = publicRepository(database);
    await expect(
      repository.publishListing(owner, 'wrong-same-user-organization', {
        section: 'seeds',
        sellerPartnerId: otherSupplierPartnerId,
        sourceId: firstProductId,
        sourceKind: 'product',
      }),
    ).resolves.toEqual({ status: 'not_found' });
    await expect(
      repository.publishListing({ tenantId: 'foreign-tenant', userId: owner.userId }, 'wrong-tenant-organization', {
        section: 'seeds',
        sellerPartnerId: supplierPartnerId,
        sourceId: firstProductId,
        sourceKind: 'product',
      }),
    ).resolves.toEqual({ status: 'partner_unapproved' });

    const firstPublication = valueOf(
      await repository.publishListing(owner, 'publish-first-product', {
        section: 'seeds',
        sellerPartnerId: supplierPartnerId,
        sourceId: firstProductId,
        sourceKind: 'product',
      }),
    );
    await expect(repository.findPublishedListing(firstPublication.id)).resolves.toBeUndefined();
    const initialQueue = await repository.listPendingModeration(tenantId);
    expect(initialQueue).toMatchObject({
      listings: [
        {
          publication: { id: firstPublication.id, moderationStatus: 'pending', revision: 0 },
          seller: {
            contentRevision: 1,
            displayName: 'Original Farm Cooperative',
            moderationStatus: 'pending',
          },
        },
      ],
      sellerProfiles: [
        {
          contentRevision: 1,
          displayName: 'Original Farm Cooperative',
          moderationStatus: 'pending',
        },
      ],
    });
    const sellerPublicId = initialQueue.sellerProfiles[0]?.sellerPublicId;
    const initialSellerProfile = initialQueue.sellerProfiles[0];
    const initialListingQueueItem = initialQueue.listings[0];
    if (!sellerPublicId || !initialSellerProfile || !initialListingQueueItem) {
      throw new Error('The seller profile must be queued independently from its listing.');
    }

    await expect(
      database.em.getConnection().execute(
        `update marketplace_public_seller_revisions
            set display_name = 'Tampered Farm', description = 'Tampered content',
                content_fingerprint = repeat('0', 64)
          where seller_public_id = ? and content_revision = 1`,
        [sellerPublicId],
      ),
    ).rejects.toThrow(/marketplace public seller revision content is immutable/u);

    await expect(
      repository.reviewListingPublication(tenantId, firstPublication.id, 'reviewer-before-profile', {
        decision: 'approved',
        expectedRevision: 0,
        expectedSellerContentFingerprint: initialListingQueueItem.seller.contentFingerprint,
        expectedSellerContentRevision: 1,
        idempotencyKey: 'listing-before-profile',
      }),
    ).resolves.toEqual({ status: 'conflict', field: 'sellerProfile' });

    const profileApprovalInput = {
      decision: 'approved' as const,
      expectedContentFingerprint: initialSellerProfile.contentFingerprint,
      expectedContentRevision: 1,
      idempotencyKey: 'approve-profile-one',
    };
    const profileApproval = await repository.reviewSellerProfile(
      tenantId,
      sellerPublicId,
      'profile-reviewer',
      profileApprovalInput,
    );
    expect(profileApproval).toMatchObject({ status: 'ok', value: { moderationStatus: 'approved' } });
    await expect(
      repository.reviewSellerProfile(tenantId, sellerPublicId, 'profile-reviewer', profileApprovalInput),
    ).resolves.toEqual(profileApproval);
    await expect(
      repository.reviewSellerProfile(tenantId, sellerPublicId, 'profile-reviewer', {
        ...profileApprovalInput,
        decision: 'rejected',
      }),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    await expect(repository.findPublishedListing(firstPublication.id)).resolves.toBeUndefined();

    const competingListingReviews = await Promise.all([
      repository.reviewListingPublication(tenantId, firstPublication.id, 'listing-reviewer-a', {
        decision: 'approved',
        expectedRevision: 0,
        expectedSellerContentFingerprint: initialListingQueueItem.seller.contentFingerprint,
        expectedSellerContentRevision: 1,
        idempotencyKey: 'listing-review-a',
      }),
      publicRepository(database).reviewListingPublication(tenantId, firstPublication.id, 'listing-reviewer-b', {
        decision: 'approved',
        expectedRevision: 0,
        expectedSellerContentFingerprint: initialListingQueueItem.seller.contentFingerprint,
        expectedSellerContentRevision: 1,
        idempotencyKey: 'listing-review-b',
      }),
    ]);
    expect(competingListingReviews.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(competingListingReviews.filter(({ status }) => status === 'conflict')).toHaveLength(1);
    const approvedListing = await repository.findPublishedListing(firstPublication.id);
    expect(approvedListing).toMatchObject({
      publicId: firstPublication.id,
      sellerDisplayName: 'Original Farm Cooperative',
    });

    await database.em
      .getConnection()
      .execute(
        `update agritech_partners set legal_name = 'Renamed Farm Cooperative', updated_at = now() where id = ?`,
        [supplierPartnerId],
      );
    await insertProduct(database.em, {
      id: secondProductId,
      name: 'Second corn seed',
      priceUzs: 4_300_000,
      supplierId: supplierPartnerId,
      tenantId,
    });
    const secondPublication = valueOf(
      await publicRepository(database).publishListing(owner, 'publish-second-product', {
        section: 'seeds',
        sellerPartnerId: supplierPartnerId,
        sourceId: secondProductId,
        sourceKind: 'product',
      }),
    );
    const revisedQueue = await publicRepository(database).listPendingModeration(tenantId);
    expect(revisedQueue.sellerProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentRevision: 2,
          displayName: 'Renamed Farm Cooperative',
          moderationStatus: 'pending',
          sellerPublicId,
        }),
      ]),
    );
    expect(revisedQueue.listings.find(({ publication }) => publication.id === secondPublication.id)).toMatchObject({
      publication: { id: secondPublication.id, sellerPublicId },
      seller: { contentRevision: 2, displayName: 'Renamed Farm Cooperative' },
    });
    await expect(publicRepository(database).findPublishedListing(firstPublication.id)).resolves.toMatchObject({
      sellerDisplayName: 'Original Farm Cooperative',
    });

    const revisedSellerProfile = revisedQueue.sellerProfiles.find(({ contentRevision }) => contentRevision === 2);
    if (!revisedSellerProfile) {
      throw new Error('The changed organization identity must create a second immutable seller revision.');
    }
    await expect(
      publicRepository(database).reviewSellerProfile(tenantId, sellerPublicId, 'profile-reviewer-two', {
        decision: 'rejected',
        expectedContentFingerprint: revisedSellerProfile.contentFingerprint,
        expectedContentRevision: 2,
        idempotencyKey: 'reject-profile-two',
      }),
    ).resolves.toMatchObject({ status: 'ok', value: { moderationStatus: 'rejected' } });
    await expect(publicRepository(database).findPublishedListing(secondPublication.id)).resolves.toBeUndefined();
    expect(
      await rows<{ moderationStatus: string; status: string }>(
        database.em,
        `select moderation_status as "moderationStatus", status
           from marketplace_listing_publications where id = ?`,
        [secondPublication.id],
      ),
    ).toEqual([{ moderationStatus: 'rejected', status: 'rejected' }]);
    await expect(publicRepository(database).findPublishedListing(firstPublication.id)).resolves.toMatchObject({
      sellerDisplayName: 'Original Farm Cooperative',
    });
  });

  it('persists exact produce and request organization bindings and rejects corrupt tuples', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-public-bindings';
    const seller = { tenantId, userId: 'produce-seller' };
    const buyer = { tenantId, userId: 'request-buyer' };
    const supplierPartnerId = randomUUID();
    const otherSupplierPartnerId = randomUUID();
    const buyerPartnerId = randomUUID();
    const otherBuyerPartnerId = randomUUID();
    const farmerId = randomUUID();
    await insertPartner(database.em, {
      id: supplierPartnerId,
      legalName: 'Bound Produce Farm',
      ownerUserId: seller.userId,
      tenantId,
    });
    await insertPartner(database.em, {
      id: otherSupplierPartnerId,
      legalName: 'Wrong Produce Farm',
      ownerUserId: seller.userId,
      tenantId,
    });
    await insertPartner(database.em, {
      id: buyerPartnerId,
      kind: 'buyer',
      legalName: 'Bound Buyer Organization',
      ownerUserId: buyer.userId,
      tenantId,
    });
    await insertPartner(database.em, {
      id: otherBuyerPartnerId,
      kind: 'buyer',
      legalName: 'Wrong Buyer Organization',
      ownerUserId: buyer.userId,
      tenantId,
    });
    await insertFarmer(database.em, { id: farmerId, tenantId, userId: seller.userId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: seller.userId });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyer.userId });

    const produce = valueOf(
      await new PostgresAgriTechOperationsRepository(database.em.fork()).createProduceListing(seller, {
        availableFrom: new Date(Date.now() - 60_000),
        availableUntil: new Date(Date.now() + 86_400_000),
        crop: 'Wheat',
        grade: 'A',
        pricePerKgUzs: 7_500,
        quantityKg: 2_000,
        region: 'Samarkand',
        supplierPartnerId,
      }),
    );
    expect(
      await rows<{
        farmerId: string;
        ownerUserId: string;
        supplierPartnerId: string;
        tenantId: string;
      }>(
        database.em,
        `select tenant_id as "tenantId", farmer_id as "farmerId", owner_user_id as "ownerUserId",
                supplier_partner_id as "supplierPartnerId"
           from marketplace_produce_organization_bindings where produce_listing_id = ?`,
        [produce.id],
      ),
    ).toEqual([{ farmerId, ownerUserId: seller.userId, supplierPartnerId, tenantId }]);
    await expect(
      publicRepository(database).publishListing(seller, 'wrong-produce-partner', {
        section: 'produce',
        sellerPartnerId: otherSupplierPartnerId,
        sourceId: produce.id,
        sourceKind: 'produce',
      }),
    ).resolves.toEqual({ status: 'not_found' });
    await expect(
      publicRepository(database).publishListing(
        { tenantId: 'foreign-tenant', userId: seller.userId },
        'foreign-produce-tenant',
        {
          section: 'produce',
          sellerPartnerId: supplierPartnerId,
          sourceId: produce.id,
          sourceKind: 'produce',
        },
      ),
    ).resolves.toEqual({ status: 'partner_unapproved' });
    const producePublication = valueOf(
      await publicRepository(database).publishListing(seller, 'publish-bound-produce', {
        section: 'produce',
        sellerPartnerId: supplierPartnerId,
        sourceId: produce.id,
        sourceKind: 'produce',
      }),
    );
    await expect(publicRepository(database).findPublishedListing(producePublication.id)).resolves.toBeUndefined();
    await expect(
      database.em
        .getConnection()
        .execute(
          `update marketplace_produce_organization_bindings set supplier_partner_id = ? where produce_listing_id = ?`,
          [otherSupplierPartnerId, produce.id],
        ),
    ).rejects.toThrow(/marketplace source organization binding is immutable/u);
    await expect(
      database.em
        .getConnection()
        .execute(`update produce_listings set tenant_id = 'foreign-tenant' where id = ?`, [produce.id]),
    ).rejects.toThrow(/marketplace bound produce identity is immutable/u);

    const request = valueOf(
      await new PostgresMarketplaceRepository(database.em.fork()).createRequest(
        buyer,
        {
          budgetUzs: 8_000_000,
          actingPartnerId: buyerPartnerId,
          product: 'Corn seed',
          region: 'Samarkand',
          title: 'Ten tons of certified corn seed',
          volume: '10 tons',
        },
        'request-public-binding',
      ),
    );
    expect(
      await rows<{ buyerPartnerId: string; buyerUserId: string; tenantId: string }>(
        database.em,
        `select tenant_id as "tenantId", buyer_user_id as "buyerUserId", buyer_partner_id as "buyerPartnerId"
           from marketplace_request_organization_bindings where request_id = ?`,
        [request.id],
      ),
    ).toEqual([{ buyerPartnerId, buyerUserId: buyer.userId, tenantId }]);
    await expect(
      publicRepository(database).publishRequest(buyer, 'wrong-request-partner', {
        buyerPartnerId: otherBuyerPartnerId,
        requestId: request.id,
      }),
    ).resolves.toEqual({ status: 'not_found' });
    await expect(
      publicRepository(database).publishRequest(
        { tenantId: 'foreign-tenant', userId: buyer.userId },
        'foreign-request-tenant',
        { buyerPartnerId, requestId: request.id },
      ),
    ).resolves.toEqual({ status: 'forbidden' });
    const requestPublication = valueOf(
      await publicRepository(database).publishRequest(buyer, 'publish-bound-request', {
        buyerPartnerId,
        requestId: request.id,
      }),
    );
    await expect(publicRepository(database).listPublishedRequests({ limit: 20 })).resolves.toEqual({ items: [] });
    const requestApproval = await publicRepository(database).reviewRequestPublication(
      tenantId,
      requestPublication.id,
      'request-reviewer',
      {
        decision: 'approved',
        expectedRevision: 0,
        idempotencyKey: 'approve-bound-request',
      },
    );
    expect(requestApproval).toMatchObject({ status: 'ok', value: { moderationStatus: 'approved', revision: 1 } });
    await expect(
      publicRepository(database).reviewRequestPublication(tenantId, requestPublication.id, 'request-reviewer', {
        decision: 'approved',
        expectedRevision: 0,
        idempotencyKey: 'approve-bound-request',
      }),
    ).resolves.toEqual(requestApproval);
    await expect(publicRepository(database).listPublishedRequests({ limit: 20 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          buyerDisplayName: 'Bound Buyer Organization',
          publicId: requestPublication.id,
        }),
      ],
    });
    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_request_organization_bindings set buyer_partner_id = ? where request_id = ?`, [
          otherBuyerPartnerId,
          request.id,
        ]),
    ).rejects.toThrow(/marketplace source organization binding is immutable/u);
    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_requests set buyer_user_id = 'attacker' where id = ?`, [request.id]),
    ).rejects.toThrow(/marketplace bound request identity is immutable/u);
    await expect(
      database.em
        .getConnection()
        .execute(`update agritech_partners set kind = 'supplier', updated_at = now() where id = ?`, [buyerPartnerId]),
    ).rejects.toThrow(/marketplace membership parent identity is immutable/u);
    await expect(
      publicRepository(database).listPublishedRequests({ limit: 20, query: 'Ten tons of certified corn seed' }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ publicId: requestPublication.id })] });
  });

  it('fails closed for corrupt publication tuples and incompatible parent organization kinds', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-public-fail-closed';
    const owner = { tenantId, userId: 'seller-fail-closed' };
    const partnerId = randomUUID();
    const productId = randomUUID();
    await insertPartner(database.em, {
      id: partnerId,
      legalName: 'Fail Closed Farm',
      ownerUserId: owner.userId,
      tenantId,
    });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: owner.userId });
    await insertProduct(database.em, { id: productId, supplierId: partnerId, tenantId });
    const publication = await publishAndApproveProduct(database, owner, partnerId, productId, 'fail-closed');
    await expect(publicRepository(database).findPublishedListing(publication.id)).resolves.toBeDefined();

    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_listing_publications set owner_user_id = 'attacker' where id = ?`, [
          publication.id,
        ]),
    ).rejects.toThrow(/marketplace listing seller mismatch/u);
    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_public_sellers set owner_user_id = 'attacker' where id = ?`, [
          publication.sellerPublicId,
        ]),
    ).rejects.toThrow(/marketplace public seller organization mismatch/u);

    await expect(
      database.em
        .getConnection()
        .execute(`update products set supplier_id = ? where id = ?`, [randomUUID(), productId]),
    ).rejects.toThrow(/marketplace published product identity is immutable/u);
    await expect(
      database.em
        .getConnection()
        .execute(`update agritech_partners set kind = 'buyer', updated_at = now() where id = ?`, [partnerId]),
    ).rejects.toThrow(/marketplace membership parent identity is immutable/u);
    await expect(publicRepository(database).findPublishedListing(publication.id)).resolves.toBeDefined();

    await database.em
      .getConnection()
      .execute(`update agritech_partners set status = 'suspended', updated_at = now() where id = ?`, [partnerId]);
    await expect(publicRepository(database).findPublishedListing(publication.id)).resolves.toBeUndefined();
    await expect(publicRepository(database).findPublishedSeller(publication.sellerPublicId)).resolves.toBeUndefined();
  });

  it('uses duplicate-free price keysets and applies bounded catalog filters to live sources', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-public-keyset';
    const owner = { tenantId, userId: 'seller-keyset' };
    const partnerId = randomUUID();
    const farmerId = randomUUID();
    await insertPartner(database.em, {
      id: partnerId,
      legalName: 'Keyset Farm',
      ownerUserId: owner.userId,
      tenantId,
    });
    await insertFarmer(database.em, { id: farmerId, tenantId, userId: owner.userId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: owner.userId });
    const productInputs = [
      {
        category: 'seed' as const,
        name: 'Keyset Alpha corn',
        priceUzs: 100,
        region: 'Keyset Samarkand',
        stockQuantity: 100,
      },
      {
        category: 'seed' as const,
        name: 'Keyset Beta corn',
        priceUzs: 200,
        region: 'Keyset Samarkand',
        stockQuantity: 75,
      },
      {
        category: 'seed' as const,
        name: 'Keyset Gamma corn',
        priceUzs: 200,
        region: 'Keyset Samarkand',
        stockQuantity: 25,
      },
      {
        category: 'equipment' as const,
        name: 'Keyset Delta cultivator',
        priceUzs: 300,
        region: 'Keyset Tashkent',
        stockQuantity: 5,
      },
    ];
    const publications = await serialMap(productInputs, async (input, index) => {
      const productId = randomUUID();
      await insertProduct(database.em, { ...input, id: productId, supplierId: partnerId, tenantId });
      return valueOf(
        await publicRepository(database).publishListing(owner, `keyset-product-${index}`, {
          section: input.category === 'equipment' ? 'equipment' : 'seeds',
          sellerPartnerId: partnerId,
          sourceId: productId,
          sourceKind: 'product',
        }),
      );
    });
    const produce = valueOf(
      await new PostgresAgriTechOperationsRepository(database.em.fork()).createProduceListing(owner, {
        availableFrom: new Date(Date.now() - 60_000),
        availableUntil: new Date(Date.now() + 86_400_000),
        crop: 'Keyset Wheat',
        grade: 'B',
        pricePerKgUzs: 150,
        quantityKg: 60,
        region: 'Keyset Samarkand',
        supplierPartnerId: partnerId,
      }),
    );
    publications.push(
      valueOf(
        await publicRepository(database).publishListing(owner, 'keyset-produce', {
          section: 'produce',
          sellerPartnerId: partnerId,
          sourceId: produce.id,
          sourceKind: 'produce',
        }),
      ),
    );
    await approveSellerAndListings(database, tenantId, publications);

    const firstPage = await publicRepository(database).listPublishedListings({
      limit: 2,
      query: 'Keyset',
      sort: 'price_asc',
    });
    const secondPage = await publicRepository(database).listPublishedListings({
      cursor: requiredCursor(firstPage.nextCursor),
      limit: 2,
      query: 'Keyset',
      sort: 'price_asc',
    });
    const thirdPage = await publicRepository(database).listPublishedListings({
      cursor: requiredCursor(secondPage.nextCursor),
      limit: 2,
      query: 'Keyset',
      sort: 'price_asc',
    });
    const allItems = [...firstPage.items, ...secondPage.items, ...thirdPage.items];
    expect(allItems.map(({ priceUzs }) => priceUzs)).toEqual([100, 150, 200, 200, 300]);
    expect(new Set(allItems.map(({ publicId }) => publicId)).size).toBe(5);
    expect(thirdPage.nextCursor).toBeUndefined();

    await expect(
      publicRepository(database).listPublishedListings({
        limit: 20,
        maxPriceUzs: 200,
        minAvailableQuantity: 50,
        minPriceUzs: 150,
        query: 'Keyset',
        region: 'Keyset Samarkand',
        sort: 'price_asc',
      }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ priceUzs: 150, produceCrop: 'Keyset Wheat', sourceKind: 'produce' }),
        expect.objectContaining({ priceUzs: 200, title: 'Keyset Beta corn' }),
      ],
    });
    await expect(
      publicRepository(database).listPublishedListings({
        category: 'seed',
        limit: 20,
        query: 'Keyset',
        section: 'seeds',
        sort: 'price_asc',
      }),
    ).resolves.toMatchObject({ items: [{ priceUzs: 100 }, { priceUzs: 200 }, { priceUzs: 200 }] });
    await expect(
      publicRepository(database).listPublishedListings({
        crop: 'Keyset Wheat',
        limit: 20,
        query: 'Keyset',
        sort: 'newest',
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ produceCrop: 'Keyset Wheat' })] });

    const liveSourcePublication = publications[0];
    if (!liveSourcePublication) {
      throw new Error('The keyset fixture must include a source-backed product publication.');
    }
    await database.em
      .getConnection()
      .execute(`update products set stock_quantity = 0 where id = ?`, [liveSourcePublication.sourceId]);
    await expect(publicRepository(database).findPublishedListing(liveSourcePublication.id)).resolves.toBeUndefined();
  });

  it('rolls the publication migration down and up without backfilling private sources', async () => {
    const database = requireOrm(orm);
    await database.migrator.down({ to: previousMigration });
    expect(
      await rows<{ relation: string | null }>(
        database.em,
        `select to_regclass('public.marketplace_listing_publications')::text as relation`,
      ),
    ).toEqual([{ relation: null }]);
    expect(
      await rows<{ count: number }>(database.em, `select count(*)::int as count from products where id = ?`, [
        legacyProductId,
      ]),
    ).toEqual([{ count: 1 }]);

    await database.migrator.up({ migrations: [publicationMigration] });
    expect(
      await rows<{ count: number }>(database.em, `select count(*)::int as count from marketplace_listing_publications`),
    ).toEqual([{ count: 0 }]);
    expect(
      await rows<{ relation: string | null }>(
        database.em,
        `select to_regclass('public.marketplace_public_seller_revisions')::text as relation`,
      ),
    ).toEqual([{ relation: 'marketplace_public_seller_revisions' }]);
  });
});

function requireOrm(orm: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!orm) {
    throw new Error('AgriTech public marketplace PostgreSQL database was not initialized.');
  }
  return orm;
}

function publicRepository(database: MikroORM<PostgreSqlDriver>): PostgresMarketplacePublicRepository {
  return new PostgresMarketplacePublicRepository(database.em.fork());
}

function valueOf<T>(result: { status: string; value?: T }): T {
  if (result.status !== 'ok' || result.value === undefined) {
    throw new Error(`Expected an ok persistence result, received ${JSON.stringify(result)}.`);
  }
  return result.value;
}

function requiredCursor(cursor: MarketplacePublicCatalogCursor | undefined): MarketplacePublicCatalogCursor {
  if (!cursor) {
    throw new Error('The bounded catalog page must expose a keyset cursor.');
  }
  return cursor;
}

async function publishAndApproveProduct(
  database: MikroORM<PostgreSqlDriver>,
  owner: AgriTechOwner,
  partnerId: string,
  productId: string,
  keyPrefix: string,
): Promise<MarketplaceListingPublication> {
  const publication = valueOf(
    await publicRepository(database).publishListing(owner, `${keyPrefix}-publish`, {
      section: 'seeds',
      sellerPartnerId: partnerId,
      sourceId: productId,
      sourceKind: 'product',
    }),
  );
  await approveSellerAndListings(database, owner.tenantId, [publication]);
  return publication;
}

async function approveSellerAndListings(
  database: MikroORM<PostgreSqlDriver>,
  tenantId: string,
  publications: MarketplaceListingPublication[],
): Promise<void> {
  const repository = publicRepository(database);
  const queue = await repository.listPendingModeration(tenantId);
  await serialMap(queue.sellerProfiles, async (profile) => {
    valueOf(
      await repository.reviewSellerProfile(tenantId, profile.sellerPublicId, 'component-profile-reviewer', {
        decision: 'approved',
        expectedContentFingerprint: profile.contentFingerprint,
        expectedContentRevision: profile.contentRevision,
        idempotencyKey: `approve-profile-${profile.sellerPublicId}-${profile.contentRevision}`,
      }),
    );
  });
  await serialMap(publications, async (publication) => {
    const queued = queue.listings.find(({ publication: item }) => item.id === publication.id);
    if (!queued) {
      throw new Error(`Publication ${publication.id} was not queued for moderation.`);
    }
    valueOf(
      await publicRepository(database).reviewListingPublication(
        tenantId,
        publication.id,
        'component-listing-reviewer',
        {
          decision: 'approved',
          expectedRevision: queued.publication.revision,
          expectedSellerContentFingerprint: queued.seller.contentFingerprint,
          expectedSellerContentRevision: queued.seller.contentRevision,
          idempotencyKey: `approve-listing-${publication.id}`,
        },
      ),
    );
  });
}

async function serialMap<Input, Output>(
  values: readonly Input[],
  map: (value: Input, index: number) => Promise<Output>,
  index = 0,
  results: Output[] = [],
): Promise<Output[]> {
  if (index >= values.length) {
    return results;
  }
  const value = values[index];
  if (value === undefined) {
    return results;
  }
  results.push(await map(value, index));
  return serialMap(values, map, index + 1, results);
}

async function insertPartner(
  em: EntityManager,
  input: {
    id: string;
    kind?: 'buyer' | 'supplier';
    legalName: string;
    ownerUserId: string;
    tenantId: string;
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [
      input.id,
      input.tenantId,
      input.ownerUserId,
      input.kind ?? 'supplier',
      input.legalName,
      input.id.replaceAll('-', '').slice(0, 20),
    ],
  );
}

async function insertVerification(
  em: EntityManager,
  input: { role: 'buyer' | 'farmer' | 'seller'; tenantId: string; userId: string },
): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', 'verified', true, 'legacy', 'legacy_unknown', '[]'::jsonb, now(), now())`,
    [randomUUID(), input.tenantId, input.userId, input.role],
  );
}

async function insertFarmer(em: EntityManager, input: { id: string; tenantId: string; userId: string }): Promise<void> {
  await em.getConnection().execute(
    `insert into farmers
      (id, tenant_id, user_id, phone, first_name, last_name, region, farm_size_hectares,
       crops, status, created_at, updated_at)
     values (?, ?, ?, ?, 'Public', 'Farmer', 'Samarkand', 10, '["wheat"]'::jsonb,
             'active', now(), now())`,
    [input.id, input.tenantId, input.userId, `+998${input.id.replaceAll('-', '').slice(0, 9)}`],
  );
}

async function insertProduct(
  em: EntityManager,
  input: {
    category?: 'equipment' | 'seed';
    id: string;
    name?: string;
    priceUzs?: number;
    region?: string;
    stockQuantity?: number;
    supplierId: string;
    tenantId: string;
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, name_ru, name_uz, name_uz_cyrl, category, description,
       supplier_id, supplier_name, price_uzs, unit, stock_quantity, region, status, images,
       created_at, updated_at)
     values (?, ?, ?, null, null, null, ?, 'Certified source', ?, 'Supplier', ?, 'kg', ?, ?,
             'active', '[]'::jsonb, now(), now())`,
    [
      input.id,
      input.tenantId,
      input.name ?? 'Corn seed',
      input.category ?? 'seed',
      input.supplierId,
      input.priceUzs ?? 500_000,
      input.stockQuantity ?? 100,
      input.region ?? 'Samarkand',
    ],
  );
}

async function rows<T>(em: EntityManager, sql: string, parameters: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, parameters)) as T[];
}

const publicMarketplaceEntities = [
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  FarmerEntitySchema,
  MarketplaceCommerceOperationEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceProduceOrganizationBindingEntitySchema,
  MarketplacePublicationModerationOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestOrganizationBindingEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  ProduceListingEntitySchema,
  ProductEntitySchema,
  VerificationEntitySchema,
];
