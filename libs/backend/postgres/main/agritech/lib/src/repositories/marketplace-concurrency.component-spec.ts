// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-MARKETPLACE-016
import { randomUUID } from 'node:crypto';
import { LockMode, MikroORM, type EntityManager } from '@mikro-orm/core';
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
import {
  AgriTechPartnerEntity,
  AgriTechPartnerEntitySchema,
  AiConsultationEntity,
  AiConsultationEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntity,
  ContractEntitySchema,
  FavoriteEntitySchema,
  ProductEntity,
  ProductEntitySchema,
  RequestOfferEntitySchema,
  ReviewEntitySchema,
  SampleRequestEntitySchema,
  VerificationEntitySchema,
} from '../entities';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceRepository } from './marketplace.repository';
import { PostgresAgriTechOperationsRepository } from './operations.repository';

describe('AgriTech marketplace PostgreSQL integrity', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error(
        'AgriTech marketplace PostgreSQL component evidence requires an available Docker runtime; skipping is forbidden.',
      );
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, marketplaceEntities, {
        extensions: [Migrator],
        migrations: agritechMigrationOptions,
      }),
    );
    await orm.migrator.up({ to: 'Migration20260809000000CreateMarketplace' });
  });

  afterAll(async () => {
    await orm?.close(true);
    await stopPostgresContainer(container);
  });

  it('serializes buyer suspension ahead of request creation so no request is authorized from stale approval', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-request-approval-race';
    const buyer = { tenantId, userId: 'buyer-approval-race' };
    const partnerId = randomUUID();
    await insertPartner(database.em, { id: partnerId, kind: 'buyer', ownerUserId: buyer.userId, tenantId });

    let announceSuspensionLock!: () => void;
    const suspensionLocked = new Promise<void>((resolve) => {
      announceSuspensionLock = resolve;
    });
    let releaseSuspension!: () => void;
    const suspensionRelease = new Promise<void>((resolve) => {
      releaseSuspension = resolve;
    });
    const suspension = database.em.fork().transactional(async (em) => {
      const partner = await em.findOne(
        AgriTechPartnerEntity,
        { id: partnerId, tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!partner) {
        throw new Error('The approved buyer organization fixture must exist before suspension.');
      }
      partner.status = 'suspended';
      await em.flush();
      announceSuspensionLock();
      await suspensionRelease;
    });
    await suspensionLocked;

    let creationSettled = false;
    const creation = new PostgresMarketplaceRepository(database.em.fork())
      .createRequest(buyer, { region: 'Samarkand', title: 'Must not race suspension' })
      .finally(() => {
        creationSettled = true;
      });
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(creationSettled).toBe(false);
    } finally {
      releaseSuspension();
    }
    await suspension;

    await expect(creation).resolves.toEqual({ status: 'forbidden', field: 'organization' });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_requests
          where tenant_id = ? and buyer_user_id = ?`,
        [tenantId, buyer.userId],
      ),
    ).toEqual([{ count: 0 }]);
  });

  it('quarantines caller-authored legacy contracts and normalizes cross-tenant AI history', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-upgrade-a';
    const foreignTenantId = 'tenant-upgrade-b';
    const productId = randomUUID();
    const foreignProductId = randomUUID();
    const draftContractId = randomUUID();
    const signedContractId = randomUUID();
    const activeContractId = randomUUID();
    const legacySignedAt = new Date('2026-08-08T12:34:56.000Z');
    const recommendationId = randomUUID();
    const seasonId = randomUUID();
    const connection = database.em.getConnection();

    await insertProduct(database.em, { id: productId, supplierId: randomUUID(), tenantId });
    await insertProduct(database.em, {
      id: foreignProductId,
      supplierId: randomUUID(),
      tenantId: foreignTenantId,
    });
    await connection.execute(
      `insert into marketplace_contracts
        (id, tenant_id, buyer_user_id, seller_user_id, subject, amount_uzs, delivery_terms,
         delivery_price_uzs, factoring_enabled, status, signed_at, created_at, updated_at)
       values
        (?, ?, 'victim-buyer', 'attacker-seller', 'Caller-authored draft', 1000, 'pickup', null, true,
         'draft', null, now(), now()),
        (?, ?, 'victim-buyer', 'attacker-seller', 'Caller-authored signed', 1500, 'pickup', null, true,
         'signed', ?, now(), now()),
        (?, ?, 'victim-buyer', 'attacker-seller', 'Caller-authored active', 2000, 'pickup', null, true,
         'active', now(), now(), now())`,
      [draftContractId, tenantId, signedContractId, tenantId, legacySignedAt, activeContractId, tenantId],
    );
    const recommendation = new AiConsultationEntity();
    recommendation.id = recommendationId;
    recommendation.tenantId = tenantId;
    recommendation.userId = 'buyer-a';
    recommendation.kind = 'recommendation';
    recommendation.question = 'What should I buy?';
    recommendation.answer = 'Apply fertilizer in February' as never;
    recommendation.productIds = [productId, foreignProductId];
    const season = new AiConsultationEntity();
    season.id = seasonId;
    season.tenantId = tenantId;
    season.userId = 'buyer-a';
    season.kind = 'season_advice';
    season.question = 'When should I sow?';
    season.answer = 'Sow in October' as never;
    season.productIds = [productId];
    database.em.persist([recommendation, season]);
    await database.em.flush();
    database.em.clear();

    await database.migrator.up();

    const contracts = await rows<{
      buyerSignedAt: Date | null;
      factoringEnabled: boolean;
      id: string;
      legacyFactoringEnabled: boolean;
      legacySignedAt: string | null;
      legacyStatus: string;
      sellerSignedAt: Date | null;
      signedAt: Date | null;
      status: string;
    }>(
      database.em,
      `select id, status, legacy_status as "legacyStatus", signed_at as "signedAt",
              to_char(legacy_signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "legacySignedAt",
              buyer_signed_at as "buyerSignedAt",
              seller_signed_at as "sellerSignedAt",
              factoring_enabled as "factoringEnabled",
              legacy_factoring_enabled as "legacyFactoringEnabled"
         from marketplace_contracts
        where id in (?, ?, ?)
        order by legacy_status`,
      [draftContractId, signedContractId, activeContractId],
    );
    expect(contracts).toEqual([
      expect.objectContaining({
        buyerSignedAt: null,
        factoringEnabled: false,
        legacyFactoringEnabled: true,
        legacyStatus: 'active',
        sellerSignedAt: null,
        signedAt: null,
        status: 'legacy_review_required',
      }),
      expect.objectContaining({
        buyerSignedAt: null,
        factoringEnabled: false,
        legacyFactoringEnabled: true,
        legacyStatus: 'draft',
        sellerSignedAt: null,
        signedAt: null,
        status: 'legacy_review_required',
      }),
      expect.objectContaining({
        buyerSignedAt: null,
        factoringEnabled: false,
        legacyFactoringEnabled: true,
        legacySignedAt: legacySignedAt.toISOString(),
        legacyStatus: 'signed',
        sellerSignedAt: null,
        signedAt: null,
        status: 'legacy_review_required',
      }),
    ]);

    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).signContract(
        { tenantId, userId: 'victim-buyer' },
        signedContractId,
      ),
    ).resolves.toEqual({ status: 'invalid_state' });

    const consultations = await rows<{ answer: string; id: string; productIds: string[] }>(
      database.em,
      `select id, answer, product_ids as "productIds"
         from marketplace_ai_consultations
        where id in (?, ?)
        order by id`,
      [recommendationId, seasonId],
    );
    expect(consultations).toEqual(
      expect.arrayContaining([
        { answer: 'catalog_match', id: recommendationId, productIds: [productId] },
        { answer: 'no_catalog_match', id: seasonId, productIds: [] },
      ]),
    );
    await expect(
      connection.execute('update marketplace_contracts set factoring_enabled = true where id = ?', [draftContractId]),
    ).rejects.toThrow(/ck__marketplace_contracts__factoring_disabled/u);
    await expect(
      connection.execute("update marketplace_ai_consultations set answer = 'invented prose' where id = ?", [
        recommendationId,
      ]),
    ).rejects.toThrow(/ck__marketplace_ai__answer/u);
  });

  it('keeps marketplace money metadata aligned with every migrated numeric(15,2) column', async () => {
    const database = requireOrm(orm);
    const expectedMetadata = { precision: 15, scale: 2, type: 'numeric' };

    expect(BuyerRequestEntitySchema.meta.properties.budgetUzs).toMatchObject(expectedMetadata);
    expect(RequestOfferEntitySchema.meta.properties.priceUzs).toMatchObject(expectedMetadata);
    expect(RequestOfferEntitySchema.meta.properties.deliveryPriceUzs).toMatchObject(expectedMetadata);
    expect(ContractEntitySchema.meta.properties.amountUzs).toMatchObject(expectedMetadata);
    expect(ContractEntitySchema.meta.properties.deliveryPriceUzs).toMatchObject(expectedMetadata);

    expect(
      await rows<{
        columnName: string;
        numericPrecision: number;
        numericScale: number;
        tableName: string;
      }>(
        database.em,
        `select table_name as "tableName", column_name as "columnName",
                numeric_precision::int as "numericPrecision", numeric_scale::int as "numericScale"
           from information_schema.columns
          where table_schema = 'public'
            and (table_name, column_name) in (
              ('marketplace_requests', 'budget_uzs'),
              ('marketplace_request_offers', 'price_uzs'),
              ('marketplace_request_offers', 'delivery_price_uzs'),
              ('marketplace_contracts', 'amount_uzs'),
              ('marketplace_contracts', 'delivery_price_uzs')
            )
          order by table_name, column_name`,
      ),
    ).toEqual([
      {
        columnName: 'amount_uzs',
        numericPrecision: 15,
        numericScale: 2,
        tableName: 'marketplace_contracts',
      },
      {
        columnName: 'delivery_price_uzs',
        numericPrecision: 15,
        numericScale: 2,
        tableName: 'marketplace_contracts',
      },
      {
        columnName: 'delivery_price_uzs',
        numericPrecision: 15,
        numericScale: 2,
        tableName: 'marketplace_request_offers',
      },
      {
        columnName: 'price_uzs',
        numericPrecision: 15,
        numericScale: 2,
        tableName: 'marketplace_request_offers',
      },
      {
        columnName: 'budget_uzs',
        numericPrecision: 15,
        numericScale: 2,
        tableName: 'marketplace_requests',
      },
    ]);
  });

  it('keeps every migrated marketplace table, constraint, and foreign key free of schema drift', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();

    const marketplaceConstraints = await rows<{
      constraintType: string;
      deleteAction: string;
      name: string;
      tableName: string;
    }>(
      database.em,
      `select constraint_table.relname as "tableName", constraint_record.conname as name,
              constraint_record.contype as "constraintType", constraint_record.confdeltype as "deleteAction"
         from pg_constraint as constraint_record
         join pg_class as constraint_table on constraint_table.oid = constraint_record.conrelid
         join pg_namespace as constraint_namespace on constraint_namespace.oid = constraint_table.relnamespace
        where constraint_namespace.nspname = 'public'
          and constraint_table.relname like 'marketplace_%'
        order by constraint_record.conname`,
    );
    expect(marketplaceConstraints.map(({ name }) => name)).toEqual([
      'ck__marketplace_ai__answer',
      'ck__marketplace_ai__kind',
      'ck__marketplace_ai__product_ids_array',
      'ck__marketplace_carts__status',
      'ck__marketplace_contracts__amount',
      'ck__marketplace_contracts__delivery_days',
      'ck__marketplace_contracts__delivery_price',
      'ck__marketplace_contracts__delivery_terms',
      'ck__marketplace_contracts__factoring_disabled',
      'ck__marketplace_contracts__party_consent',
      'ck__marketplace_contracts__source_pair',
      'ck__marketplace_contracts__source_type',
      'ck__marketplace_contracts__status',
      'ck__marketplace_offers__delivery_price',
      'ck__marketplace_offers__delivery_terms',
      'ck__marketplace_offers__price',
      'ck__marketplace_offers__status',
      'ck__marketplace_requests__status',
      'ck__marketplace_reviews__rating',
      'ck__marketplace_sample_requests__status',
      'ck__marketplace_verifications__level',
      'ck__marketplace_verifications__rejection_reason',
      'ck__marketplace_verifications__role',
      'ck__marketplace_verifications__status',
      'fk__marketplace_offers__request',
      'pk__marketplace_ai_consultations',
      'pk__marketplace_carts',
      'pk__marketplace_contracts',
      'pk__marketplace_favorites',
      'pk__marketplace_request_offers',
      'pk__marketplace_requests',
      'pk__marketplace_reviews',
      'pk__marketplace_sample_requests',
      'pk__marketplace_verifications',
      'uq__marketplace_contracts__tenant_id_source_type_source_id',
      'uq__marketplace_reviews__tenant_id_product_id_user_id',
      'ux__marketplace_verifications__tenant_user',
    ]);
    expect(marketplaceConstraints.find(({ name }) => name === 'fk__marketplace_offers__request')).toMatchObject({
      constraintType: 'f',
      deleteAction: 'c',
      tableName: 'marketplace_request_offers',
    });

    const updateSql = await database.schema.getUpdateSchemaSQL();
    const marketplaceSchemaDrift = updateSql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.includes('"marketplace_'));
    expect(marketplaceSchemaDrift).toEqual([]);
  });

  it('serializes final consent so only one competing contract consumes finite stock', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const tenantId = 'tenant-contention';
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    const buyerA = 'buyer-a';
    const buyerB = 'buyer-b';
    const seller = 'seller-owner';
    const cartA = randomUUID();
    const cartB = randomUUID();

    await insertPartner(database.em, { id: sellerPartnerId, ownerUserId: seller, tenantId });
    await insertPartner(database.em, {
      id: randomUUID(),
      kind: 'buyer',
      ownerUserId: buyerA,
      tenantId,
    });
    await insertPartner(database.em, {
      id: randomUUID(),
      kind: 'buyer',
      ownerUserId: buyerB,
      tenantId,
    });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: seller });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyerA });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyerB });
    await insertProduct(database.em, {
      id: productId,
      stockQuantity: 10,
      supplierId: sellerPartnerId,
      tenantId,
    });
    await insertCart(database.em, { buyerUserId: buyerA, cartId: cartA, productId, sellerPartnerId, tenantId });
    await insertCart(database.em, { buyerUserId: buyerB, cartId: cartB, productId, sellerPartnerId, tenantId });

    const checkoutA = await new PostgresMarketplaceRepository(database.em.fork()).checkoutCart(
      { tenantId, userId: buyerA },
      cartA,
      { deliveryTerms: 'pickup' },
    );
    const checkoutB = await new PostgresMarketplaceRepository(database.em.fork()).checkoutCart(
      { tenantId, userId: buyerB },
      cartB,
      { deliveryTerms: 'pickup' },
    );
    if (checkoutA.status !== 'ok' || checkoutB.status !== 'ok') {
      throw new Error('Both server-priced drafts should be created before inventory commitment.');
    }
    await new PostgresMarketplaceRepository(database.em.fork()).signContract(
      { tenantId, userId: buyerA },
      checkoutA.value.contractId,
    );
    await new PostgresMarketplaceRepository(database.em.fork()).signContract(
      { tenantId, userId: buyerB },
      checkoutB.value.contractId,
    );

    const results = await Promise.all([
      new PostgresMarketplaceRepository(database.em.fork()).signContract(
        { tenantId, userId: seller },
        checkoutA.value.contractId,
      ),
      new PostgresMarketplaceRepository(database.em.fork()).signContract(
        { tenantId, userId: seller },
        checkoutB.value.contractId,
      ),
    ]);

    expect(results.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'conflict')).toHaveLength(1);
    const products = await rows<{ status: string; stockQuantity: number }>(
      database.em,
      'select status, stock_quantity as "stockQuantity" from products where id = ?',
      [productId],
    );
    expect(products).toEqual([{ status: 'active', stockQuantity: 4 }]);
    const contracts = await rows<{ status: string }>(
      database.em,
      'select status from marketplace_contracts where id in (?, ?) order by status',
      [checkoutA.value.contractId, checkoutB.value.contractId],
    );
    expect(contracts).toEqual([{ status: 'active' }, { status: 'signed' }]);
  });

  it('serializes supplier stock updates ahead of final consent without resurrecting sold stock', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const tenantId = 'tenant-product-update-contention';
    const seller = { tenantId, userId: 'seller-update-contention' };
    const buyer = { tenantId, userId: 'buyer-update-contention' };
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    const cartId = randomUUID();

    await insertPartner(database.em, {
      id: sellerPartnerId,
      ownerUserId: seller.userId,
      tenantId,
    });
    await insertPartner(database.em, {
      id: randomUUID(),
      kind: 'buyer',
      ownerUserId: buyer.userId,
      tenantId,
    });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: seller.userId });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyer.userId });
    await insertProduct(database.em, {
      id: productId,
      priceUzs: 500_000,
      stockQuantity: 10,
      supplierId: sellerPartnerId,
      tenantId,
    });
    await insertCart(database.em, {
      buyerUserId: buyer.userId,
      cartId,
      productId,
      sellerPartnerId,
      tenantId,
    });

    const marketplace = new PostgresMarketplaceRepository(database.em.fork());
    const checkout = await marketplace.checkoutCart(buyer, cartId, { deliveryTerms: 'pickup' });
    if (checkout.status !== 'ok') {
      throw new Error('The server-priced contract fixture must be created before stock-update contention.');
    }
    await expect(marketplace.signContract(buyer, checkout.value.contractId)).resolves.toMatchObject({
      status: 'ok',
      value: { status: 'signed' },
    });

    let announceProductLocked!: () => void;
    const productLocked = new Promise<void>((resolve) => {
      announceProductLocked = resolve;
    });
    let releaseProductUpdate!: () => void;
    const productUpdateRelease = new Promise<void>((resolve) => {
      releaseProductUpdate = resolve;
    });
    const updateEm = coordinatedProductUpdateEntityManager(
      database.em.fork(),
      productId,
      announceProductLocked,
      productUpdateRelease,
    );

    let updateSettled = false;
    const update = new PostgresAgriTechOperationsRepository(updateEm)
      .updateSupplierProduct(seller, productId, {
        priceUzs: 600_000,
        status: 'active',
        stockQuantity: 10,
      })
      .finally(() => {
        updateSettled = true;
      });
    await productLocked;
    expect(updateSettled).toBe(false);

    let consentSettled = false;
    const finalConsent = new PostgresMarketplaceRepository(database.em.fork())
      .signContract(seller, checkout.value.contractId)
      .finally(() => {
        consentSettled = true;
      });
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(consentSettled).toBe(false);
    } finally {
      releaseProductUpdate();
    }

    await expect(update).resolves.toMatchObject({
      status: 'ok',
      value: { priceUzs: 600_000, stockQuantity: 10 },
    });
    await expect(finalConsent).resolves.toMatchObject({ status: 'ok', value: { status: 'active' } });
    expect(
      await rows<{ priceUzs: number; status: string; stockQuantity: number }>(
        database.em,
        `select price_uzs::int as "priceUzs", status, stock_quantity as "stockQuantity"
           from products
          where tenant_id = ? and id = ?`,
        [tenantId, productId],
      ),
    ).toEqual([{ priceUzs: 600_000, status: 'active', stockQuantity: 4 }]);
  });

  it('serializes competing offer selection and rolls back every mutation on a duplicate contract source', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const tenantId = 'tenant-offer-contention';
    const buyer = { tenantId, userId: 'buyer-offers' };
    const sellerA = { tenantId, userId: 'seller-a' };
    const sellerB = { tenantId, userId: 'seller-b' };

    await insertPartner(database.em, { id: randomUUID(), kind: 'buyer', ownerUserId: buyer.userId, tenantId });
    await insertPartner(database.em, { id: randomUUID(), ownerUserId: sellerA.userId, tenantId });
    await insertPartner(database.em, { id: randomUUID(), ownerUserId: sellerB.userId, tenantId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: sellerA.userId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: sellerB.userId });

    const request = await new PostgresMarketplaceRepository(database.em.fork()).createRequest(buyer, {
      title: 'Certified corn seed',
      region: 'Samarkand',
    });
    if (request.status !== 'ok') {
      throw new Error('The buyer request fixture must be persisted before offer contention.');
    }
    const offerA = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      sellerA,
      request.value.id,
      4_100_000,
      'pickup',
    );
    const offerB = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      sellerB,
      request.value.id,
      4_200_000,
      'pickup',
    );
    if (offerA.status !== 'ok' || offerB.status !== 'ok') {
      throw new Error('Both seller offers must be persisted before selection contention.');
    }

    const selections = await Promise.all([
      new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(buyer, request.value.id, offerA.value.id),
      new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(buyer, request.value.id, offerB.value.id),
    ]);

    expect(selections.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(selections.filter(({ status }) => status === 'conflict')).toHaveLength(1);
    expect(selections.find(({ status }) => status === 'conflict')).toEqual({ status: 'conflict', field: 'status' });
    expect(
      await rows<{ status: string }>(database.em, 'select status from marketplace_requests where id = ?', [
        request.value.id,
      ]),
    ).toEqual([{ status: 'selected' }]);
    const selectedOffers = await rows<{ id: string; status: string }>(
      database.em,
      'select id, status from marketplace_request_offers where request_id = ? order by status, id',
      [request.value.id],
    );
    expect(selectedOffers.map(({ status }) => status).sort((left, right) => left.localeCompare(right))).toEqual([
      'accepted',
      'declined',
    ]);
    const selectedContracts = await rows<{ sourceId: string }>(
      database.em,
      `select source_id as "sourceId"
         from marketplace_contracts
        where tenant_id = ? and source_type = 'offer_selection' and source_id in (?, ?)`,
      [tenantId, offerA.value.id, offerB.value.id],
    );
    expect(selectedContracts).toHaveLength(1);
    expect(selectedOffers.find(({ status }) => status === 'accepted')?.id).toBe(selectedContracts[0]?.sourceId);

    const rollbackRequest = await new PostgresMarketplaceRepository(database.em.fork()).createRequest(buyer, {
      title: 'Rollback source conflict',
      region: 'Samarkand',
    });
    if (rollbackRequest.status !== 'ok') {
      throw new Error('The rollback request fixture must be persisted.');
    }
    const rollbackOffer = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      sellerA,
      rollbackRequest.value.id,
      4_300_000,
      'pickup',
    );
    if (rollbackOffer.status !== 'ok') {
      throw new Error('The rollback offer fixture must be persisted.');
    }
    const existingSourceContract = new ContractEntity();
    existingSourceContract.id = randomUUID();
    existingSourceContract.tenantId = tenantId;
    existingSourceContract.buyerUserId = buyer.userId;
    existingSourceContract.sellerUserId = sellerA.userId;
    existingSourceContract.sourceType = 'offer_selection';
    existingSourceContract.sourceId = rollbackOffer.value.id;
    existingSourceContract.subject = 'Pre-existing source record';
    existingSourceContract.amountUzs = 4_300_000;
    existingSourceContract.deliveryTerms = 'pickup';
    existingSourceContract.deliveryPriceUzs = 0;
    database.em.persist(existingSourceContract);
    await database.em.flush();
    database.em.clear();

    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(
        buyer,
        rollbackRequest.value.id,
        rollbackOffer.value.id,
      ),
    ).rejects.toThrow(/uq__marketplace_contracts__tenant_id_source_type_source_id|unique constraint/u);

    expect(
      await rows<{ status: string }>(database.em, 'select status from marketplace_requests where id = ?', [
        rollbackRequest.value.id,
      ]),
    ).toEqual([{ status: 'offering' }]);
    expect(
      await rows<{ status: string }>(database.em, 'select status from marketplace_request_offers where id = ?', [
        rollbackOffer.value.id,
      ]),
    ).toEqual([{ status: 'pending' }]);
    expect(
      await rows<{ id: string }>(
        database.em,
        `select id
           from marketplace_contracts
          where tenant_id = ? and source_type = 'offer_selection' and source_id = ?`,
        [tenantId, rollbackOffer.value.id],
      ),
    ).toEqual([{ id: existingSourceContract.id }]);
  });

  it('serializes competing verification decisions with one conflict result', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const tenantId = 'tenant-verification-contention';
    const verificationId = randomUUID();
    await insertVerification(database.em, {
      id: verificationId,
      role: 'buyer',
      status: 'pending',
      tenantId,
      userId: 'reviewed-buyer',
    });

    const decisions = await Promise.all([
      new PostgresMarketplaceRepository(database.em.fork()).reviewVerification(
        tenantId,
        verificationId,
        'verified',
        'admin-approve',
      ),
      new PostgresMarketplaceRepository(database.em.fork()).reviewVerification(
        tenantId,
        verificationId,
        'rejected',
        'admin-reject',
        'criteria_not_met',
      ),
    ]);

    expect(decisions.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(decisions.filter(({ status }) => status === 'conflict')).toHaveLength(1);
    const winningDecision = decisions.find(({ status }) => status === 'ok');
    if (!winningDecision || winningDecision.status !== 'ok') {
      throw new Error('One serialized verification decision must succeed.');
    }
    expect(
      await rows<{ reviewedBy: string; status: string }>(
        database.em,
        `select reviewed_by as "reviewedBy", status
           from marketplace_verifications
          where id = ?`,
        [verificationId],
      ),
    ).toEqual([{ reviewedBy: winningDecision.value.reviewedBy, status: winningDecision.value.status }]);
  });

  it('allows one cart delivery quote and preserves accepted-offer delivery terms', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const tenantId = 'tenant-delivery-quote';
    const buyer = { tenantId, userId: 'quote-buyer' };
    const seller = { tenantId, userId: 'quote-seller' };
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    const cartId = randomUUID();
    await insertPartner(database.em, { id: randomUUID(), kind: 'buyer', ownerUserId: buyer.userId, tenantId });
    await insertPartner(database.em, { id: sellerPartnerId, ownerUserId: seller.userId, tenantId });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyer.userId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: seller.userId });
    await insertProduct(database.em, { id: productId, supplierId: sellerPartnerId, tenantId });
    await insertCart(database.em, { buyerUserId: buyer.userId, cartId, productId, sellerPartnerId, tenantId });

    const favoriteResults = await Promise.all([
      new PostgresMarketplaceRepository(database.em.fork()).addFavorite(buyer, productId),
      new PostgresMarketplaceRepository(database.em.fork()).addFavorite(buyer, productId),
    ]);
    expect(favoriteResults.every(({ status }) => status === 'ok')).toBe(true);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_favorites
          where tenant_id = ? and user_id = ? and product_id = ?`,
        [tenantId, buyer.userId, productId],
      ),
    ).toEqual([{ count: 1 }]);

    const checkout = await new PostgresMarketplaceRepository(database.em.fork()).checkoutCart(buyer, cartId, {
      deliveryTerms: 'seller_delivery',
    });
    if (checkout.status !== 'ok') {
      throw new Error('The unquoted cart contract fixture must be persisted.');
    }
    const quoted = await new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
      seller,
      checkout.value.contractId,
      { deliveryDays: 2, deliveryNote: 'Farm gate', deliveryPriceUzs: 250_000 },
    );
    expect(quoted).toMatchObject({ status: 'ok', value: { deliveryPriceUzs: 250_000 } });
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
        seller,
        checkout.value.contractId,
        { deliveryPriceUzs: 300_000 },
      ),
    ).resolves.toMatchObject({ status: 'invalid_state' });

    const request = await new PostgresMarketplaceRepository(database.em.fork()).createRequest(buyer, {
      region: 'Samarkand',
      title: 'Immutable offer terms',
    });
    if (request.status !== 'ok') {
      throw new Error('The quote request fixture must be persisted.');
    }
    const offer = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      seller,
      request.value.id,
      4_000_000,
      'seller_delivery',
      800_000,
      'Accepted seller delivery',
      4,
    );
    if (offer.status !== 'ok') {
      throw new Error('The quoted offer fixture must be persisted.');
    }
    const selection = await new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(
      buyer,
      request.value.id,
      offer.value.id,
    );
    if (selection.status !== 'ok') {
      throw new Error('The selected offer contract fixture must be persisted.');
    }
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
        seller,
        selection.value.contractId,
        { deliveryPriceUzs: 900_000 },
      ),
    ).resolves.toMatchObject({ status: 'invalid_state' });
    expect(
      await rows<{ deliveryPriceUzs: number; id: string }>(
        database.em,
        `select id, delivery_price_uzs::int as "deliveryPriceUzs"
           from marketplace_contracts
          where id in (?, ?)
          order by delivery_price_uzs`,
        [checkout.value.contractId, selection.value.contractId],
      ),
    ).toEqual([
      { deliveryPriceUzs: 250_000, id: checkout.value.contractId },
      { deliveryPriceUzs: 800_000, id: selection.value.contractId },
    ]);
  });

  it('grounds find-cheaper results in the requested catalog terms beyond the first fifty rows', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const tenantId = 'tenant-ai-search';
    await Promise.all(
      Array.from({ length: 55 }, (_, index) =>
        insertProduct(database.em, {
          category: 'equipment',
          description: 'Irrigation pump',
          id: randomUUID(),
          name: `Cheap pump ${index}`,
          priceUzs: index + 1,
          supplierId: randomUUID(),
          tenantId,
        }),
      ),
    );
    const cornProductId = randomUUID();
    await insertProduct(database.em, {
      category: 'seed',
      description: 'Corn seed',
      id: cornProductId,
      name: 'Corn seed hybrid',
      priceUzs: 500_000,
      supplierId: randomUUID(),
      tenantId,
    });

    const result = await new PostgresMarketplaceRepository(database.em.fork()).askAi(
      { tenantId, userId: 'buyer-ai' },
      'find_cheaper',
      'Find cheaper corn seed',
    );

    expect(result).toMatchObject({
      status: 'ok',
      value: { answer: 'catalog_match', productIds: [cornProductId] },
    });
  });
});

