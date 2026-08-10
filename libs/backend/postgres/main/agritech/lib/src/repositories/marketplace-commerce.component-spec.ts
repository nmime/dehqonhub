// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { createHash, randomUUID } from 'node:crypto';
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
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntitySchema,
  MarketplaceCommerceOperationEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceProduceOrganizationBindingEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestOrganizationBindingEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  RequestOfferEntitySchema,
  VerificationEntitySchema,
  VerificationEvidenceEntitySchema,
} from '../entities';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceRepository } from './marketplace.repository';

describe('Marketplace commerce PostgreSQL boundaries', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error('Marketplace commerce PostgreSQL evidence requires Docker; skipping is forbidden.');
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, commerceEntities, {
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

  it('resolves an opaque listing to exact cross-tenant parties and freezes server-authoritative terms idempotently', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'commerce-buyer-tenant', userId: 'commerce-buyer' };
    const seller = { tenantId: 'commerce-seller-tenant', userId: 'commerce-seller' };
    const buyerPartnerId = randomUUID();
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertVerification(database.em, { owner: buyer, role: 'buyer' });
    await insertVerification(database.em, { owner: seller, role: 'seller' });
    await insertProduct(database.em, { id: productId, owner: seller, sellerPartnerId });
    const listingPublicationId = await publishProduct(database.em, {
      owner: seller,
      productId,
      sellerPartnerId,
    });

    const repository = new PostgresMarketplaceRepository(database.em.fork());
    const input = { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 };
    const added = await repository.addToCart(buyer, input, 'commerce-add-0001');
    expect(added).toMatchObject({
      status: 'ok',
      value: {
        buyerPartnerId,
        buyerTenantId: buyer.tenantId,
        sellerPartnerId,
        sellerTenantId: seller.tenantId,
        items: [{ listingPublicationId, quantity: 2, sourceId: productId }],
      },
    });
    await expect(repository.addToCart(buyer, input, 'commerce-add-0001')).resolves.toEqual(added);
    await expect(repository.addToCart(buyer, { ...input, quantity: 3 }, 'commerce-add-0001')).resolves.toEqual({
      status: 'conflict',
      field: 'idempotencyKey',
    });
    await expect(
      repository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: productId, quantity: 1 },
        'private-source-0001',
      ),
    ).resolves.toEqual({ status: 'not_found', field: 'listingPublicationId' });
    if (added.status !== 'ok') {
      throw new Error('The cart fixture must be persisted.');
    }

    const checkout = await repository.checkoutCart(
      buyer,
      added.value.id,
      { deliveryTerms: 'pickup' },
      'commerce-checkout-0001',
    );
    await expect(
      repository.checkoutCart(buyer, added.value.id, { deliveryTerms: 'pickup' }, 'commerce-checkout-0001'),
    ).resolves.toEqual(checkout);
    if (checkout.status !== 'ok') {
      throw new Error('The contract fixture must be persisted.');
    }
    await database.em.getConnection().execute('update products set price_uzs = 1 where id = ?', [productId]);

    const [persistedContract] = await rows<{
      amountUzs: number;
      buyerPartnerId: string;
      buyerSnapshot: Record<string, string>;
      lines: Array<Record<string, unknown>>;
      sellerPartnerId: string;
      sellerSnapshot: Record<string, string>;
      sellerTenantId: string;
    }>(
      database.em,
      `select amount_uzs::int as "amountUzs", buyer_partner_id as "buyerPartnerId",
              seller_tenant_id as "sellerTenantId", seller_partner_id as "sellerPartnerId",
              buyer_party_snapshot as "buyerSnapshot", seller_party_snapshot as "sellerSnapshot", lines
         from marketplace_contracts where id = ?`,
      [checkout.value.contractId],
    );
    expect(persistedContract).toMatchObject({
      amountUzs: 1_000_000,
      buyerPartnerId,
      sellerPartnerId,
      sellerTenantId: seller.tenantId,
    });
    expect(persistedContract?.buyerSnapshot).toMatchObject({
      partnerId: buyerPartnerId,
      tenantId: buyer.tenantId,
      userId: buyer.userId,
    });
    expect(persistedContract?.sellerSnapshot).toMatchObject({
      partnerId: sellerPartnerId,
      tenantId: seller.tenantId,
      userId: seller.userId,
    });
    expect(persistedContract?.lines[0]).toMatchObject({
      lineTotalUzs: 1_000_000,
      sourceId: productId,
      sourcePublicationId: listingPublicationId,
      sourceRevision: 1,
      unitPriceUzs: 500_000,
    });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_commerce_operations
          where actor_tenant_id = ? and actor_user_id = ?`,
        [buyer.tenantId, buyer.userId],
      ),
    ).toEqual([{ count: 2 }]);
  });

  it('denies a foreign organization selector and serializes membership revocation ahead of checkout', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'membership-buyer-tenant', userId: 'membership-buyer' };
    const otherBuyer = { tenantId: buyer.tenantId, userId: 'membership-other-buyer' };
    const seller = { tenantId: 'membership-seller-tenant', userId: 'membership-seller' };
    const buyerPartnerId = randomUUID();
    const otherBuyerPartnerId = randomUUID();
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: otherBuyerPartnerId, kind: 'buyer', owner: otherBuyer });
    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertVerification(database.em, { owner: buyer, role: 'buyer' });
    await insertVerification(database.em, { owner: otherBuyer, role: 'buyer' });
    await insertVerification(database.em, { owner: seller, role: 'seller' });
    await insertProduct(database.em, { id: productId, owner: seller, sellerPartnerId });
    const listingPublicationId = await publishProduct(database.em, {
      owner: seller,
      productId,
      sellerPartnerId,
    });
    const repository = new PostgresMarketplaceRepository(database.em.fork());

    await expect(
      repository.addToCart(
        buyer,
        { actingPartnerId: otherBuyerPartnerId, listingPublicationId, quantity: 1 },
        'foreign-member-0001',
      ),
    ).resolves.toEqual({ status: 'forbidden', field: 'organization' });
    const added = await repository.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 1 },
      'revocation-cart-0001',
    );
    if (added.status !== 'ok') {
      throw new Error('The revocation cart fixture must be persisted.');
    }

    let announceMembershipLocked!: () => void;
    const membershipLocked = new Promise<void>((resolve) => {
      announceMembershipLocked = resolve;
    });
    let releaseRevocation!: () => void;
    const revocationRelease = new Promise<void>((resolve) => {
      releaseRevocation = resolve;
    });
    const revocation = database.em.fork().transactional(async (em) => {
      await em.execute(
        `select id from marketplace_partner_memberships
          where tenant_id = ? and user_id = ? and partner_id = ? and capability = 'buyer'
          for update`,
        [buyer.tenantId, buyer.userId, buyerPartnerId],
      );
      await em.execute(
        `update marketplace_partner_memberships
            set status = 'revoked', revoked_at = now(), revision = revision + 1, updated_at = now()
          where tenant_id = ? and user_id = ? and partner_id = ? and capability = 'buyer'`,
        [buyer.tenantId, buyer.userId, buyerPartnerId],
      );
      announceMembershipLocked();
      await revocationRelease;
    });
    await membershipLocked;

    let checkoutSettled = false;
    const checkout = new PostgresMarketplaceRepository(database.em.fork())
      .checkoutCart(buyer, added.value.id, { deliveryTerms: 'pickup' }, 'revocation-checkout-0001')
      .finally(() => {
        checkoutSettled = true;
      });
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(checkoutSettled).toBe(false);
    } finally {
      releaseRevocation();
    }
    await revocation;
    await expect(checkout).resolves.toEqual({ status: 'forbidden', field: 'organization' });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_contracts
          where source_type = 'cart_checkout' and source_id = ?`,
        [added.value.id],
      ),
    ).toEqual([{ count: 0 }]);
  });

  it('accepts offers only through an approved opaque request publication and freezes both organizations', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'request-buyer-tenant', userId: 'request-buyer' };
    const seller = { tenantId: 'request-seller-tenant', userId: 'request-seller' };
    const buyerPartnerId = randomUUID();
    const sellerPartnerId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertVerification(database.em, { owner: buyer, role: 'buyer' });
    await insertVerification(database.em, { owner: seller, role: 'seller' });

    const buyerRepository = new PostgresMarketplaceRepository(database.em.fork());
    const request = await buyerRepository.createRequest(
      buyer,
      { actingPartnerId: buyerPartnerId, region: 'Samarkand', title: 'Corn seed, 10 tons' },
      'opaque-request-0001',
    );
    if (request.status !== 'ok') {
      throw new Error('The buyer request fixture must be persisted.');
    }
    const requestPublicId = await publishRequest(database.em, {
      buyer,
      buyerPartnerId,
      requestId: request.value.id,
      title: request.value.title,
    });
    const sellerRepository = new PostgresMarketplaceRepository(database.em.fork());
    const offerInput = {
      actingPartnerId: sellerPartnerId,
      deliveryTerms: 'pickup' as const,
      priceUzs: 40_800_000,
    };
    await expect(
      sellerRepository.makeOffer(seller, request.value.id, offerInput, 'private-request-0001'),
    ).resolves.toEqual({ status: 'not_found' });
    const offer = await sellerRepository.makeOffer(seller, requestPublicId, offerInput, 'opaque-offer-0001');
    expect(offer).toMatchObject({
      status: 'ok',
      value: {
        buyerPartnerId,
        buyerTenantId: buyer.tenantId,
        requestPublicId,
        sellerPartnerId,
        sellerTenantId: seller.tenantId,
      },
    });
    if (offer.status !== 'ok') {
      throw new Error('The seller offer fixture must be persisted.');
    }

    const selection = await buyerRepository.chooseOffer(buyer, requestPublicId, offer.value.id, 'opaque-choose-0001');
    await expect(
      buyerRepository.chooseOffer(buyer, requestPublicId, offer.value.id, 'opaque-choose-0001'),
    ).resolves.toEqual(selection);
    await expect(
      buyerRepository.chooseOffer(buyer, requestPublicId, randomUUID(), 'opaque-choose-0001'),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    if (selection.status !== 'ok') {
      throw new Error('The selected contract fixture must be persisted.');
    }
    expect(
      await rows<{
        buyerPartnerId: string;
        lines: Array<Record<string, unknown>>;
        sellerPartnerId: string;
        sellerTenantId: string;
      }>(
        database.em,
        `select buyer_partner_id as "buyerPartnerId", seller_tenant_id as "sellerTenantId",
                seller_partner_id as "sellerPartnerId", lines
           from marketplace_contracts where id = ?`,
        [selection.value.contractId],
      ),
    ).toEqual([
      {
        buyerPartnerId,
        lines: [
          expect.objectContaining({
            sourceId: request.value.id,
            sourceKind: 'request',
            sourcePublicationId: requestPublicId,
            sourceRevision: 1,
            unitPriceUzs: 40_800_000,
          }),
        ],
        sellerPartnerId,
        sellerTenantId: seller.tenantId,
      },
    ]);
  });
});

