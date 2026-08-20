// @requirements REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import type {
  ActivateMarketplacePromotionInput,
  AgriTechOwner,
  MarketplaceListingPromotion,
  MarketplaceListingPublication,
  MarketplacePromotionReservation,
  OperationResult,
} from '@app/backend-feature-agritech-shared';
import {
  marketplaceProviderFingerprint,
  marketplacePromotionActivationFingerprint,
} from '@app/backend-feature-agritech-shared';
import {
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  FarmerEntitySchema,
  MarketplaceListingPromotionEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplacePublicationModerationOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  VerificationEntitySchema,
} from '../entities';
import {
  MarketplaceAiConsultationEntitySchema,
  MarketplaceAiConsultationOperationEntitySchema,
} from '../entities/marketplace-dashboard-ai.entity';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceRepository } from './marketplace.repository';
import { PostgresMarketplaceDashboardAiRepository } from './marketplace-dashboard-ai.repository';
import { PostgresMarketplacePromotionRepository } from './marketplace-promotion.repository';
import { PostgresMarketplacePublicRepository } from './marketplace-public.repository';

describe('AgriTech marketplace promotion PostgreSQL boundary', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error(
        'AgriTech marketplace promotion PostgreSQL evidence requires an available Docker runtime; skipping is forbidden.',
      );
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, promotionEntities, {
        extensions: [Migrator],
        migrations: agritechMigrationOptions,
      }),
    );
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm?.close(true);
    await stopPostgresContainer(container);
  });

  it('persists exact replay, rejects changed commands, and isolates tenant/owner reads', async () => {
    const database = requireOrm(orm);
    const owner = { tenantId: 'tenant-promotion-idempotency', userId: 'seller-idempotency' };
    const partnerId = randomUUID();
    const productId = randomUUID();
    await insertAuthorizedSeller(database.em, owner, partnerId);
    await insertProduct(database.em, { id: productId, supplierId: partnerId, tenantId: owner.tenantId });
    const publication = await publishAndApproveProduct(database, owner, partnerId, productId, 'idempotency');
    // Replay is asserted sequentially because an exact replay must return the
    // settled record; the concurrent case is its own scenario below, where the
    // point is that a race resolves as exactly one charge.
    const first = valueOf(
      await activatePromotion(database, owner, 'promotion-command-0001', {
        actingPartnerId: partnerId,
        listingPublicId: publication.id,
        planCode: 'catalog_7d',
      }),
    );
    const replay = valueOf(
      await activatePromotion(database, owner, 'promotion-command-0001', {
        actingPartnerId: partnerId,
        listingPublicId: publication.id,
        planCode: 'catalog_7d',
      }),
    );

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      activationReference: `promotion:${first.id}`,
      currency: 'UZS',
      listingPublicId: publication.id,
      planCode: 'catalog_7d',
      priceUzs: 150_000,
      status: 'active',
    });
    await expect(
      activatePromotion(database, owner, 'promotion-command-0001', {
        actingPartnerId: partnerId,
        listingPublicId: publication.id,
        planCode: 'catalog_14d',
      }),
    ).resolves.toMatchObject({ field: 'idempotencyKey', status: 'conflict' });
    await expect(
      activatePromotion(database, owner, 'promotion-command-0002', {
        actingPartnerId: partnerId,
        listingPublicId: publication.id,
        planCode: 'catalog_7d',
      }),
    ).resolves.toMatchObject({ field: 'listingPublicId', status: 'conflict' });

    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_listing_promotions where listing_publication_id = ?`,
        [publication.id],
      ),
    ).toEqual([{ count: 1 }]);
    await expect(
      new PostgresMarketplacePromotionRepository(database.em.fork()).findPromotion(
        { tenantId: 'foreign-tenant', userId: owner.userId },
        first.id,
      ),
    ).resolves.toBeUndefined();
    await expect(
      new PostgresMarketplacePromotionRepository(database.em.fork()).findPromotion(
        { tenantId: owner.tenantId, userId: 'foreign-owner' },
        first.id,
      ),
    ).resolves.toBeUndefined();

    expect(
      await rows<{ columnName: string }>(
        database.em,
        `select column_name as "columnName"
           from information_schema.columns
          where table_schema = 'public' and table_name = 'marketplace_listing_promotions'
          order by column_name`,
      ),
    ).not.toEqual(
      expect.arrayContaining([
        { columnName: 'provider_mode' },
        { columnName: 'provider_reference' },
        { columnName: 'provider_lease_expires_at' },
        { columnName: 'payment_status' },
      ]),
    );
  });

  it('serializes changed-input and competing-listing commands across separate entity managers', async () => {
    const database = requireOrm(orm);
    const owner = { tenantId: 'tenant-promotion-concurrency', userId: 'seller-concurrency' };
    const partnerId = randomUUID();
    await insertAuthorizedSeller(database.em, owner, partnerId);
    const productIds = [randomUUID(), randomUUID(), randomUUID()] as const;
    await Promise.all(
      productIds.map((id, index) =>
        insertProduct(database.em, {
          id,
          name: `Concurrency ${index + 1}`,
          supplierId: partnerId,
          tenantId: owner.tenantId,
        }),
      ),
    );
    const publications: MarketplaceListingPublication[] = [
      await publishAndApproveProduct(database, owner, partnerId, productIds[0], 'concurrency-first'),
      await publishAndApproveProduct(database, owner, partnerId, productIds[1], 'concurrency-second'),
      await publishAndApproveProduct(database, owner, partnerId, productIds[2], 'concurrency-third'),
    ];
    const [firstPublication, secondPublication, thirdPublication] = publications;
    if (!firstPublication || !secondPublication || !thirdPublication) {
      throw new Error('Expected three promotion concurrency publications.');
    }

    const changedInputRace = await Promise.all([
      activatePromotion(database, owner, 'promotion-race-shared-key', {
        actingPartnerId: partnerId,
        listingPublicId: firstPublication.id,
        planCode: 'catalog_7d',
      }),
      activatePromotion(database, owner, 'promotion-race-shared-key', {
        actingPartnerId: partnerId,
        listingPublicId: secondPublication.id,
        planCode: 'catalog_14d',
      }),
    ]);
    expect(changedInputRace.map(({ status }) => status).sort((left, right) => left.localeCompare(right))).toEqual([
      'conflict',
      'ok',
    ]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_listing_promotions
          where tenant_id = ? and actor_user_id = ? and idempotency_key = ?`,
        [owner.tenantId, owner.userId, 'promotion-race-shared-key'],
      ),
    ).toEqual([{ count: 1 }]);

    const competingListingRace = await Promise.all([
      activatePromotion(database, owner, 'promotion-race-listing-a', {
        actingPartnerId: partnerId,
        listingPublicId: thirdPublication.id,
        planCode: 'catalog_7d',
      }),
      activatePromotion(database, owner, 'promotion-race-listing-b', {
        actingPartnerId: partnerId,
        listingPublicId: thirdPublication.id,
        planCode: 'catalog_7d',
      }),
    ]);
    expect(competingListingRace.map(({ status }) => status).sort((left, right) => left.localeCompare(right))).toEqual([
      'conflict',
      'ok',
    ]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_listing_promotions where listing_publication_id = ?`,
        [thirdPublication.id],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('allows active seller members and denies reads and writes after membership revocation', async () => {
    const database = requireOrm(orm);
    const organizationOwner = { tenantId: 'tenant-promotion-membership', userId: 'seller-org-owner' };
    const member = { tenantId: organizationOwner.tenantId, userId: 'seller-active-member' };
    const partnerId = randomUUID();
    const firstProductId = randomUUID();
    const secondProductId = randomUUID();
    await insertAuthorizedSeller(database.em, organizationOwner, partnerId);
    await insertVerifiedSeller(database.em, member);
    await database.em.getConnection().execute(
      `insert into marketplace_partner_memberships
        (id, tenant_id, partner_id, user_id, role, capability, status, revision, created_at, updated_at)
       values (?, ?, ?, ?, 'member', 'seller', 'active', 0, now(), now())`,
      [randomUUID(), member.tenantId, partnerId, member.userId],
    );
    await insertProduct(database.em, {
      id: firstProductId,
      supplierId: partnerId,
      tenantId: organizationOwner.tenantId,
    });
    await insertProduct(database.em, {
      id: secondProductId,
      supplierId: partnerId,
      tenantId: organizationOwner.tenantId,
    });
    const firstPublication = await publishAndApproveProduct(
      database,
      organizationOwner,
      partnerId,
      firstProductId,
      'member-first',
    );
    const secondPublication = await publishAndApproveProduct(
      database,
      organizationOwner,
      partnerId,
      secondProductId,
      'member-second',
    );
    const promotion = valueOf(
      await activatePromotion(database, member, 'promotion-member-0001', {
        actingPartnerId: partnerId,
        listingPublicId: firstPublication.id,
        planCode: 'catalog_7d',
      }),
    );

    await database.em.getConnection().execute(
      `update marketplace_partner_memberships
          set status = 'revoked', revoked_at = now(), revision = revision + 1, updated_at = now()
        where tenant_id = ? and partner_id = ? and user_id = ? and capability = 'seller'`,
      [member.tenantId, partnerId, member.userId],
    );
    await expect(promotionRepository(database).findPromotion(member, promotion.id)).resolves.toBeUndefined();
    await expect(promotionRepository(database).listPromotions(member)).resolves.toEqual([]);
    await expect(
      activatePromotion(database, member, 'promotion-member-0002', {
        actingPartnerId: partnerId,
        listingPublicId: secondPublication.id,
        planCode: 'catalog_7d',
      }),
    ).resolves.toMatchObject({ field: 'organizationMembership', status: 'forbidden' });
  });

  it('derives disclosure and catalog rank from the active window instead of the legacy boolean', async () => {
    const database = requireOrm(orm);
    const owner = { tenantId: 'tenant-promotion-catalog', userId: 'seller-catalog' };
    const partnerId = randomUUID();
    const promotedProductId = randomUUID();
    const plainProductId = randomUUID();
    await insertAuthorizedSeller(database.em, owner, partnerId);
    await insertProduct(database.em, {
      id: promotedProductId,
      name: 'Actually promoted seed',
      supplierId: partnerId,
      tenantId: owner.tenantId,
    });
    await insertProduct(database.em, {
      id: plainProductId,
      name: 'Legacy boolean seed',
      supplierId: partnerId,
      tenantId: owner.tenantId,
    });
    const promotedPublication = await publishAndApproveProduct(
      database,
      owner,
      partnerId,
      promotedProductId,
      'catalog-promoted',
    );
    const plainPublication = await publishAndApproveProduct(
      database,
      owner,
      partnerId,
      plainProductId,
      'catalog-plain',
    );
    await database.em.getConnection().execute(
      `update marketplace_listing_publications
          set published_at = case when id = ? then now() - interval '1 day' else now() end
        where id in (?, ?)`,
      [promotedPublication.id, promotedPublication.id, plainPublication.id],
    );
    const aiRepository = new PostgresMarketplaceDashboardAiRepository(database.em.fork());
    const aiBefore = valueOf(
      await aiRepository.createAiConsultation(owner, 'recommendation', 'seed', 'promotion-ai-before-0001'),
    ).listingPublicationIds;
    valueOf(
      await activatePromotion(database, owner, 'promotion-catalog-0001', {
        actingPartnerId: partnerId,
        listingPublicId: promotedPublication.id,
        planCode: 'catalog_14d',
      }),
    );

    const catalog = await new PostgresMarketplacePublicRepository(database.em.fork()).listPublishedListings({
      limit: 20,
      query: 'seed',
      sort: 'newest',
    });
    const relevant = catalog.items.filter(({ publicId }) =>
      [promotedPublication.id, plainPublication.id].includes(publicId),
    );
    expect(relevant).toEqual([
      expect.objectContaining({ promoted: true, publicId: promotedPublication.id }),
      expect.objectContaining({ promoted: false, publicId: plainPublication.id }),
    ]);
    const aiAfter = valueOf(
      await new PostgresMarketplaceDashboardAiRepository(database.em.fork()).createAiConsultation(
        owner,
        'recommendation',
        'seed',
        'promotion-ai-after-0001',
      ),
    ).listingPublicationIds;
    expect(aiAfter).toEqual(aiBefore);
  });

  it('keeps promotion state out of the production commerce, offer, matching, and AI repository', async () => {
    const commerceRepositorySource = await readFile(
      join(process.cwd(), 'src/repositories/marketplace.repository.ts'),
      'utf8',
    );
    const aiRepositorySource = await readFile(
      join(process.cwd(), 'src/repositories/marketplace-dashboard-ai.repository.ts'),
      'utf8',
    );

    expect(commerceRepositorySource.match(/\bmarketplace_listing_promotions\b/gu)).toEqual([
      'marketplace_listing_promotions',
    ]);
    expect(commerceRepositorySource).not.toMatch(/MarketplaceListingPromotionEntity|listingPromotion|\bpromoted\b/u);
    expect(aiRepositorySource).not.toMatch(
      /marketplace_listing_promotions|MarketplaceListingPromotionEntity|\bpromoted\b/u,
    );
  });

  it('expires a finished window before replacement and rejects organization tampering in PostgreSQL', async () => {
    const database = requireOrm(orm);
    const owner = { tenantId: 'tenant-promotion-expiry', userId: 'seller-expiry' };
    const partnerId = randomUUID();
    const productId = randomUUID();
    await insertAuthorizedSeller(database.em, owner, partnerId);
    await insertProduct(database.em, { id: productId, supplierId: partnerId, tenantId: owner.tenantId });
    const publication = await publishAndApproveProduct(database, owner, partnerId, productId, 'expiry');

    const fixtureNow = new Date();
    await expect(
      insertRawPromotion(database.em, {
        activatedAt: fixtureNow,
        actorUserId: owner.userId,
        endsAt: new Date(fixtureNow.getTime() + 8 * 24 * 60 * 60_000),
        id: randomUUID(),
        idempotencyKey: 'promotion-invalid-future-active',
        owner,
        partnerId,
        publication,
        startsAt: new Date(fixtureNow.getTime() + 24 * 60 * 60_000),
        status: 'active',
      }),
    ).rejects.toThrow(/marketplace listing promotion initial state is invalid/u);
    await expect(
      insertRawPromotion(database.em, {
        activatedAt: fixtureNow,
        actorUserId: owner.userId,
        endsAt: new Date(fixtureNow.getTime() + 7 * 24 * 60 * 60_000),
        id: randomUUID(),
        idempotencyKey: 'promotion-invalid-past-scheduled',
        owner,
        partnerId,
        publication,
        startsAt: fixtureNow,
        status: 'scheduled',
      }),
    ).rejects.toThrow(/marketplace listing promotion initial state is invalid/u);

    const expiredId = randomUUID();
    const expiresAt = new Date(Date.now() + 1_500);
    const startsAt = new Date(expiresAt.getTime() - 7 * 24 * 60 * 60_000);
    await insertRawPromotion(database.em, {
      activatedAt: startsAt,
      actorUserId: owner.userId,
      endsAt: expiresAt,
      id: expiredId,
      idempotencyKey: 'promotion-expired-0001',
      owner,
      partnerId,
      publication,
      startsAt,
      status: 'active',
    });
    await database.em.getConnection().execute(`select pg_sleep(1.7)`);

    const replacement = valueOf(
      await activatePromotion(database, owner, 'promotion-replacement-0001', {
        actingPartnerId: partnerId,
        listingPublicId: publication.id,
        planCode: 'catalog_30d',
      }),
    );
    expect(replacement).toMatchObject({ planCode: 'catalog_30d', status: 'active' });
    expect(
      await rows<{ id: string; status: string }>(
        database.em,
        `select id, status from marketplace_listing_promotions
          where listing_publication_id = ? order by created_at`,
        [publication.id],
      ),
    ).toEqual([
      { id: expiredId, status: 'expired' },
      { id: replacement.id, status: 'active' },
    ]);
    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_listing_promotions set actor_user_id = 'attacker' where id = ?`, [replacement.id]),
      // Either guard is a refusal: the charge ledger anchors the promotion owner,
      // so the provider-operation anchor trigger can fire before the promotion's
      // own identity trigger.
    ).rejects.toThrow(/(promotion identity is immutable|provider operation resource anchor is immutable)/u);
    await expect(
      database.em.getConnection().execute(
        `update marketplace_listing_promotions
              set status = 'scheduled', revision = revision + 1, updated_at = now()
            where id = ?`,
        [replacement.id],
      ),
    ).rejects.toThrow(/marketplace listing promotion status transition is invalid/u);
    await expect(
      database.em.getConnection().execute(
        `update marketplace_listing_promotions
              set status = 'expired', revision = revision + 1, updated_at = now()
            where id = ?`,
        [replacement.id],
      ),
    ).rejects.toThrow(/marketplace listing promotion status transition is invalid/u);
    await expect(
      database.em.getConnection().execute(
        `update marketplace_listing_promotions
              set status = 'expired', revision = revision + 2, updated_at = now()
            where id = ?`,
        [replacement.id],
      ),
    ).rejects.toThrow(/marketplace listing promotion status transition is invalid/u);
  });

  it('keeps a reserved slot out of every read and out of the catalog until a charge settles it', async () => {
    const database = requireOrm(orm);
    const owner = { tenantId: 'tenant-promotion-billing', userId: 'seller-billing' };
    const partnerId = randomUUID();
    const productId = randomUUID();
    await insertAuthorizedSeller(database.em, owner, partnerId);
    await insertProduct(database.em, {
      id: productId,
      name: 'Billed seed',
      supplierId: partnerId,
      tenantId: owner.tenantId,
    });
    const publication = await publishAndApproveProduct(database, owner, partnerId, productId, 'billing');

    const reservation = valueOf(
      await reservePromotion(promotionRepository(database), owner, 'promotion-billing-0001', {
        actingPartnerId: partnerId,
        listingPublicId: publication.id,
        planCode: 'catalog_7d',
      }),
    );

    expect(reservation.settledPromotion).toBeUndefined();
    expect(
      await rows<{ billingOperationId: string | null; status: string }>(
        database.em,
        `select billing_operation_id as "billingOperationId", status
           from marketplace_listing_promotions where id = ?`,
        [reservation.id],
      ),
    ).toEqual([{ billingOperationId: null, status: 'pending_billing' }]);
    await expect(promotionRepository(database).findPromotion(owner, reservation.id)).resolves.toBeUndefined();
    await expect(promotionRepository(database).listPromotions(owner)).resolves.toEqual([]);
    const beforeCharge = await new PostgresMarketplacePublicRepository(database.em.fork()).listPublishedListings({
      limit: 20,
      query: 'Billed seed',
      sort: 'newest',
    });
    expect(beforeCharge.items.find(({ publicId }) => publicId === publication.id)).toMatchObject({ promoted: false });

    // A reservation cannot promote itself: the database refuses the transition
    // while no succeeded promotion_billing operation backs it.
    await expect(
      database.em.getConnection().execute(
        `update marketplace_listing_promotions
            set status = 'active', revision = revision + 1, updated_at = now()
          where id = ?`,
        [reservation.id],
      ),
    ).rejects.toThrow(/marketplace listing promotion status transition is invalid/u);
    await expect(
      promotionRepository(database).settlePromotion(owner, reservation.id, randomUUID()),
    ).resolves.toMatchObject({ field: 'billingOperation', status: 'conflict' });

    const charge = valueOf(await chargeReservation(database, owner, 'promotion-billing-0001', reservation));
    const settled = valueOf(await promotionRepository(database).settlePromotion(owner, reservation.id, charge));

    expect(settled).toMatchObject({ id: reservation.id, priceUzs: 150_000, revision: 1, status: 'active' });
    expect(
      await rows<{ capability: string; count: number; receipt: Record<string, unknown>; status: string }>(
        database.em,
        `select capability, status, receipt, count(*)::int as count
           from marketplace_provider_operations
          where resource_type = 'promotion' and resource_id = ?
          group by capability, status, receipt`,
        [reservation.id],
      ),
    ).toEqual([
      {
        capability: 'promotion_billing',
        count: 1,
        receipt: { amountUzs: 150_000, currency: 'UZS', moneyMoved: false, planCode: 'catalog_7d', simulated: true },
        status: 'succeeded',
      },
    ]);
    const afterCharge = await new PostgresMarketplacePublicRepository(database.em.fork()).listPublishedListings({
      limit: 20,
      query: 'Billed seed',
      sort: 'newest',
    });
    expect(afterCharge.items.find(({ publicId }) => publicId === publication.id)).toMatchObject({ promoted: true });

    // Settling the same charge again returns the persisted record instead of
    // paying twice, and no further charge can be prepared for a serving slot.
    await expect(promotionRepository(database).settlePromotion(owner, reservation.id, charge)).resolves.toMatchObject({
      status: 'ok',
      value: { revision: 1 },
    });
    await expect(chargeReservation(database, owner, 'promotion-billing-0003', reservation)).resolves.toMatchObject({
      field: 'status',
      status: 'conflict',
    });
  });

  it('refuses to serve a slot whose charge is only started and refuses a second command key its own charge', async () => {
    const database = requireOrm(orm);
    const owner = { tenantId: 'tenant-promotion-started', userId: 'seller-started' };
    const partnerId = randomUUID();
    const productId = randomUUID();
    await insertAuthorizedSeller(database.em, owner, partnerId);
    await insertProduct(database.em, {
      id: productId,
      name: 'Started charge seed',
      supplierId: partnerId,
      tenantId: owner.tenantId,
    });
    const publication = await publishAndApproveProduct(database, owner, partnerId, productId, 'started-charge');
    const reservation = valueOf(
      await reservePromotion(promotionRepository(database), owner, 'promotion-started-0001', {
        actingPartnerId: partnerId,
        listingPublicId: publication.id,
        planCode: 'catalog_7d',
      }),
    );
    const descriptor = promotionBillingDescriptor(reservation);

    const started = valueOf(
      await new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(owner, {
        actorType: 'promotion_owner',
        capability: 'promotion_billing',
        idempotencyKey: 'promotion-started-0001',
        providerMode: 'mock',
        providerName: 'mock-promotion-billing',
        requestDescriptor: descriptor,
        requestFingerprint: marketplaceProviderFingerprint(descriptor),
        resourceId: reservation.id,
        resourceRevision: reservation.revision,
        resourceType: 'promotion',
      }),
    );

    await expect(
      promotionRepository(database).settlePromotion(owner, reservation.id, started.operationId),
    ).resolves.toMatchObject({ field: 'billingOperation', status: 'conflict' });
    await expect(chargeReservation(database, owner, 'promotion-started-0002', reservation)).resolves.toMatchObject({
      status: 'conflict',
    });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_provider_operations
          where capability = 'promotion_billing' and resource_id = ?`,
        [reservation.id],
      ),
    ).toEqual([{ count: 1 }]);
    expect(
      await rows<{ status: string }>(database.em, `select status from marketplace_listing_promotions where id = ?`, [
        reservation.id,
      ]),
    ).toEqual([{ status: 'pending_billing' }]);
  });

  it('resolves a concurrent double activation of one listing as exactly one charge', async () => {
    const database = requireOrm(orm);
    const owner = { tenantId: 'tenant-promotion-one-charge', userId: 'seller-one-charge' };
    const partnerId = randomUUID();
    const productId = randomUUID();
    await insertAuthorizedSeller(database.em, owner, partnerId);
    await insertProduct(database.em, {
      id: productId,
      name: 'Race seed',
      supplierId: partnerId,
      tenantId: owner.tenantId,
    });
    const publication = await publishAndApproveProduct(database, owner, partnerId, productId, 'one-charge');
    const command = { actingPartnerId: partnerId, listingPublicId: publication.id, planCode: 'catalog_7d' } as const;

    const distinctKeys = await Promise.all([
      activatePromotion(database, owner, 'promotion-charge-race-a', command),
      activatePromotion(database, owner, 'promotion-charge-race-b', command),
    ]);
    expect(distinctKeys.map(({ status }) => status).sort((left, right) => left.localeCompare(right))).toEqual([
      'conflict',
      'ok',
    ]);

    const [winningKey] = await rows<{ idempotencyKey: string }>(
      database.em,
      `select idempotency_key as "idempotencyKey" from marketplace_listing_promotions
        where listing_publication_id = ?`,
      [publication.id],
    );
    const settledKey = winningKey?.idempotencyKey ?? '';
    const sameKey = await Promise.all([
      activatePromotion(database, owner, settledKey, command),
      activatePromotion(database, owner, settledKey, command),
    ]);
    expect(sameKey.map(({ status }) => status)).toEqual(['ok', 'ok']);

    const promotions = await rows<{ billingOperationId: string; id: string; revision: number; status: string }>(
      database.em,
      `select billing_operation_id as "billingOperationId", id, revision, status
         from marketplace_listing_promotions where listing_publication_id = ?`,
      [publication.id],
    );
    expect(promotions).toHaveLength(1);
    expect(promotions[0]).toMatchObject({ revision: 1, status: 'active' });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_provider_operations
          where capability = 'promotion_billing' and status = 'succeeded' and resource_id = ?`,
        [promotions[0]?.id],
      ),
    ).toEqual([{ count: 1 }]);
    expect(promotions[0]?.billingOperationId).toBeTruthy();
  });
});

