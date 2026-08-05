// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { randomUUID } from 'node:crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import {
  marketplaceUtcMonthKey,
  marketplaceUtcSeasonKey,
  type AgriTechOwner,
  type OperationResult,
} from '@app/backend-feature-agritech-shared';
import {
  AgriTechPartnerEntitySchema,
  ContractEntitySchema,
  MarketplaceContractReviewEligibilityEntitySchema,
  MarketplaceEngagementEventEntitySchema,
  MarketplaceEngagementNotificationIntentEntitySchema,
  MarketplaceEngagementOperationEntitySchema,
  MarketplaceLegacyFavoriteArchiveEntitySchema,
  MarketplaceLegacyFavoriteArchiveEntity,
  MarketplaceLegacyReviewArchiveEntitySchema,
  MarketplaceLegacySampleRequestArchiveEntitySchema,
  MarketplaceListingFavoriteEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplaceListingReviewEntitySchema,
  MarketplaceListingSampleEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceReviewAggregateEntitySchema,
  MarketplaceReviewAggregateEntity,
  MarketplaceReviewReplyEntitySchema,
  MarketplaceReviewReportEntitySchema,
  MarketplaceSampleMonthlyUsageEntitySchema,
  MarketplaceSamplePolicyEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  VerificationEntitySchema,
} from '../entities';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceEngagementRepository } from './marketplace-engagement.repository';

const previousMigration = 'Migration20260810137000AddMarketplaceDisputeEvidence';
const engagementMigration = 'Migration20260810138000AddMarketplaceEngagement';