function requireOrm(orm: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!orm) {
    throw new Error('AgriTech marketplace PostgreSQL component database was not initialized.');
  }
  return orm;
}

type TransactionalRunner = <T>(callback: (em: EntityManager) => Promise<T>) => Promise<T>;
type FindOneParameters = Parameters<EntityManager['findOne']>;
type FindOneRunner = (...parameters: FindOneParameters) => ReturnType<EntityManager['findOne']>;

function coordinatedProductUpdateEntityManager(
  em: EntityManager,
  productId: string,
  announceProductLocked: () => void,
  productUpdateRelease: Promise<void>,
): EntityManager {
  const transactional: TransactionalRunner = em.transactional.bind(em);
  return new Proxy(em, {
    get(target, property): unknown {
      if (property === 'transactional') {
        return <T>(callback: (transactionEm: EntityManager) => Promise<T>): Promise<T> =>
          transactional((transactionEm) =>
            callback(
              coordinatedProductFindOneEntityManager(
                transactionEm,
                productId,
                announceProductLocked,
                productUpdateRelease,
              ),
            ),
          );
      }
      return boundProperty(target, property);
    },
  });
}

function coordinatedProductFindOneEntityManager(
  em: EntityManager,
  productId: string,
  announceProductLocked: () => void,
  productUpdateRelease: Promise<void>,
): EntityManager {
  const findOne: FindOneRunner = em.findOne.bind(em);
  let productReadPaused = false;
  return new Proxy(em, {
    get(target, property): unknown {
      if (property === 'findOne') {
        return async (...parameters: FindOneParameters): ReturnType<EntityManager['findOne']> => {
          const [entityName, where, options] = parameters;
          const entity = await findOne(...parameters);
          if (!productReadPaused && entityName === ProductEntity && hasEntityId(where, productId)) {
            expect(options?.lockMode).toBe(LockMode.PESSIMISTIC_WRITE);
            productReadPaused = true;
            announceProductLocked();
            await productUpdateRelease;
          }
          return entity;
        };
      }
      return boundProperty(target, property);
    },
  });
}