function requireOrm(orm: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!orm) {
    throw new Error('AgriTech marketplace promotion PostgreSQL database was not initialized.');
  }
  return orm;
}

function promotionRepository(database: MikroORM<PostgreSqlDriver>): PostgresMarketplacePromotionRepository {
  return new PostgresMarketplacePromotionRepository(database.em.fork());
}

function reservePromotion(
  repository: PostgresMarketplacePromotionRepository,
  owner: AgriTechOwner,
  idempotencyKey: string,
  input: ActivateMarketplacePromotionInput,
): ReturnType<PostgresMarketplacePromotionRepository['reservePromotion']> {
  return repository.reservePromotion(owner, {
    ...input,
    idempotencyKey,
    requestFingerprint: marketplacePromotionActivationFingerprint(input),
  });
}

function promotionBillingDescriptor(reservation: MarketplacePromotionReservation) {
  return {
    action: 'bill-listing-promotion' as const,
    parametersFingerprint: marketplaceProviderFingerprint({
      amountUzs: reservation.priceUzs,
      currency: 'UZS',
      listingPublicId: reservation.listingPublicId,
      planCode: reservation.planCode,
      sellerPartnerId: reservation.sellerPartnerId,
    }),
    resourceId: reservation.id,
    resourceRevision: reservation.revision,
    resourceType: 'promotion' as const,
  };
}