describe('marketplace engagement PostgreSQL boundary', { sequential: true }, () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error('Marketplace engagement PostgreSQL evidence requires Docker; skipping is forbidden.');
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, engagementEntities, {
        extensions: [Migrator],
        migrations: agritechMigrationOptions,
      }),
    );
    await orm.migrator.up({ to: previousMigration });
    await seedLegacyEngagement(requireOrm(orm).em);
    await orm.migrator.up({ migrations: [engagementMigration] });
  }, 120_000);

  afterAll(async () => {
    await orm?.close(true);
    await stopPostgresContainer(container);
  });

  it('retains populated legacy history through up, down, and up and registers archive/aggregate metadata', async () => {
    const database = requireOrm(orm);
    expect(await archiveCounts(database.em)).toEqual({ favorites: 1, reviews: 1, samples: 1 });
    expect(database.getMetadata().get(MarketplaceReviewAggregateEntity).primaryKeys).toEqual(['listingPublicationId']);
    expect(database.getMetadata().get(MarketplaceLegacyFavoriteArchiveEntity).tableName).toBe(
      'marketplace_legacy_favorites_archive',
    );

    await database.migrator.down({ migrations: [engagementMigration] });
    expect(
      await rows<{ favorites: number; reviews: number; samples: number }>(
        database.em,
        `select
          (select count(*)::int from marketplace_favorites) as favorites,
          (select count(*)::int from marketplace_reviews) as reviews,
          (select count(*)::int from marketplace_sample_requests) as samples`,
      ),
    ).toEqual([{ favorites: 1, reviews: 1, samples: 1 }]);

    await database.migrator.up({ migrations: [engagementMigration] });
    expect(await archiveCounts(database.em)).toEqual({ favorites: 1, reviews: 1, samples: 1 });
  });

  it('scopes one idempotency key to actor and operation across resources and safely omits hidden favorites', async () => {
    const database = requireOrm(orm);
    await ensureAuthUsersTable(database.em);
    const seller = uniqueOwner('seller-favorite');
    const sellerPartnerId = randomUUID();
    await insertParty(database.em, seller, sellerPartnerId, 'supplier');
    const publications = await insertCatalog(database.em, seller, sellerPartnerId, 2, 'favorite');
    const firstPublication = requireAt(publications, 0, 'first favorite publication');
    const secondPublication = requireAt(publications, 1, 'second favorite publication');
    const actor = uniqueOwner('favorite-actor');
    const sharedKey = 'favorite-shared-key-0001';

    const results = await Promise.all([
      repository(database).addFavorite(actor, firstPublication.publicationId, sharedKey),
      repository(database).addFavorite(actor, secondPublication.publicationId, sharedKey),
    ]);
    expect(statuses(results)).toEqual(['conflict', 'ok']);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_engagement_operations
          where actor_tenant_id = ? and actor_user_id = ? and operation = 'favorite_add' and idempotency_key = ?`,
        [actor.tenantId, actor.userId, sharedKey],
      ),
    ).toEqual([{ count: 1 }]);

    const successfulResult = results.find(({ status }) => status === 'ok');
    if (!successfulResult) {
      throw new Error('Favorite race did not produce a successful result.');
    }
    const successfulListingId = valueOf(successfulResult).listingPublicationId;
    await expect(repository(database).addFavorite(actor, successfulListingId, sharedKey)).resolves.toMatchObject({
      status: 'ok',
      value: { listingPublicationId: successfulListingId },
    });
    const otherListing = publications.find(({ publicationId }) => publicationId !== successfulListingId);
    if (!otherListing) {
      throw new Error('Favorite race did not retain a competing listing.');
    }
    const otherListingId = otherListing.publicationId;
    await expect(repository(database).addFavorite(actor, otherListingId, sharedKey)).resolves.toEqual({
      field: 'idempotencyKey',
      status: 'conflict',
    });
    await expect(
      repository(database).listFavorites({ ...actor, tenantId: `${actor.tenantId}-foreign` }),
    ).resolves.toEqual([]);

    await database.em
      .getConnection()
      .execute(`update marketplace_listing_publications set status = 'paused', updated_at = now() where id = ?`, [
        successfulListingId,
      ]);
    await expect(repository(database).listFavorites(actor)).resolves.toEqual([]);
  });

  it('serializes monthly quota and source-season uniqueness and rejects raw identity corruption', async () => {
    const database = requireOrm(orm);
    await ensureAuthUsersTable(database.em);
    const seller = uniqueOwner('seller-sample');
    const buyer = uniqueOwner('buyer-sample');
    const sellerPartnerId = randomUUID();
    const buyerPartnerId = randomUUID();
    await insertParty(database.em, seller, sellerPartnerId, 'supplier');
    await insertParty(database.em, buyer, buyerPartnerId, 'buyer');
    const publications = await insertCatalog(database.em, seller, sellerPartnerId, 6, 'sample');
    const firstPublication = requireAt(publications, 0, 'first sample publication');
    const secondPublication = requireAt(publications, 1, 'second sample publication');
    const fifthPublication = requireAt(publications, 4, 'fifth sample publication');
    const sixthPublication = requireAt(publications, 5, 'sixth sample publication');

    for (const [index, publication] of publications.slice(0, 4).entries()) {
      // eslint-disable-next-line no-await-in-loop
      const result = await repository(database).requestSample(
        buyer,
        { deliveryMethod: 'pickup', listingPublicationId: publication.publicationId },
        `sample-seed-key-000${index + 1}`,
      );
      expect(result.status).toBe('ok');
    }
    const quotaRace = await Promise.all([
      repository(database).requestSample(
        buyer,
        { deliveryMethod: 'pickup', listingPublicationId: fifthPublication.publicationId },
        'sample-quota-race-0001',
      ),
      repository(database).requestSample(
        buyer,
        { deliveryMethod: 'pickup', listingPublicationId: sixthPublication.publicationId },
        'sample-quota-race-0002',
      ),
    ]);
    expect(statuses(quotaRace)).toEqual(['conflict', 'ok']);
    expect(await sampleUsage(database.em, buyer)).toEqual({ rows: 5, used: 5 });

    const rawBuyer = uniqueOwner('buyer-raw-quota');
    const rawBuyerPartnerId = randomUUID();
    await insertParty(database.em, rawBuyer, rawBuyerPartnerId, 'buyer');
    expect((await repository(database).getSampleUsage(rawBuyer)).status).toBe('ok');
    const rawPolicyId = await activePolicyId(database.em, rawBuyer.tenantId);
    for (const publication of publications.slice(0, 4)) {
      // eslint-disable-next-line no-await-in-loop
      await insertRawSample(database.em, {
        buyer: rawBuyer,
        buyerPartnerId: rawBuyerPartnerId,
        id: randomUUID(),
        listing: publication,
        policyId: rawPolicyId,
        seller,
        sellerPartnerId,
      });
    }
    const rawQuotaRace = await Promise.allSettled(
      [fifthPublication, sixthPublication].map((publication) =>
        insertRawSample(database.em.fork(), {
          buyer: rawBuyer,
          buyerPartnerId: rawBuyerPartnerId,
          id: randomUUID(),
          listing: publication,
          policyId: rawPolicyId,
          seller,
          sellerPartnerId,
        }),
      ),
    );
    expect(rawQuotaRace.map(({ status }) => status).sort((left, right) => left.localeCompare(right))).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(await sampleUsage(database.em, rawBuyer)).toEqual({ rows: 5, used: 5 });

    const duplicateBuyer = uniqueOwner('buyer-duplicate');
    const duplicateBuyerPartnerId = randomUUID();
    await insertParty(database.em, duplicateBuyer, duplicateBuyerPartnerId, 'buyer');
    const duplicateRace = await Promise.all([
      repository(database).requestSample(
        duplicateBuyer,
        { deliveryMethod: 'pickup', listingPublicationId: firstPublication.publicationId },
        'sample-source-race-0001',
      ),
      repository(database).requestSample(
        duplicateBuyer,
        { deliveryMethod: 'pickup', listingPublicationId: firstPublication.publicationId },
        'sample-source-race-0002',
      ),
    ]);
    expect(statuses(duplicateRace)).toEqual(['conflict', 'ok']);
    expect(await sampleUsage(database.em, duplicateBuyer)).toEqual({ rows: 1, used: 1 });

    const beforeCorruption = await sampleUsage(database.em, duplicateBuyer);
    await expect(
      insertRawSample(database.em, {
        buyer: duplicateBuyer,
        buyerPartnerId,
        id: randomUUID(),
        listing: secondPublication,
        policyId: await activePolicyId(database.em, duplicateBuyer.tenantId),
        seller,
        sellerPartnerId,
      }),
    ).rejects.toThrow(/incoherent/iu);
    expect(await sampleUsage(database.em, duplicateBuyer)).toEqual(beforeCorruption);

    await expect(
      database.em
        .getConnection()
        .execute(`update products set supplier_id = ? where id = ?`, [randomUUID(), firstPublication.productId]),
    ).rejects.toThrow(/engaged product identity is immutable/iu);
  });

  it('atomically consumes review eligibility, preserves exact parties, and updates aggregates under moderation', async () => {
    const database = requireOrm(orm);
    await ensureAuthUsersTable(database.em);
    const seller = uniqueOwner('seller-review');
    const sellerPartnerId = randomUUID();
    await insertParty(database.em, seller, sellerPartnerId, 'supplier');
    const [listing] = await insertCatalog(database.em, seller, sellerPartnerId, 1, 'review');
    if (!listing) {
      throw new Error('Review catalog fixture was not created.');
    }
    const buyers = [uniqueOwner('buyer-review-a'), uniqueOwner('buyer-review-b')] as const;
    const buyerPartnerIds = [randomUUID(), randomUUID()] as const;
    const eligibilityIds: string[] = [];
    for (const [index, buyer] of buyers.entries()) {
      const partnerId = buyerPartnerIds[index];
      if (!partnerId) {
        throw new Error('Review buyer partner fixture is missing.');
      }
      // eslint-disable-next-line no-await-in-loop
      await insertParty(database.em, buyer, partnerId, 'buyer');
      // eslint-disable-next-line no-await-in-loop
      const eligibilityId = await insertReviewEligibility(database.em, {
        buyer,
        buyerPartnerId: partnerId,
        listing,
        seller,
        sellerPartnerId,
      });
      eligibilityIds.push(eligibilityId);
    }

    const reviews = await Promise.all([
      repository(database).submitReview(
        buyers[0],
        { assetReferences: [], listingPublicationId: listing.publicationId, rating: 5 },
        'review-submit-key-0001',
      ),
      repository(database).submitReview(
        buyers[1],
        { assetReferences: ['public-asset:review_asset_0002'], listingPublicationId: listing.publicationId, rating: 3 },
        'review-submit-key-0002',
      ),
    ]);
    expect(statuses(reviews)).toEqual(['ok', 'ok']);
    expect(await aggregate(database.em, listing.publicationId)).toEqual({ count: 2, revision: 2, sum: 8 });

    await expect(
      insertRawReview(database.em, {
        buyer: { ...buyers[0], tenantId: `${buyers[0].tenantId}-foreign` },
        buyerPartnerId: buyerPartnerIds[0],
        eligibilityId: requireAt(eligibilityIds, 0, 'first review eligibility'),
        id: randomUUID(),
        listing,
        rating: 4,
        seller,
        sellerPartnerId,
      }),
    ).rejects.toThrow(/incoherent/iu);
    expect(await aggregate(database.em, listing.publicationId)).toEqual({ count: 2, revision: 2, sum: 8 });

    const firstReview = valueOf(reviews[0]);
    const reporter = uniqueOwner('review-reporter');
    const report = valueOf(
      await repository(database).reportReview(reporter, firstReview.id, { reason: 'spam' }, 'review-report-key-0001'),
    );
    expect(await aggregate(database.em, listing.publicationId)).toEqual({ count: 2, revision: 2, sum: 8 });
    await expect(
      repository(database).moderateReviewReport(
        { tenantId: `${seller.tenantId}-foreign`, userId: 'foreign-admin' },
        report.id,
        { decision: 'hidden', expectedRevision: 0 },
        'review-moderate-key-foreign',
      ),
    ).resolves.toEqual({ status: 'not_found' });
    expect(await aggregate(database.em, listing.publicationId)).toEqual({ count: 2, revision: 2, sum: 8 });

    const moderated = await repository(database).moderateReviewReport(
      { tenantId: seller.tenantId, userId: 'seller-tenant-admin' },
      report.id,
      { decision: 'hidden', expectedRevision: 0 },
      'review-moderate-key-0001',
    );
    expect(moderated).toMatchObject({
      status: 'ok',
      value: { aggregate: { averageRating: 3, reviewCount: 1 }, reviewVisible: false },
    });
    expect(await aggregate(database.em, listing.publicationId)).toEqual({ count: 1, revision: 3, sum: 3 });
    await expect(
      repository(database).moderateReviewReport(
        { tenantId: seller.tenantId, userId: 'seller-tenant-admin' },
        report.id,
        { decision: 'dismissed', expectedRevision: 0 },
        'review-moderate-key-0002',
      ),
    ).resolves.toEqual({ field: 'expectedRevision', status: 'conflict' });
  });
});

interface CatalogListing {
  productId: string;
  publicationId: string;
}

const engagementEntities = [
  AgriTechPartnerEntitySchema,
  VerificationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  ContractEntitySchema,
  MarketplaceContractReviewEligibilityEntitySchema,
  MarketplaceLegacySampleRequestArchiveEntitySchema,
  MarketplaceLegacyFavoriteArchiveEntitySchema,
  MarketplaceLegacyReviewArchiveEntitySchema,
  MarketplaceSamplePolicyEntitySchema,
  MarketplaceSampleMonthlyUsageEntitySchema,
  MarketplaceListingFavoriteEntitySchema,
  MarketplaceListingSampleEntitySchema,
  MarketplaceListingReviewEntitySchema,
  MarketplaceReviewReplyEntitySchema,
  MarketplaceReviewAggregateEntitySchema,
  MarketplaceReviewReportEntitySchema,
  MarketplaceEngagementEventEntitySchema,
  MarketplaceEngagementNotificationIntentEntitySchema,
  MarketplaceEngagementOperationEntitySchema,
];

function repository(database: MikroORM<PostgreSqlDriver>): PostgresMarketplaceEngagementRepository {
  return new PostgresMarketplaceEngagementRepository(database.em.fork());
}

function requireOrm(value: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!value) {
    throw new Error('Marketplace engagement PostgreSQL fixture is not initialized.');
  }
  return value;
}

function uniqueOwner(prefix: string): AgriTechOwner {
  const suffix = randomUUID();
  return { tenantId: `${prefix}-tenant-${suffix}`, userId: `${prefix}-user-${suffix}` };
}

function valueOf<T>(result: OperationResult<T>): T {
  if (result.status !== 'ok') {
    throw new Error(`Expected an ok operation, received ${JSON.stringify(result)}.`);
  }
  return result.value;
}

function statuses(results: Array<{ status: string }>): string[] {
  return results.map(({ status }) => status).sort((left, right) => left.localeCompare(right));
}

function requireAt<T>(items: readonly T[], index: number, label: string): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

async function seedLegacyEngagement(em: EntityManager): Promise<void> {
  const productId = randomUUID();
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, name_ru, name_uz, name_uz_cyrl, category, description,
       supplier_id, supplier_name, price_uzs, unit, stock_quantity, region, status, images,
       created_at, updated_at)
     values (?, 'legacy-tenant', 'Legacy product', null, null, null, 'seed', 'Retained legacy product',
             'legacy-supplier', 'Legacy supplier', 1000, 'kg', 1, 'Samarkand', 'active',
             '[]'::jsonb, now(), now())`,
    [productId],
  );
  await em.getConnection().execute(
    `insert into marketplace_sample_requests
      (id, tenant_id, user_id, product_id, seller_id, status, created_at)
     values (?, 'legacy-tenant', 'legacy-user', ?, 'legacy-seller', 'pending', now())`,
    [randomUUID(), productId],
  );
  await em.getConnection().execute(
    `insert into marketplace_favorites (tenant_id, user_id, product_id, created_at)
     values ('legacy-tenant', 'legacy-user', ?, now())`,
    [productId],
  );
  await em.getConnection().execute(
    `insert into marketplace_reviews (id, tenant_id, product_id, user_id, rating, comment, created_at)
     values (?, 'legacy-tenant', ?, 'legacy-user', 5, 'Retained legacy review', now())`,
    [randomUUID(), productId],
  );
}

