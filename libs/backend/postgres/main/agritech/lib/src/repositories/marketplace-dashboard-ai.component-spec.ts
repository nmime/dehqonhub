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
import {
  MarketplaceAiConsultationEntity,
  MarketplaceAiConsultationEntitySchema,
  MarketplaceAiConsultationOperationEntitySchema,
  MarketplaceAiStarterCartOperationEntity,
  MarketplaceAiStarterCartOperationEntitySchema,
} from '../entities/marketplace-dashboard-ai.entity';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceDashboardAiRepository } from './marketplace-dashboard-ai.repository';

describe('Marketplace dashboard and grounded AI PostgreSQL boundaries', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error('Marketplace dashboard and AI PostgreSQL evidence requires Docker; skipping is forbidden.');
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, dashboardAiEntities, {
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

  it('derives a seller dashboard from authorized current publications and grounds AI only in public inventory', async () => {
    const database = requireOrm(orm);
    const seller = { tenantId: 'dashboard-seller-tenant', userId: 'dashboard-seller' };
    const otherSeller = { tenantId: 'dashboard-other-tenant', userId: 'dashboard-other-seller' };
    const sellerPartnerId = randomUUID();
    const otherSellerPartnerId = randomUUID();
    const publicProductId = randomUUID();
    const privateProductId = randomUUID();
    const otherProductId = randomUUID();
    const searchToken = 'qoratepa2026';

    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertPartner(database.em, { id: otherSellerPartnerId, kind: 'supplier', owner: otherSeller });
    await insertVerification(database.em, { owner: seller, role: 'seller' });
    await insertVerification(database.em, { owner: otherSeller, role: 'seller' });
    await insertProduct(database.em, { id: publicProductId, owner: seller, sellerPartnerId });
    await insertProduct(database.em, { id: privateProductId, owner: seller, sellerPartnerId });
    await insertProduct(database.em, { id: otherProductId, owner: otherSeller, sellerPartnerId: otherSellerPartnerId });
    const listingPublicationId = await publishProduct(database.em, {
      owner: seller,
      productId: publicProductId,
      sellerPartnerId,
      title: `Certified corn ${searchToken}`,
      titles: {
        ru: `RU sentinel ${searchToken}`,
        uz: `UZ sentinel ${searchToken}`,
        uzCyrl: `UZ-CYRL sentinel ${searchToken}`,
      },
    });
    await publishProduct(database.em, {
      owner: otherSeller,
      productId: otherProductId,
      sellerPartnerId: otherSellerPartnerId,
      title: 'Unrelated public wheat',
    });

    const repository = new PostgresMarketplaceDashboardAiRepository(database.em.fork());
    await expect(repository.getRoleDashboard(seller)).resolves.toMatchObject({
      status: 'ok',
      value: {
        recentDeals: [],
        role: 'seller',
        seller: {
          activeDeals: 0,
          activeListings: 1,
          completedDeals: 0,
          pendingOffers: 0,
          topListings: [],
        },
      },
    });
    await expect(repository.getRoleDashboard({ ...seller, userId: 'not-a-member' })).resolves.toEqual({
      status: 'forbidden',
      field: 'organization',
    });

    const question = `Please\u202E recommend ${searchToken}\ncontact grower@example.test or +998 90 123 45 67, account 123456789012`;
    const consultation = await repository.createAiConsultation(
      { tenantId: 'catalog-reader', userId: 'catalog-reader' },
      'recommendation',
      question,
      'ai-grounding-0001',
    );
    if (consultation.status !== 'ok') {
      throw new Error('The grounded AI consultation must be persisted.');
    }
    expect(consultation.value.answer).toBe('catalog_match');
    expect(consultation.value.listingPublicationIds).toEqual([listingPublicationId]);
    expect(consultation.value.question).toBe(
      `Please recommend ${searchToken} contact [redacted-email] or [redacted-phone], account [redacted-number]`,
    );
    expect(consultation.value.response.explanationCodes).toEqual([
      'grounded_at_consultation_time',
      'stock_revalidated_on_confirmation',
    ]);
    const recommendation = consultation.value.response.recommendations[0];
    if (!recommendation) {
      throw new Error('The grounded AI consultation must contain its public recommendation.');
    }
    expect(consultation.value.response.recommendations).toHaveLength(1);
    expect(recommendation.availability).toEqual({
      quantity: 20,
      status: 'in_stock_at_consultation',
      unit: 'kg',
      warningCode: 'stock_may_change',
    });
    expect(recommendation.listingPublicationId).toBe(listingPublicationId);
    expect(recommendation.priceUzs).toBe(500_000);
    expect(recommendation.reasonCodes).toEqual(['query_terms_match', 'current_public_stock']);
    expect(recommendation.sellerPublicId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(recommendation.titles).toEqual({
      en: `Certified corn ${searchToken}`,
      ru: `RU sentinel ${searchToken}`,
      uz: `UZ sentinel ${searchToken}`,
      uzCyrl: `UZ-CYRL sentinel ${searchToken}`,
    });
    expect(consultation.value.response.starterCartPreview.status).toBe('requires_confirmation');
    expect(JSON.stringify(consultation.value)).not.toContain(publicProductId);
    expect(JSON.stringify(consultation.value)).not.toContain(privateProductId);
    expect(JSON.stringify(consultation.value)).not.toContain(sellerPartnerId);
    expect(JSON.stringify(consultation.value)).not.toContain('grower@example.test');
    expect(JSON.stringify(consultation.value)).not.toContain('+998 90 123 45 67');
    expect(JSON.stringify(consultation.value)).not.toContain('123456789012');
    expect(JSON.stringify(consultation.value)).not.toContain('\u202E');
    await expect(
      repository.createAiConsultation(
        { tenantId: 'catalog-reader', userId: 'catalog-reader' },
        'recommendation',
        'x'.repeat(2_001),
        'ai-question-too-long-0001',
      ),
    ).resolves.toEqual({ status: 'invalid_state', field: 'question' });
    await expect(
      repository.createAiConsultation(
        { tenantId: 'catalog-reader', userId: 'catalog-reader' },
        'recommendation',
        question,
        'ai-grounding-0001',
      ),
    ).resolves.toEqual(consultation);
    await expect(
      repository.createAiConsultation(
        { tenantId: 'catalog-reader', userId: 'catalog-reader' },
        'recommendation',
        `${question} changed`,
        'ai-grounding-0001',
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    await expect(
      repository.createAiConsultation(
        { tenantId: 'catalog-reader', userId: 'catalog-reader' },
        'season_advice',
        searchToken,
        'ai-season-safe-0001',
      ),
    ).resolves.toMatchObject({
      status: 'ok',
      value: {
        response: {
          explanationCodes: [
            'grounded_at_consultation_time',
            'seasonal_calendar_unavailable',
            'stock_revalidated_on_confirmation',
          ],
        },
      },
    });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_ai_consultation_operations
          where actor_tenant_id = 'catalog-reader' and actor_user_id = 'catalog-reader'`,
      ),
    ).toEqual([{ count: 2 }]);
  });

  it('partitions a confirmed starter cart by seller and replays only the exact command', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'starter-buyer-tenant', userId: 'starter-buyer' };
    const sellerA = { tenantId: 'starter-seller-a-tenant', userId: 'starter-seller-a' };
    const sellerB = { tenantId: 'starter-seller-b-tenant', userId: 'starter-seller-b' };
    const buyerPartnerId = randomUUID();
    const sellerPartnerA = randomUUID();
    const sellerPartnerB = randomUUID();
    const productA = randomUUID();
    const productB = randomUUID();
    const searchToken = 'ikkiombor2026';

    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: sellerPartnerA, kind: 'supplier', owner: sellerA });
    await insertPartner(database.em, { id: sellerPartnerB, kind: 'supplier', owner: sellerB });
    await insertVerification(database.em, { owner: buyer, role: 'buyer' });
    await insertVerification(database.em, { owner: sellerA, role: 'seller' });
    await insertVerification(database.em, { owner: sellerB, role: 'seller' });
    await insertProduct(database.em, {
      id: productA,
      owner: sellerA,
      priceUzs: 400_000,
      sellerPartnerId: sellerPartnerA,
    });
    await insertProduct(database.em, {
      id: productB,
      owner: sellerB,
      priceUzs: 420_000,
      sellerPartnerId: sellerPartnerB,
    });
    const listingA = await publishProduct(database.em, {
      owner: sellerA,
      productId: productA,
      sellerPartnerId: sellerPartnerA,
      title: `Corn ${searchToken} A`,
    });
    const listingB = await publishProduct(database.em, {
      owner: sellerB,
      productId: productB,
      sellerPartnerId: sellerPartnerB,
      title: `Corn ${searchToken} B`,
    });

    const repository = new PostgresMarketplaceDashboardAiRepository(database.em.fork());
    const consultation = await repository.createAiConsultation(
      buyer,
      'find_cheaper',
      searchToken,
      'ai-two-sellers-0001',
    );
    if (consultation.status !== 'ok') {
      throw new Error('The starter-cart consultation must be persisted.');
    }
    expect(new Set(consultation.value.listingPublicationIds)).toEqual(new Set([listingA, listingB]));
    expect(consultation.value.response.recommendations.map(({ priceUzs }) => priceUzs)).toEqual([400_000, 420_000]);
    expect(consultation.value.response.recommendations[0]?.reasonCodes).toContain('lowest_current_price');
    expect(consultation.value.response.recommendations[1]?.reasonCodes).not.toContain('lowest_current_price');
    const input = { actingPartnerId: buyerPartnerId, confirmed: true } as const;
    const result = await repository.confirmAiStarterCart(
      buyer,
      consultation.value.id,
      input,
      'starter-cart-exact-0001',
    );
    expect(result).toMatchObject({
      status: 'ok',
      value: {
        carts: [{ listingPublicationIds: [expect.any(String)] }, { listingPublicationIds: [expect.any(String)] }],
      },
    });
    await expect(
      repository.confirmAiStarterCart(buyer, consultation.value.id, input, 'starter-cart-exact-0001'),
    ).resolves.toEqual(result);
    await expect(
      repository.confirmAiStarterCart(
        buyer,
        consultation.value.id,
        { actingPartnerId: randomUUID(), confirmed: true },
        'starter-cart-exact-0001',
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });

    expect(
      await rows<{ cartCount: number; itemCount: number }>(
        database.em,
        `select count(*)::int as "cartCount", sum(jsonb_array_length(items))::int as "itemCount"
           from marketplace_carts
          where tenant_id = ? and user_id = ? and status = 'open'`,
        [buyer.tenantId, buyer.userId],
      ),
    ).toEqual([{ cartCount: 2, itemCount: 2 }]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_ai_starter_cart_operations
          where actor_tenant_id = ? and actor_user_id = ?`,
        [buyer.tenantId, buyer.userId],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('serializes concurrent confirmation and rolls back when buyer authority or stock is stale', async () => {
    const database = requireOrm(orm);
    const buyer = { tenantId: 'concurrent-buyer-tenant', userId: 'concurrent-buyer' };
    const seller = { tenantId: 'concurrent-seller-tenant', userId: 'concurrent-seller' };
    const buyerPartnerId = randomUUID();
    const sellerPartnerId = randomUUID();
    const productId = randomUUID();
    const searchToken = 'parallelhosil2026';

    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', owner: buyer });
    await insertPartner(database.em, { id: sellerPartnerId, kind: 'supplier', owner: seller });
    await insertVerification(database.em, { owner: buyer, role: 'buyer' });
    await insertVerification(database.em, { owner: seller, role: 'seller' });
    await insertProduct(database.em, { id: productId, owner: seller, sellerPartnerId });
    const listingPublicationId = await publishProduct(database.em, {
      owner: seller,
      productId,
      sellerPartnerId,
      title: `Corn ${searchToken}`,
    });

    const consultationRepository = new PostgresMarketplaceDashboardAiRepository(database.em.fork());
    const consultation = await consultationRepository.createAiConsultation(
      buyer,
      'recommendation',
      searchToken,
      'ai-concurrent-0001',
    );
    if (consultation.status !== 'ok') {
      throw new Error('The concurrent consultation must be persisted.');
    }
    const command = { actingPartnerId: buyerPartnerId, confirmed: true } as const;
    const concurrent = await Promise.all([
      new PostgresMarketplaceDashboardAiRepository(database.em.fork()).confirmAiStarterCart(
        buyer,
        consultation.value.id,
        command,
        'concurrent-key-a',
      ),
      new PostgresMarketplaceDashboardAiRepository(database.em.fork()).confirmAiStarterCart(
        buyer,
        consultation.value.id,
        command,
        'concurrent-key-b',
      ),
    ]);
    expect(concurrent.filter((value) => value.status === 'ok')).toHaveLength(1);
    expect(concurrent.filter((value) => value.status === 'conflict')).toEqual([
      { status: 'conflict', field: 'consultation' },
    ]);

    const staleConsultation = await consultationRepository.createAiConsultation(
      buyer,
      'recommendation',
      searchToken,
      'ai-stale-0001',
    );
    if (staleConsultation.status !== 'ok') {
      throw new Error('The stale-stock consultation must be persisted.');
    }
    await database.em.getConnection().execute('update products set stock_quantity = 0 where id = ?', [productId]);
    await expect(
      new PostgresMarketplaceDashboardAiRepository(database.em.fork()).confirmAiStarterCart(
        buyer,
        staleConsultation.value.id,
        command,
        'stale-stock-0001',
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'stockQuantity' });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count from marketplace_ai_starter_cart_operations where consultation_id = ?`,
        [staleConsultation.value.id],
      ),
    ).toEqual([{ count: 0 }]);

    await database.em.getConnection().execute('update products set stock_quantity = 20 where id = ?', [productId]);
    const unpublishedConsultation = await consultationRepository.createAiConsultation(
      buyer,
      'recommendation',
      searchToken,
      'ai-unpublished-0001',
    );
    if (unpublishedConsultation.status !== 'ok') {
      throw new Error('The unpublished-listing consultation must be persisted.');
    }
    await database.em
      .getConnection()
      .execute(`update marketplace_listing_publications set status = 'paused', updated_at = now() where id = ?`, [
        listingPublicationId,
      ]);
    await expect(
      new PostgresMarketplaceDashboardAiRepository(database.em.fork()).confirmAiStarterCart(
        buyer,
        unpublishedConsultation.value.id,
        command,
        'unpublished-listing-0001',
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'listingPublicationId' });
    const historicalConsultation = await consultationRepository
      .listAiConsultations(buyer)
      .then((consultations) => consultations.find(({ id }) => id === unpublishedConsultation.value.id));
    expect(historicalConsultation?.listingPublicationIds).toEqual([listingPublicationId]);
    expect(historicalConsultation?.response.explanationCodes).toContain('grounded_at_consultation_time');
    expect(historicalConsultation?.response.recommendations[0]?.listingPublicationId).toBe(listingPublicationId);
    expect(historicalConsultation?.response.recommendations[0]?.availability.warningCode).toBe('stock_may_change');
    await database.em
      .getConnection()
      .execute(`update marketplace_listing_publications set status = 'published', updated_at = now() where id = ?`, [
        listingPublicationId,
      ]);
    const authorityConsultation = await consultationRepository.createAiConsultation(
      buyer,
      'recommendation',
      searchToken,
      'ai-revoked-authority-0001',
    );
    if (authorityConsultation.status !== 'ok') {
      throw new Error('The authority-revalidation consultation must be persisted.');
    }
    await database.em.getConnection().execute(
      `update marketplace_partner_memberships
          set status = 'revoked', revoked_at = now(), revision = revision + 1, updated_at = now()
        where tenant_id = ? and user_id = ? and partner_id = ? and capability = 'buyer'`,
      [buyer.tenantId, buyer.userId, buyerPartnerId],
    );
    await expect(
      new PostgresMarketplaceDashboardAiRepository(database.em.fork()).confirmAiStarterCart(
        buyer,
        authorityConsultation.value.id,
        command,
        'revoked-buyer-0001',
      ),
    ).resolves.toEqual({ status: 'forbidden', field: 'organization' });
  });

  it('rejects raw unbounded consultations, missing create receipts, and forged starter-cart snapshots', async () => {
    const database = requireOrm(orm);
    const connection = database.em.getConnection();
    await expect(
      connection.execute(
        `insert into marketplace_ai_consultations
          (id, tenant_id, user_id, kind, question, answer, listing_publication_ids,
           revision, created_at, updated_at)
         values (?, 'raw-ai-tenant', 'raw-ai-user', 'generic', ' ', 'no_catalog_match', '[]'::jsonb,
           0, now(), now())`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/ck__marketplace_ai_consultations__question/u);
    await expect(
      connection.execute(
        `insert into marketplace_ai_consultations
          (id, tenant_id, user_id, kind, question, answer, listing_publication_ids,
           revision, created_at, updated_at)
         values (?, 'raw-ai-tenant', 'raw-ai-user', 'generic', U&'spoofed\\202Equestion',
           'no_catalog_match', '[]'::jsonb, 0, now(), now())`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/ck__marketplace_ai_consultations__question/u);
    await expect(
      database.em.fork().transactional(async (em) => {
        await em.getConnection().execute(
          `insert into marketplace_ai_consultations
            (id, tenant_id, user_id, kind, question, answer, listing_publication_ids,
             revision, created_at, updated_at)
           values (?, 'raw-ai-tenant', 'raw-ai-user', 'generic', 'bounded question',
             'no_catalog_match', '[]'::jsonb, 0, now(), now())`,
          [randomUUID()],
        );
      }),
    ).rejects.toThrow(/marketplace AI consultation create receipt is missing/u);

    const buyer = { tenantId: 'forged-buyer-tenant', userId: 'forged-buyer' };
    const seller = { tenantId: 'forged-seller-tenant', userId: 'forged-seller' };
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
      title: 'Forged receipt corn marker',
    });
    const sellerRows = await rows<{ sellerPublicId: string }>(
      database.em,
      `select seller_public_id as "sellerPublicId" from marketplace_listing_publications where id = ?`,
      [listingPublicationId],
    );
    const sellerPublicId = sellerRows[0]?.sellerPublicId;
    if (!sellerPublicId) {
      throw new Error('The forged-receipt seller projection must exist.');
    }
    const repository = new PostgresMarketplaceDashboardAiRepository(database.em.fork());
    const consultation = await repository.createAiConsultation(
      buyer,
      'recommendation',
      'Forged receipt corn marker',
      'forged-receipt-create-0001',
    );
    if (consultation.status !== 'ok') {
      throw new Error('The forged-receipt consultation must be persisted.');
    }
    const confirmedAt = new Date('2030-01-02T00:00:00.000Z');
    await expect(
      database.em.fork().transactional(async (em) => {
        const storedConsultation = await em.findOneOrFail(MarketplaceAiConsultationEntity, {
          id: consultation.value.id,
        });
        Object.assign(storedConsultation, {
          confirmedAt,
          revision: 1,
          updatedAt: confirmedAt,
        });
        await em.flush();
        const forgedReceipt = new MarketplaceAiStarterCartOperationEntity();
        Object.assign(forgedReceipt, {
          actorTenantId: buyer.tenantId,
          actorUserId: buyer.userId,
          buyerPartnerId,
          consultationId: consultation.value.id,
          createdAt: confirmedAt,
          id: randomUUID(),
          idempotencyKey: 'forged-starter-0001',
          requestFingerprint: 'a'.repeat(64),
          resultSnapshot: {
            carts: [
              {
                cartId: randomUUID(),
                listingPublicationIds: consultation.value.listingPublicationIds,
                sellerPublicId,
              },
            ],
            confirmedAt: confirmedAt.toISOString(),
            consultationId: consultation.value.id,
            status: 'confirmed',
          },
        });
        em.persist(forgedReceipt);
        await em.flush();
      }),
    ).rejects.toThrow(/marketplace AI starter-cart result cart is incoherent/u);
    expect(
      await rows<{ revision: number }>(database.em, `select revision from marketplace_ai_consultations where id = ?`, [
        consultation.value.id,
      ]),
    ).toEqual([{ revision: 0 }]);
  });
});

const dashboardAiEntities = [
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntitySchema,
  MarketplaceAiConsultationEntitySchema,
  MarketplaceAiConsultationOperationEntitySchema,
  MarketplaceAiStarterCartOperationEntitySchema,
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
    throw new Error('Marketplace dashboard and AI PostgreSQL database was not initialized.');
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
    priceUzs?: number;
    sellerPartnerId: string;
  },
): Promise<void> {
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, category, description, supplier_id, supplier_name, price_uzs, unit,
       stock_quantity, region, status, images, created_at, updated_at)
     values (?, ?, 'Certified corn seed', 'seed', 'Server-owned product', ?, 'Marketplace supplier',
       ?, 'kg', 20, 'Samarkand', 'active', '[]'::jsonb, now(), now())`,
    [input.id, input.owner.tenantId, input.sellerPartnerId, input.priceUzs ?? 500_000],
  );
}

async function publishProduct(
  em: EntityManager,
  input: {
    owner: { tenantId: string; userId: string };
    productId: string;
    sellerPartnerId: string;
    title: string;
    titles?: { ru: string; uz: string; uzCyrl: string };
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
       product_id, source_kind, section, public_title, public_title_ru, public_title_uz, public_title_uz_cyrl,
       public_description, public_category, public_unit,
       public_region, public_images, content_fingerprint, content_revision, status, moderation_status,
       moderated_by, moderated_at, idempotency_key, request_fingerprint, revision, published_at,
       created_at, updated_at)
     values (?, ?, ?, ?, ?, 1, ?, 'product', 'seeds', ?, ?, ?, ?, 'Approved listing', 'seed', 'kg',
       'Samarkand', '[]'::jsonb, ?, 1, 'published', 'approved', 'reviewer', now(), ?, ?,
       0, now(), now(), now())`,
    [
      listingId,
      input.owner.tenantId,
      input.owner.userId,
      sellerPublicId,
      sellerRevisionId,
      input.productId,
      input.title,
      input.titles?.ru ?? input.title,
      input.titles?.uz ?? input.title,
      input.titles?.uzCyrl ?? input.title,
      listingFingerprint,
      `listing-${input.productId}`,
      listingFingerprint,
    ],
  );
  return listingId;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function rows<T>(em: EntityManager, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, params)) as T[];
}