/**
 * The exact charge the promotion domain service records: one `promotion_billing`
 * provider operation, prepared against the reservation and completed with a
 * simulated receipt that never claims money moved.
 */
async function chargeReservation(
  database: MikroORM<PostgreSqlDriver>,
  owner: AgriTechOwner,
  idempotencyKey: string,
  reservation: MarketplacePromotionReservation,
): Promise<OperationResult<string>> {
  const descriptor = promotionBillingDescriptor(reservation);
  const commerce = new PostgresMarketplaceRepository(database.em.fork());
  const prepared = await commerce.prepareProviderOperation(owner, {
    actorType: 'promotion_owner',
    capability: 'promotion_billing',
    idempotencyKey,
    providerMode: 'mock',
    providerName: 'mock-promotion-billing',
    requestDescriptor: descriptor,
    requestFingerprint: marketplaceProviderFingerprint(descriptor),
    resourceId: reservation.id,
    resourceRevision: reservation.revision,
    resourceType: 'promotion',
  });
  if (prepared.status !== 'ok') {
    return prepared;
  }
  if (!prepared.value.execute) {
    return { status: 'ok', value: prepared.value.operationId };
  }
  const completion = await new PostgresMarketplaceRepository(database.em.fork()).completeProviderOperation(
    owner,
    prepared.value.operationId,
    prepared.value.attempt,
    {
      providerEventId: `mock-promotion-billing-event:${reservation.id}`,
      providerMode: 'mock',
      providerName: 'mock-promotion-billing',
      providerReference: `mock-promotion-billing:${prepared.value.operationId}`,
      resultDescriptor: {
        completedAt: new Date().toISOString(),
        outcome: 'promotion_charged',
        resourceId: reservation.id,
        resourceRevision: reservation.revision,
        resourceType: 'promotion',
      },
      safeReceipt: {
        amountUzs: reservation.priceUzs,
        currency: 'UZS',
        moneyMoved: false,
        planCode: reservation.planCode,
        simulated: true,
      },
    },
  );
  return completion.status === 'ok' ? { status: 'ok', value: prepared.value.operationId } : completion;
}