async function archiveCounts(em: EntityManager): Promise<{ favorites: number; reviews: number; samples: number }> {
  const result = await rows<{ favorites: number; reviews: number; samples: number }>(
    em,
    `select
      (select count(*)::int from marketplace_legacy_favorites_archive) as favorites,
      (select count(*)::int from marketplace_legacy_reviews_archive) as reviews,
      (select count(*)::int from marketplace_legacy_sample_requests_archive) as samples`,
  );
  const first = result[0];
  if (!first) {
    throw new Error('Legacy archive count query returned no row.');
  }
  return first;
}

async function ensureAuthUsersTable(em: EntityManager): Promise<void> {
  await em.getConnection().execute(`
    create table if not exists auth_users (
      id varchar(100) primary key,
      tenant_id varchar(100) not null,
      status varchar(32) not null,
      locale varchar(16) not null
    )
  `);
}

async function insertParty(
  em: EntityManager,
  owner: AgriTechOwner,
  partnerId: string,
  kind: 'buyer' | 'supplier',
): Promise<void> {
  const capability = kind === 'buyer' ? 'buyer' : 'seller';
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, ?, 'Engagement organization', ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [partnerId, owner.tenantId, owner.userId, kind, partnerId.replaceAll('-', '').slice(0, 20)],
  );
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', 'verified', true, 'legacy', 'legacy_unknown', '[]'::jsonb, now(), now())`,
    [randomUUID(), owner.tenantId, owner.userId, capability],
  );
  await em.getConnection().execute(
    `insert into auth_users (id, tenant_id, status, locale) values (?, ?, 'active', 'uz-cyrl')
      on conflict (id) do nothing`,
    [owner.userId, owner.tenantId],
  );
}

