// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-ONBOARDING-023 REQ-AGRITECH-DEMO-024
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
import { agritechMigrationOptions, Migration20260811110000AlignMarketplaceBuyerPartyRole } from '../migrations';
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

  /**
   * `assert_marketplace_resolved_commerce_parties` used to demand a `seller`
   * verification on the selling side while `marketplaceSellerRoles` — and the
   * repository's own seller branch — authorize `farmer` as well. A farmer-owned
   * supplier organization therefore passed every application check and then
   * raised `23514` inside the transaction, so adding any produce listing to a
   * cart answered HTTP 500 rather than a typed problem. The two authorities now
   * agree, and a farmer co-operative's produce reaches a frozen contract.
   */
  it('accepts a farmer-verified supplier organization as the selling party of a cart and its contract', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'produce-buyer-tenant', userId: 'produce-buyer' };
    const seller = { tenantId: 'produce-seller-tenant', userId: 'produce-farmer' };
    const buyerPartnerId = randomUUID();
    const sellerPartnerId = randomUUID();
    const farmerId = randomUUID();
    const produceListingId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertVerification(database.em, { owner: buyer, role: 'buyer' });
    await insertVerification(database.em, { owner: seller, role: 'farmer' });
    await insertFarmer(database.em, { id: farmerId, owner: seller });
    await insertProduce(database.em, { farmerId, id: produceListingId, owner: seller });
    const listingPublicationId = await publishProduce(database.em, {
      farmerId,
      owner: seller,
      produceListingId,
      sellerPartnerId,
    });

    const repository = new PostgresMarketplaceRepository(database.em.fork());
    const added = await repository.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 4 },
      'produce-add-0001',
    );
    expect(added).toMatchObject({
      status: 'ok',
      value: {
        buyerPartnerId,
        items: [{ listingPublicationId, quantity: 4, sourceId: produceListingId, sourceKind: 'produce' }],
        sellerPartnerId,
        sellerTenantId: seller.tenantId,
      },
    });
    if (added.status !== 'ok') {
      throw new Error('The produce cart fixture must be persisted.');
    }

    const checkout = await repository.checkoutCart(
      buyer,
      added.value.id,
      { deliveryTerms: 'pickup' },
      'produce-checkout-0001',
    );
    expect(checkout).toMatchObject({ status: 'ok', value: { cartId: added.value.id } });
    if (checkout.status !== 'ok') {
      throw new Error('The produce checkout must be persisted.');
    }
    expect(
      await rows(
        database.em,
        `select seller_partner_id as "sellerPartnerId", seller_tenant_id as "sellerTenantId",
                binding_status as "bindingStatus", lines as "lines"
           from marketplace_contracts where id = ?`,
        [checkout.value.contractId],
      ),
    ).toEqual([
      {
        bindingStatus: 'resolved',
        lines: [
          expect.objectContaining({
            quantity: 4,
            sourceId: produceListingId,
            sourceKind: 'produce',
            sourcePublicationId: listingPublicationId,
            unit: 'kg',
            unitPriceUzs: 3400,
          }),
        ],
        sellerPartnerId,
        sellerTenantId: seller.tenantId,
      },
    ]);
  });

  /**
   * The mirror image of the case above, on the buying side.
   * `marketplaceBuyerRoles` is `['farmer', 'buyer']` and
   * `canBuyInMarketplace` has always authorized a farmer to buy everything,
   * but `lockAuthorizedMarketplaceParty` demanded the verification role be
   * exactly `buyer`, and `assert_marketplace_resolved_commerce_parties` /
   * `assert_marketplace_resolved_request_party` demanded the same. A farmer
   * with an active `buyer` membership on an approved `buyer` organization
   * could therefore not buy at all: the repository answered `forbidden` and,
   * had it not, the constraint trigger would have raised `23514` inside the
   * transaction. The policy unit test could not see either boundary, so this
   * exercises a farmer buying end to end at the repository level — cart,
   * contract, and a published purchase request.
   */
  it('accepts a farmer-verified buyer organization as the buying party of a cart, its contract and a request', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'farmer-buyer-tenant', userId: 'farmer-buyer' };
    const seller = { tenantId: 'farmer-buyer-seller-tenant', userId: 'farmer-buyer-seller' };
    const buyerPartnerId = randomUUID();
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertVerification(database.em, { owner: buyer, role: 'farmer' });
    await insertVerification(database.em, { owner: seller, role: 'seller' });
    await insertProduct(database.em, { id: productId, owner: seller, sellerPartnerId });
    const listingPublicationId = await publishProduct(database.em, {
      owner: seller,
      productId,
      sellerPartnerId,
    });

    const repository = new PostgresMarketplaceRepository(database.em.fork());
    const added = await repository.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'farmer-buys-add-0001',
    );
    expect(added).toMatchObject({
      status: 'ok',
      value: {
        buyerPartnerId,
        buyerTenantId: buyer.tenantId,
        items: [{ listingPublicationId, quantity: 2, sourceId: productId }],
        sellerPartnerId,
        sellerTenantId: seller.tenantId,
      },
    });
    if (added.status !== 'ok') {
      throw new Error('The farmer-buyer cart fixture must be persisted.');
    }

    const checkout = await repository.checkoutCart(
      buyer,
      added.value.id,
      { deliveryTerms: 'pickup' },
      'farmer-buys-checkout-0001',
    );
    expect(checkout).toMatchObject({ status: 'ok', value: { cartId: added.value.id } });
    if (checkout.status !== 'ok') {
      throw new Error('The farmer-buyer checkout must be persisted.');
    }
    expect(
      await rows(
        database.em,
        `select buyer_partner_id as "buyerPartnerId", tenant_id as "tenantId",
                binding_status as "bindingStatus"
           from marketplace_contracts where id = ?`,
        [checkout.value.contractId],
      ),
    ).toEqual([{ bindingStatus: 'resolved', buyerPartnerId, tenantId: buyer.tenantId }]);

    // The request party trigger is the second persisted buying invariant: the
    // organization binding resolves the request, and the constraint trigger
    // then re-checks the buying party's verification role.
    const request = await repository.createRequest(
      buyer,
      { actingPartnerId: buyerPartnerId, region: 'Samarkand', title: 'Certified seed for the next season' },
      'farmer-buys-request-0001',
    );
    expect(request).toMatchObject({ status: 'ok' });
    if (request.status !== 'ok') {
      throw new Error('The farmer-buyer request fixture must be persisted.');
    }
    expect(
      await rows(
        database.em,
        `select buyer_partner_id as "buyerPartnerId", binding_status as "bindingStatus"
           from marketplace_requests where id = ?`,
        [request.value.id],
      ),
    ).toEqual([{ bindingStatus: 'resolved', buyerPartnerId }]);

    // Nothing was weakened: a seller-verified actor still cannot buy, even with
    // an active membership on an approved buyer organization.
    const sellerAsBuyerPartnerId = randomUUID();
    await insertPartner(database.em, { id: sellerAsBuyerPartnerId, kind: 'buyer', owner: seller });
    await expect(
      repository.addToCart(
        seller,
        { actingPartnerId: sellerAsBuyerPartnerId, listingPublicationId, quantity: 1 },
        'farmer-buys-denied-0001',
      ),
    ).resolves.toEqual({ status: 'forbidden', field: 'organization' });
  });

  /**
   * The falsification for the widened buying predicate, run against the exact
   * statement that used to fail.
   *
   * The two tests above prove the repository can now carry a farmer through a
   * cart, a contract and a request, but they cannot show that the persisted
   * trigger is what changed: a repository fix alone would satisfy them. So this
   * one drives the trigger directly. It inserts the resolved cart row itself,
   * with a farmer-verified buying party, and then restores the pre-migration
   * predicate inside a transaction and inserts the same row again.
   *
   * The restored body is not retyped here — it is whatever
   * `Migration20260811110000AlignMarketplaceBuyerPartyRole.down()` emits, so the
   * reproduction cannot drift away from the defect it names. `create or replace
   * function` is transactional in PostgreSQL, so rolling that transaction back
   * takes the pre-migration predicate with it, and the third probe proves the
   * database is left exactly as the migration made it. Every probe rolls back,
   * so no cart survives any of them.
   */
  it('reproduces the pre-migration failure on the exact insert and leaves the widened predicate in place', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'buying-predicate-tenant', userId: 'buying-predicate-farmer' };
    const seller = { tenantId: 'buying-predicate-seller-tenant', userId: 'buying-predicate-seller' };
    const buyerPartnerId = randomUUID();
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertVerification(database.em, { owner: buyer, role: 'farmer' });
    await insertVerification(database.em, { owner: seller, role: 'seller' });
    await insertProduct(database.em, { id: productId, owner: seller, sellerPartnerId });

    const insertResolvedCart = `insert into marketplace_carts
      (id, tenant_id, user_id, seller_id, items, status, binding_status,
       buyer_partner_id, seller_tenant_id, seller_user_id, seller_partner_id)
     values (?, ?, ?, ?, '[]'::jsonb, 'open', 'resolved', ?, ?, ?, ?)`;
    const rollbackProbe = new Error('roll the probe back');
    const probeResolvedCartInsert = async (before: readonly string[] = []): Promise<void> => {
      try {
        await database.em.fork().transactional(async (em) => {
          if (before.length > 0) {
            // One statement: the four function bodies are independent of each
            // other, and the migration applies them to the same connection.
            await em.execute(before.join('\n'));
          }
          await em.execute(insertResolvedCart, [
            randomUUID(),
            buyer.tenantId,
            buyer.userId,
            sellerPartnerId,
            buyerPartnerId,
            seller.tenantId,
            seller.userId,
            sellerPartnerId,
          ]);
          throw rollbackProbe;
        });
      } catch (error) {
        if (error !== rollbackProbe) {
          throw error;
        }
      }
    };

    await expect(probeResolvedCartInsert()).resolves.toBeUndefined();
    await expect(probeResolvedCartInsert(preMigrationBuyingPredicates())).rejects.toThrow(
      /marketplace resolved commerce party mismatch/u,
    );
    expect(await commercePartyPredicateState(database.em)).toEqual([
      { name: 'assert_marketplace_resolved_commerce_parties', narrowed: false, widened: true },
    ]);
    await expect(probeResolvedCartInsert()).resolves.toBeUndefined();
    expect(
      await rows(database.em, 'select count(*)::int as "carts" from marketplace_carts where tenant_id = ?', [
        buyer.tenantId,
      ]),
    ).toEqual([{ carts: 0 }]);
  });
});