async function activatePromotion(
  database: MikroORM<PostgreSqlDriver>,
  owner: AgriTechOwner,
  idempotencyKey: string,
  input: ActivateMarketplacePromotionInput,
): Promise<OperationResult<MarketplaceListingPromotion>> {
  const reservation = await reservePromotion(promotionRepository(database), owner, idempotencyKey, input);
  if (reservation.status !== 'ok') {
    return reservation;
  }
  const settled = reservation.value.settledPromotion;
  if (settled) {
    return { status: 'ok', value: settled };
  }
  const charge = await chargeReservation(database, owner, idempotencyKey, reservation.value);
  if (charge.status !== 'ok') {
    return charge;
  }
  return promotionRepository(database).settlePromotion(owner, reservation.value.id, charge.value);
}

function valueOf<T>(result: { status: string; value?: T }): T {
  if (result.status !== 'ok' || result.value === undefined) {
    throw new Error(`Expected an ok persistence result, received ${JSON.stringify(result)}.`);
  }
  return result.value;
}

async function publishAndApproveProduct(
  database: MikroORM<PostgreSqlDriver>,
  owner: AgriTechOwner,
  partnerId: string,
  productId: string,
  keyPrefix: string,
): Promise<MarketplaceListingPublication> {
  const repository = new PostgresMarketplacePublicRepository(database.em.fork());
  const publication = valueOf(
    await repository.publishListing(owner, `${keyPrefix}-publish`, {
      section: 'seeds',
      sellerPartnerId: partnerId,
      sourceId: productId,
      sourceKind: 'product',
    }),
  );
  const queue = await repository.listPendingModeration(owner.tenantId);
  await Promise.all(
    queue.sellerProfiles.map(async (profile) => {
      valueOf(
        await repository.reviewSellerProfile(owner.tenantId, profile.sellerPublicId, `${keyPrefix}-profile-reviewer`, {
          decision: 'approved',
          expectedContentFingerprint: profile.contentFingerprint,
          expectedContentRevision: profile.contentRevision,
          idempotencyKey: `${keyPrefix}-approve-profile-${profile.contentRevision}`,
        }),
      );
    }),
  );
  const queued = queue.listings.find(({ publication: item }) => item.id === publication.id);
  if (!queued) {
    throw new Error(`Publication ${publication.id} was not queued for moderation.`);
  }
  valueOf(
    await repository.reviewListingPublication(owner.tenantId, publication.id, `${keyPrefix}-listing-reviewer`, {
      decision: 'approved',
      expectedRevision: queued.publication.revision,
      expectedSellerContentFingerprint: queued.seller.contentFingerprint,
      expectedSellerContentRevision: queued.seller.contentRevision,
      idempotencyKey: `${keyPrefix}-approve-listing`,
    }),
  );
  return publication;
}