const commerceEntities = [
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntitySchema,
  MarketplaceCommerceOperationEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceProduceOrganizationBindingEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestOrganizationBindingEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  RequestOfferEntitySchema,
  VerificationEntitySchema,
  VerificationEvidenceEntitySchema,
];

function requireOrm(orm: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!orm) {
    throw new Error('Marketplace commerce PostgreSQL database was not initialized.');
  }
  return orm;
}

async function insertPartner(
  em: EntityManager,
  input: { id: string; kind: 'buyer' | 'supplier'; owner: { tenantId: string; userId: string } },
): Promise<void> {
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [
      input.id,
      input.owner.tenantId,
      input.owner.userId,
      input.kind,
      input.kind === 'buyer' ? 'Marketplace buyer' : 'Marketplace supplier',
      input.id.replaceAll('-', '').slice(0, 20),
    ],
  );
}

async function insertVerification(
  em: EntityManager,
  input: { owner: { tenantId: string; userId: string }; role: 'buyer' | 'seller' },
): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', 'verified', true, 'legacy', 'legacy_unknown', '[]'::jsonb, now(), now())`,
    [randomUUID(), input.owner.tenantId, input.owner.userId, input.role],
  );
}

async function insertProduct(
  em: EntityManager,
  input: {
    id: string;
    owner: { tenantId: string; userId: string };
    sellerPartnerId: string;
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, category, description, supplier_id, supplier_name, price_uzs, unit,
       stock_quantity, region, status, images, created_at, updated_at)
     values (?, ?, 'Certified corn seed', 'seed', 'Server-owned product', ?, 'Marketplace supplier',
       500000, 'kg', 20, 'Samarkand', 'active', '[]'::jsonb, now(), now())`,
    [input.id, input.owner.tenantId, input.sellerPartnerId],
  );
}

async function publishProduct(
  em: EntityManager,
  input: {
    owner: { tenantId: string; userId: string };
    productId: string;
    sellerPartnerId: string;
  },
): Promise<string> {
  const sellerPublicId = randomUUID();
  const sellerRevisionId = randomUUID();
  const listingId = randomUUID();
  const sellerFingerprint = fingerprint(`seller:${input.sellerPartnerId}`);
  const listingFingerprint = fingerprint(`listing:${input.productId}`);
  await em.getConnection().execute(
    `insert into marketplace_public_sellers
      (id, tenant_id, partner_id, partner_kind, owner_user_id, content_revision, status, created_at, updated_at)
     values (?, ?, ?, 'supplier', ?, 1, 'published', now(), now())`,
    [sellerPublicId, input.owner.tenantId, input.sellerPartnerId, input.owner.userId],
  );
  await em.getConnection().execute(
    `insert into marketplace_public_seller_revisions
      (id, seller_public_id, tenant_id, content_revision, content_fingerprint, display_name, region,
       moderation_status, moderated_by, moderated_at, created_at, updated_at)
     values (?, ?, ?, 1, ?, 'Marketplace supplier', 'Samarkand', 'approved', 'reviewer', now(), now(), now())`,
    [sellerRevisionId, sellerPublicId, input.owner.tenantId, sellerFingerprint],
  );
  await em.getConnection().execute(
    `insert into marketplace_listing_publications
      (id, tenant_id, owner_user_id, seller_public_id, seller_revision_id, seller_content_revision,
       product_id, source_kind, section, public_title, public_description, public_category, public_unit,
       public_region, public_images, content_fingerprint, content_revision, status, moderation_status,
       moderated_by, moderated_at, idempotency_key, request_fingerprint, revision, published_at,
       created_at, updated_at)
     values (?, ?, ?, ?, ?, 1, ?, 'product', 'seeds', 'Certified corn seed', 'Approved listing',
       'seed', 'kg', 'Samarkand', '[]'::jsonb, ?, 1, 'published', 'approved', 'reviewer', now(), ?, ?,
       0, now(), now(), now())`,
    [
      listingId,
      input.owner.tenantId,
      input.owner.userId,
      sellerPublicId,
      sellerRevisionId,
      input.productId,
      listingFingerprint,
      `listing-${input.productId}`,
      listingFingerprint,
    ],
  );
  return listingId;
}

async function publishRequest(
  em: EntityManager,
  input: {
    buyer: { tenantId: string; userId: string };
    buyerPartnerId: string;
    requestId: string;
    title: string;
  },
): Promise<string> {
  const publicId = randomUUID();
  const contentFingerprint = fingerprint(`request:${input.requestId}`);
  await em.getConnection().execute(
    `insert into marketplace_request_publications
      (id, tenant_id, buyer_user_id, buyer_partner_id, request_id, buyer_display_name, public_title,
       public_region, content_fingerprint, content_revision, status, moderation_status, moderated_by,
       moderated_at, idempotency_key, request_fingerprint, revision, published_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, 'Marketplace buyer', ?, 'Samarkand', ?, 1, 'published', 'approved',
       'reviewer', now(), ?, ?, 0, now(), now(), now())`,
    [
      publicId,
      input.buyer.tenantId,
      input.buyer.userId,
      input.buyerPartnerId,
      input.requestId,
      input.title,
      contentFingerprint,
      `request-${input.requestId}`,
      contentFingerprint,
    ],
  );
  return publicId;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function rows<T>(em: EntityManager, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, params)) as T[];
}