/**
 * The four buying-side function bodies the migration's own `down()` restores.
 * Taking them from the migration rather than restating them keeps the
 * reproduction bound to the shipped rollback.
 */
function preMigrationBuyingPredicates(): readonly string[] {
  const migration = new Migration20260811110000AlignMarketplaceBuyerPartyRole(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  migration.down();
  return statements;
}

async function commercePartyPredicateState(
  em: EntityManager,
): Promise<{ name: string; narrowed: boolean; widened: boolean }[]> {
  return rows(
    em,
    `select p.proname as "name",
            pg_get_functiondef(p.oid) like '%role" in (''buyer'', ''farmer'')%' as "widened",
            pg_get_functiondef(p.oid) like '%role" = ''buyer''%' as "narrowed"
       from pg_proc p
      where p.proname = 'assert_marketplace_resolved_commerce_parties'`,
  );
}

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
  input: { owner: { tenantId: string; userId: string }; role: 'buyer' | 'farmer' | 'seller' },
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

async function insertFarmer(
  em: EntityManager,
  input: { id: string; owner: { tenantId: string; userId: string } },
): Promise<void> {
  await em.getConnection().execute(
    `insert into farmers
      (id, tenant_id, user_id, phone, first_name, last_name, region, farm_size_hectares, crops,
       status, created_at, updated_at)
     values (?, ?, ?, '+998900000001', 'Produce', 'Farmer', 'Samarkand', 12.5, '[]'::jsonb,
       'active', now(), now())`,
    [input.id, input.owner.tenantId, input.owner.userId],
  );
}

async function insertProduce(
  em: EntityManager,
  input: { farmerId: string; id: string; owner: { tenantId: string; userId: string } },
): Promise<void> {
  await em.getConnection().execute(
    `insert into produce_listings
      (id, tenant_id, farmer_id, crop, grade, quantity_kg, available_quantity_kg, price_per_kg_uzs,
       region, available_from, available_until, status, sample_available, created_at, updated_at)
     values (?, ?, ?, 'Cottonseed cake', 'A', 30000, 30000, 3400, 'Samarkand',
       now() - interval '1 day', now() + interval '90 days', 'active', false, now(), now())`,
    [input.id, input.owner.tenantId, input.farmerId],
  );
}

/**
 * Publishing a farmer's produce through a supplier organization needs the
 * organization binding as well as the publication: without it the resolver
 * refuses the listing, which is the same fail-closed rule a product listing gets
 * from its `supplier_id`.
 */
async function publishProduce(
  em: EntityManager,
  input: {
    farmerId: string;
    owner: { tenantId: string; userId: string };
    produceListingId: string;
    sellerPartnerId: string;
  },
): Promise<string> {
  const sellerPublicId = randomUUID();
  const sellerRevisionId = randomUUID();
  const listingId = randomUUID();
  const sellerFingerprint = fingerprint(`seller:${input.sellerPartnerId}`);
  const listingFingerprint = fingerprint(`produce:${input.produceListingId}`);
  await em.getConnection().execute(
    `insert into marketplace_produce_organization_bindings
      (produce_listing_id, tenant_id, farmer_id, owner_user_id, supplier_partner_id, created_at)
     values (?, ?, ?, ?, ?, now())`,
    [input.produceListingId, input.owner.tenantId, input.farmerId, input.owner.userId, input.sellerPartnerId],
  );
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
     values (?, ?, ?, 1, ?, 'Produce co-operative', 'Samarkand', 'approved', 'reviewer', now(), now(), now())`,
    [sellerRevisionId, sellerPublicId, input.owner.tenantId, sellerFingerprint],
  );
  await em.getConnection().execute(
    `insert into marketplace_listing_publications
      (id, tenant_id, owner_user_id, seller_public_id, seller_revision_id, seller_content_revision,
       produce_listing_id, source_kind, section, public_title, public_description, public_crop, public_grade,
       public_unit, public_region, public_images, content_fingerprint, content_revision, status, moderation_status,
       moderated_by, moderated_at, idempotency_key, request_fingerprint, revision, published_at,
       created_at, updated_at)
     values (?, ?, ?, ?, ?, 1, ?, 'produce', 'produce', 'Cottonseed cake', 'Approved produce',
       'Cottonseed cake', 'A', 'kg', 'Samarkand', '[]'::jsonb, ?, 1, 'published', 'approved', 'reviewer', now(), ?, ?,
       0, now(), now(), now())`,
    [
      listingId,
      input.owner.tenantId,
      input.owner.userId,
      sellerPublicId,
      sellerRevisionId,
      input.produceListingId,
      listingFingerprint,
      `produce-listing-${input.produceListingId}`,
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