async function insertAuthorizedSeller(em: EntityManager, owner: AgriTechOwner, partnerId: string): Promise<void> {
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, 'supplier', 'Promotion Farm', ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [partnerId, owner.tenantId, owner.userId, partnerId.replaceAll('-', '').slice(0, 20)],
  );
  await insertVerifiedSeller(em, owner);
}

async function insertVerifiedSeller(em: EntityManager, owner: AgriTechOwner): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, 'seller', 'verified', 'verified', true, 'legacy', 'legacy_unknown',
             '[]'::jsonb, now(), now())`,
    [randomUUID(), owner.tenantId, owner.userId],
  );
}

async function insertProduct(
  em: EntityManager,
  input: { id: string; name?: string; supplierId: string; tenantId: string },
): Promise<void> {
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, name_ru, name_uz, name_uz_cyrl, category, description,
       supplier_id, supplier_name, price_uzs, unit, stock_quantity, region, status, images,
       created_at, updated_at)
     values (?, ?, ?, null, null, null, 'seed', 'Certified source', ?, 'Promotion Farm',
             500000, 'kg', 100, 'Samarkand', 'active', '[]'::jsonb, now(), now())`,
    [input.id, input.tenantId, input.name ?? 'Promotion corn seed', input.supplierId],
  );
}