async function insertCatalog(
  em: EntityManager,
  seller: AgriTechOwner,
  sellerPartnerId: string,
  count: number,
  prefix: string,
): Promise<CatalogListing[]> {
  const sellerPublicId = randomUUID();
  const sellerRevisionId = randomUUID();
  await em.getConnection().execute(
    `insert into marketplace_public_sellers
      (id, tenant_id, partner_id, partner_kind, owner_user_id, content_revision, status, created_at, updated_at)
     values (?, ?, ?, 'supplier', ?, 1, 'published', now(), now())`,
    [sellerPublicId, seller.tenantId, sellerPartnerId, seller.userId],
  );
  await em.getConnection().execute(
    `insert into marketplace_public_seller_revisions
      (id, seller_public_id, tenant_id, content_revision, content_fingerprint, display_name,
       region, moderation_status, moderated_by, moderated_at, created_at, updated_at)
     values (?, ?, ?, 1, repeat('a', 64), 'Engagement seller', 'Samarkand',
             'approved', 'moderator', now(), now(), now())`,
    [sellerRevisionId, sellerPublicId, seller.tenantId],
  );

  const listings: CatalogListing[] = [];
  for (let index = 0; index < count; index += 1) {
    const productId = randomUUID();
    const publicationId = randomUUID();
    // eslint-disable-next-line no-await-in-loop
    await em.getConnection().execute(
      `insert into products
        (id, tenant_id, name, name_ru, name_uz, name_uz_cyrl, category, description,
         supplier_id, supplier_name, price_uzs, unit, stock_quantity, region, status, images,
         sample_available, created_at, updated_at)
       values (?, ?, ?, null, null, null, 'seed', 'Certified source', ?, 'Engagement seller',
               500000, 'kg', 100, 'Samarkand', 'active', '[]'::jsonb, true, now(), now())`,
      [productId, seller.tenantId, `${prefix} product ${index + 1}`, sellerPartnerId],
    );
    // eslint-disable-next-line no-await-in-loop
    await em.getConnection().execute(
      `insert into marketplace_listing_publications
        (id, tenant_id, owner_user_id, seller_public_id, seller_revision_id, seller_content_revision,
         product_id, source_kind, section, public_title, public_category, public_unit, public_region,
         public_images, content_fingerprint, content_revision, status, moderation_status,
         moderated_by, moderated_at, idempotency_key, request_fingerprint, revision,
         published_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, 1, ?, 'product', 'seeds', ?, 'seed', 'kg', 'Samarkand',
               '[]'::jsonb, repeat('b', 64), 1, 'published', 'approved', 'moderator', now(), ?,
               repeat('c', 64), 0, now(), now(), now())`,
      [
        publicationId,
        seller.tenantId,
        seller.userId,
        sellerPublicId,
        sellerRevisionId,
        productId,
        `${prefix} product ${index + 1}`,
        `${prefix}-publication-${index + 1}-${randomUUID()}`,
      ],
    );
    listings.push({ productId, publicationId });
  }
  return listings;
}