function boundProperty(target: EntityManager, property: string | symbol): unknown {
  const value: unknown = Reflect.get(target, property, target);
  if (typeof value !== 'function') {
    return value;
  }
  const bound: unknown = value.bind(target);
  return bound;
}

function hasEntityId(where: unknown, id: string): boolean {
  return typeof where === 'object' && where !== null && 'id' in where && where.id === id;
}

const marketplaceEntities = [
  AgriTechPartnerEntitySchema,
  AiConsultationEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntitySchema,
  FavoriteEntitySchema,
  ProductEntitySchema,
  RequestOfferEntitySchema,
  ReviewEntitySchema,
  SampleRequestEntitySchema,
  VerificationEntitySchema,
];

async function insertProduct(
  em: EntityManager,
  input: {
    category?: 'equipment' | 'seed';
    description?: string;
    id: string;
    name?: string;
    priceUzs?: number;
    stockQuantity?: number;
    supplierId: string;
    tenantId: string;
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, category, description, supplier_id, supplier_name, price_uzs, unit,
       stock_quantity, region, status, images, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, 'Supplier', ?, 'kg', ?,
             'Samarkand', 'active', '[]'::jsonb, now(), now())`,
    [
      input.id,
      input.tenantId,
      input.name ?? 'Corn seed',
      input.category ?? 'seed',
      input.description ?? 'Certified seed',
      input.supplierId,
      input.priceUzs ?? 500_000,
      input.stockQuantity ?? 100,
    ],
  );
}

async function insertPartner(
  em: EntityManager,
  input: { id: string; kind?: 'buyer' | 'supplier'; ownerUserId: string; tenantId: string },
): Promise<void> {
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, ?, 'Marketplace organization', ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [input.id, input.tenantId, input.ownerUserId, input.kind ?? 'supplier', input.id.replaceAll('-', '').slice(0, 20)],
  );
}

async function insertVerification(
  em: EntityManager,
  input: { id?: string; role: 'buyer' | 'seller'; status?: 'pending' | 'verified'; tenantId: string; userId: string },
): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', ?, true, '[]'::jsonb, now(), now())`,
    [input.id ?? randomUUID(), input.tenantId, input.userId, input.role, input.status ?? 'verified'],
  );
}

async function insertCart(
  em: EntityManager,
  input: {
    buyerUserId: string;
    cartId: string;
    productId: string;
    sellerPartnerId: string;
    tenantId: string;
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_carts
      (id, tenant_id, user_id, seller_id, items, status, created_at, updated_at)
     values (?, ?, ?, ?, jsonb_build_array(jsonb_build_object('productId', ?, 'quantity', 6)), 'open', now(), now())`,
    [input.cartId, input.tenantId, input.buyerUserId, input.sellerPartnerId, input.productId],
  );
}

async function rows<T>(em: EntityManager, sql: string, params: unknown[] = []): Promise<T[]> {
  const result: unknown = await em.getConnection().execute(sql, params);
  return result as T[];
}