async function rows<T>(em: EntityManager, sql: string, parameters: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, parameters)) as T[];
}

async function insertRawPromotion(
  em: EntityManager,
  input: {
    activatedAt: Date;
    actorUserId: string;
    endsAt: Date;
    id: string;
    idempotencyKey: string;
    owner: AgriTechOwner;
    partnerId: string;
    publication: MarketplaceListingPublication;
    startsAt: Date;
    status: 'active' | 'scheduled';
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_listing_promotions
      (id, tenant_id, actor_user_id, seller_partner_id, seller_public_id, listing_publication_id,
       plan_code, status, starts_at, ends_at, price_uzs, currency, idempotency_key,
       request_fingerprint, activation_reference, activated_at, revision, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, 'catalog_7d', ?, ?, ?, 150000, 'UZS', ?, repeat('a', 64),
             ?, ?, 0, ?, ?)`,
    [
      input.id,
      input.owner.tenantId,
      input.actorUserId,
      input.partnerId,
      input.publication.sellerPublicId,
      input.publication.id,
      input.status,
      input.startsAt,
      input.endsAt,
      input.idempotencyKey,
      `promotion:${input.id}`,
      input.activatedAt,
      input.activatedAt,
      input.activatedAt,
    ],
  );
}

const promotionEntities = [
  AgriTechPartnerEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  BuyerRequestEntitySchema,
  FarmerEntitySchema,
  MarketplaceListingPromotionEntitySchema,
  MarketplaceAiConsultationEntitySchema,
  MarketplaceAiConsultationOperationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplacePublicationModerationOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  VerificationEntitySchema,
];