async function activePolicyId(em: EntityManager, tenantId: string): Promise<string> {
  const policies = await rows<{ id: string }>(
    em,
    `select id from marketplace_sample_policies where tenant_id = ? and active = true`,
    [tenantId],
  );
  const policy = policies[0];
  if (!policy) {
    throw new Error(`No active sample policy for ${tenantId}.`);
  }
  return policy.id;
}

async function insertRawSample(
  em: EntityManager,
  input: {
    buyer: AgriTechOwner;
    buyerPartnerId: string;
    id: string;
    listing: CatalogListing;
    policyId: string;
    seller: AgriTechOwner;
    sellerPartnerId: string;
  },
): Promise<void> {
  const now = new Date();
  await em.getConnection().execute(
    `insert into marketplace_listing_samples
      (id, listing_publication_id, source_kind, product_id, requester_tenant_id, requester_user_id,
       requester_partner_id, seller_tenant_id, seller_user_id, seller_partner_id, season_key, month_key,
       policy_id, policy_version, monthly_limit, delivery_method, item_price_uzs, status, revision,
       created_at, updated_at)
     values (?, ?, 'product', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 5, 'pickup', 0, 'requested', 0, now(), now())`,
    [
      input.id,
      input.listing.publicationId,
      input.listing.productId,
      input.buyer.tenantId,
      input.buyer.userId,
      input.buyerPartnerId,
      input.seller.tenantId,
      input.seller.userId,
      input.sellerPartnerId,
      marketplaceUtcSeasonKey(now),
      marketplaceUtcMonthKey(now),
      input.policyId,
    ],
  );
}

async function sampleUsage(em: EntityManager, owner: AgriTechOwner): Promise<{ rows: number; used: number }> {
  const period = marketplaceUtcMonthKey(new Date());
  const result = await rows<{ rows: number; used: number }>(
    em,
    `select
      (select count(*)::int from marketplace_listing_samples
        where requester_tenant_id = ? and requester_user_id = ? and month_key = ?) as rows,
      coalesce((select used_count from marketplace_sample_monthly_usage
        where requester_tenant_id = ? and requester_user_id = ? and month_key = ?), 0)::int as used`,
    [owner.tenantId, owner.userId, period, owner.tenantId, owner.userId, period],
  );
  const first = result[0];
  if (!first) {
    throw new Error('Sample usage query returned no row.');
  }
  return first;
}

async function insertReviewEligibility(
  em: EntityManager,
  input: {
    buyer: AgriTechOwner;
    buyerPartnerId: string;
    listing: CatalogListing;
    seller: AgriTechOwner;
    sellerPartnerId: string;
  },
): Promise<string> {
  const contractId = randomUUID();
  const eligibilityId = randomUUID();
  const line = {
    lineTotalUzs: 500_000,
    name: 'Engagement product',
    quantity: 1,
    sourceId: input.listing.productId,
    sourceKind: 'product',
    sourcePublicationId: input.listing.publicationId,
    sourceRevision: 1,
    unit: 'kg',
    unitPriceUzs: 500_000,
  };
  await em.getConnection().execute(
    `insert into marketplace_contracts
      (id, tenant_id, buyer_user_id, buyer_partner_id, seller_tenant_id, seller_user_id, seller_partner_id,
       buyer_party_snapshot, seller_party_snapshot, binding_status, source_type, source_id,
       subject, amount_uzs, lines, delivery_terms, delivery_price_uzs, factoring_enabled,
       status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'resolved', 'offer_selection', ?,
             'Completed engagement contract', 500000, ?::jsonb, 'pickup', 0, false,
             'completed', now(), now())`,
    [
      contractId,
      input.buyer.tenantId,
      input.buyer.userId,
      input.buyerPartnerId,
      input.seller.tenantId,
      input.seller.userId,
      input.sellerPartnerId,
      JSON.stringify(partySnapshot(input.buyer, input.buyerPartnerId, 'Engagement buyer')),
      JSON.stringify(partySnapshot(input.seller, input.sellerPartnerId, 'Engagement seller')),
      randomUUID(),
      JSON.stringify([line]),
    ],
  );
  await em.getConnection().execute(
    `insert into marketplace_contract_review_eligibilities
      (id, contract_id, buyer_tenant_id, buyer_user_id, buyer_partner_id,
       seller_tenant_id, seller_partner_id, source_kind, source_id, source_publication_id, created_at)
     values (?, ?, ?, ?, ?, ?, ?, 'product', ?, ?, now())`,
    [
      eligibilityId,
      contractId,
      input.buyer.tenantId,
      input.buyer.userId,
      input.buyerPartnerId,
      input.seller.tenantId,
      input.sellerPartnerId,
      input.listing.productId,
      input.listing.publicationId,
    ],
  );
  return eligibilityId;
}

async function insertRawReview(
  em: EntityManager,
  input: {
    buyer: AgriTechOwner;
    buyerPartnerId: string;
    eligibilityId: string;
    id: string;
    listing: CatalogListing;
    rating: number;
    seller: AgriTechOwner;
    sellerPartnerId: string;
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_listing_reviews
      (id, listing_publication_id, source_kind, product_id, review_eligibility_id,
       buyer_tenant_id, buyer_user_id, buyer_partner_id, seller_tenant_id, seller_partner_id,
       rating, asset_references, verified_deal, visibility, revision, created_at, updated_at)
     values (?, ?, 'product', ?, ?, ?, ?, ?, ?, ?, ?, '[]'::jsonb, true, 'visible', 0, now(), now())`,
    [
      input.id,
      input.listing.publicationId,
      input.listing.productId,
      input.eligibilityId,
      input.buyer.tenantId,
      input.buyer.userId,
      input.buyerPartnerId,
      input.seller.tenantId,
      input.sellerPartnerId,
      input.rating,
    ],
  );
}

async function aggregate(
  em: EntityManager,
  listingPublicationId: string,
): Promise<{ count: number; revision: number; sum: number }> {
  const result = await rows<{ count: number; revision: number; sum: number }>(
    em,
    `select review_count as count, rating_sum as sum, revision
       from marketplace_review_aggregates where listing_publication_id = ?`,
    [listingPublicationId],
  );
  const first = result[0];
  if (!first) {
    throw new Error('Review aggregate query returned no row.');
  }
  return first;
}

function partySnapshot(owner: AgriTechOwner, partnerId: string, legalName: string) {
  return { legalName, partnerId, region: 'Samarkand', tenantId: owner.tenantId, userId: owner.userId };
}

async function rows<T>(em: EntityManager, sql: string, parameters: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, parameters)) as T[];
}
