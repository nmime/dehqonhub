// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { createHash, randomUUID } from 'node:crypto';
import { LockMode, MikroORM, type EntityManager } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { type PostgreSqlDriver } from '@mikro-orm/postgresql';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  type PostgresEntityList,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import {
  marketplaceProviderFingerprint,
  type MarketplaceProviderOperationPreparation,
  type VerificationDocument,
} from '@app/backend-feature-agritech-shared';
import {
  AgriTechPartnerEntity,
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntity,
  ContractEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplaceListingPromotionEntitySchema,
  MarketplaceCommerceOperationEntitySchema,
  MarketplaceCommissionRatePolicyEntitySchema,
  MarketplaceContractArtifactEntitySchema,
  MarketplaceContractCommissionEntitySchema,
  MarketplaceContractDisputeEntitySchema,
  MarketplaceContractDisputeEvidenceEntitySchema,
  MarketplaceContractDisputeResolutionEvidenceEntitySchema,
  MarketplaceContractFulfillmentEntitySchema,
  MarketplaceContractLifecycleEventEntitySchema,
  MarketplaceContractNotificationIntentEntitySchema,
  MarketplaceContractReputationSignalEntitySchema,
  MarketplaceContractReviewEligibilityEntitySchema,
  MarketplaceContractSettlementEntitySchema,
  MarketplaceContractSignatureEntitySchema,
  MarketplaceEngagementEventEntitySchema,
  MarketplaceEngagementNotificationIntentEntitySchema,
  MarketplaceEngagementOperationEntitySchema,
  MarketplaceListingFavoriteEntitySchema,
  MarketplaceLegacyFavoriteArchiveEntitySchema,
  MarketplaceLegacyReviewArchiveEntitySchema,
  MarketplaceLegacySampleRequestArchiveEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceListingReviewEntitySchema,
  MarketplaceListingSampleEntitySchema,
  MarketplaceProduceOrganizationBindingEntitySchema,
  MarketplacePublicationModerationOperationEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestOrganizationBindingEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  MarketplaceReviewAggregateEntitySchema,
  MarketplaceReviewReplyEntitySchema,
  MarketplaceReviewReportEntitySchema,
  MarketplaceSampleMonthlyUsageEntitySchema,
  MarketplaceSamplePolicyEntitySchema,
  ProduceListingEntitySchema,
  ProductEntitySchema,
  RequestOfferEntitySchema,
  VerificationEntitySchema,
  VerificationEvidenceEntitySchema,
} from '../entities';
import {
  MarketplaceAiConsultationEntitySchema,
  MarketplaceAiConsultationOperationEntitySchema,
  MarketplaceAiStarterCartOperationEntitySchema,
} from '../entities/marketplace-dashboard-ai.entity';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceRepository } from './marketplace.repository';

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

  it('quarantines caller-authored legacy contracts and normalizes cross-tenant AI history', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-upgrade-a';
    const foreignTenantId = 'tenant-upgrade-b';
    const productId = '00000000-0000-4000-8000-000000000101';
    const foreignProductId = '00000000-0000-4000-8000-000000000102';
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
    await connection.execute(
      `insert into marketplace_ai_consultations
        (id, tenant_id, user_id, kind, question, answer, product_ids, created_at)
       values
        (?, ?, 'buyer-a', 'recommendation', 'What should I buy', 'Apply fertilizer in February',
          jsonb_build_array('00000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000102'), now()),
        (?, ?, 'buyer-a', 'season_advice', 'When should I sow', 'Sow in October',
          jsonb_build_array('00000000-0000-4000-8000-000000000101'), now())`,
      [recommendationId, tenantId, seasonId, tenantId],
    );

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

    expect('signContract' in new PostgresMarketplaceRepository(database.em.fork())).toBe(false);

    const consultations = await rows<{ answer: string; id: string; listingPublicationIds: string[] }>(
      database.em,
      `select id, answer, listing_publication_ids as "listingPublicationIds"
         from marketplace_ai_consultations
        where id in (?, ?)
        order by id`,
      [recommendationId, seasonId],
    );
    expect(consultations).toEqual(
      expect.arrayContaining([
        { answer: 'no_catalog_match', id: recommendationId, listingPublicationIds: [] },
        { answer: 'no_catalog_match', id: seasonId, listingPublicationIds: [] },
      ]),
    );
    await expect(
      connection.execute('update marketplace_contracts set factoring_enabled = true where id = ?', [draftContractId]),
    ).rejects.toThrow(/ck__marketplace_contracts__factoring_disabled/u);
    await expect(
      connection.execute("update marketplace_ai_consultations set answer = 'invented prose' where id = ?", [
        recommendationId,
      ]),
    ).rejects.toThrow(/marketplace AI consultation transition is invalid/u);
  });

  it('serializes buyer suspension ahead of request creation so no request is authorized from stale approval', async () => {
    const database = requireOrm(orm);
    const tenantId = 'tenant-request-approval-race';
    const buyer = { tenantId, userId: 'buyer-approval-race' };
    const partnerId = randomUUID();
    await insertPartner(database.em, { id: partnerId, kind: 'buyer', ownerUserId: buyer.userId, tenantId });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyer.userId });

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
      .createRequest(
        buyer,
        {
          actingPartnerId: partnerId,
          region: 'Samarkand',
          title: 'Must not race suspension',
        },
        'request-race-0001',
      )
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
    const marketplaceConstraintNames = marketplaceConstraints.map(({ name }) => name);
    expect(marketplaceConstraintNames).toEqual([
      'ck__commission_rate_policies__fingerprint',
      'ck__commission_rate_policies__rates',
      'ck__commission_rate_policies__retirement',
      'ck__commission_rate_policies__status',
      'ck__commission_rate_policies__version',
      'ck__contract_artifacts__fingerprints',
      'ck__contract_artifacts__provider',
      'ck__contract_artifacts__shape',
      'ck__contract_commissions__amount',
      'ck__contract_commissions__rate_snapshot',
      'ck__contract_dispute_evidence__media_type',
      'ck__contract_dispute_evidence__party',
      'ck__contract_dispute_evidence__shape',
      'ck__contract_dispute_resolution_evidence__revision',
      'ck__contract_disputes__party',
      'ck__contract_disputes__previous_status',
      'ck__contract_disputes__reason',
      'ck__contract_disputes__resolution',
      'ck__contract_disputes__status',
      'ck__contract_fulfillments__revision',
      'ck__contract_fulfillments__status',
      'ck__contract_fulfillments__timeline',
      'ck__contract_lifecycle_events__category',
      'ck__contract_lifecycle_events__idempotency',
      'ck__contract_lifecycle_events__party',
      'ck__contract_lifecycle_events__provider',
      'ck__contract_lifecycle_events__sequence',
      'ck__contract_notification_intents__delivery_shape',
      'ck__contract_notification_intents__party',
      'ck__contract_notification_intents__status',
      'ck__contract_reputation_signals__outcome',
      'ck__contract_reputation_signals__party',
      'ck__contract_reputation_signals__reason',
      'ck__contract_review_eligibilities__different_parties',
      'ck__contract_review_eligibilities__source_kind',
      'ck__contract_settlements__amount',
      'ck__contract_settlements__consents',
      'ck__contract_settlements__kind_status',
      'ck__contract_settlements__provider_mode',
      'ck__contract_settlements__reconciliation',
      'ck__contract_settlements__revision',
      'ck__contract_settlements__selection',
      'ck__contract_signatures__artifact',
      'ck__contract_signatures__party',
      'ck__contract_signatures__provider',
      'ck__contract_signatures__safe_receipt',
      'ck__listing_promotions__activation_reference',
      'ck__listing_promotions__activation_time',
      'ck__listing_promotions__billing',
      'ck__listing_promotions__currency',
      'ck__listing_promotions__fingerprint',
      'ck__listing_promotions__plan',
      'ck__listing_promotions__revision',
      'ck__listing_promotions__status',
      'ck__marketplace_ai_consultation_operations__idempotency_key',
      'ck__marketplace_ai_consultation_operations__request_fingerprint',
      'ck__marketplace_ai_consultation_operations__result_snapshot',
      'ck__marketplace_ai_consultations__answer',
      'ck__marketplace_ai_consultations__answer_shape',
      'ck__marketplace_ai_consultations__confirmation',
      'ck__marketplace_ai_consultations__kind',
      'ck__marketplace_ai_consultations__listing_ids',
      'ck__marketplace_ai_consultations__question',
      'ck__marketplace_ai_consultations__response_snapshot',
      'ck__marketplace_ai_consultations__revision',
      'ck__marketplace_ai_starter_cart_operations__idempotency_key',
      'ck__marketplace_ai_starter_cart_operations__request_fingerprint',
      'ck__marketplace_ai_starter_cart_operations__result_snapshot',
      'ck__marketplace_carts__binding_status',
      'ck__marketplace_carts__resolved_parties',
      'ck__marketplace_carts__status',
      'ck__marketplace_commerce_operations__operation',
      'ck__marketplace_commerce_operations__request_fingerprint',
      'ck__marketplace_commerce_operations__result_snapshot',
      'ck__marketplace_contracts__amount',
      'ck__marketplace_contracts__binding_status',
      'ck__marketplace_contracts__delivery_days',
      'ck__marketplace_contracts__delivery_price',
      'ck__marketplace_contracts__delivery_terms',
      'ck__marketplace_contracts__factoring_disabled',
      'ck__marketplace_contracts__party_consent',
      'ck__marketplace_contracts__resolved_parties',
      'ck__marketplace_contracts__source_pair',
      'ck__marketplace_contracts__source_type',
      'ck__marketplace_contracts__status',
      'ck__marketplace_contracts__version',
      'ck__marketplace_engagement_events__aggregate_type',
      'ck__marketplace_engagement_events__metadata',
      'ck__marketplace_engagement_notification__locale',
      'ck__marketplace_engagement_notification__payload',
      'ck__marketplace_engagement_notification__status',
      'ck__marketplace_engagement_operations__fingerprint',
      'ck__marketplace_engagement_operations__operation',
      'ck__marketplace_engagement_operations__snapshot',
      'ck__marketplace_listing_publications__content',
      'ck__marketplace_listing_publications__moderation',
      'ck__marketplace_listing_publications__revision',
      'ck__marketplace_listing_publications__section',
      'ck__marketplace_listing_publications__source_kind',
      'ck__marketplace_listing_publications__source_pair',
      'ck__marketplace_listing_publications__status',
      'ck__marketplace_listing_reviews__assets',
      'ck__marketplace_listing_reviews__different_parties',
      'ck__marketplace_listing_reviews__rating',
      'ck__marketplace_listing_reviews__source_kind',
      'ck__marketplace_listing_reviews__source_pair',
      'ck__marketplace_listing_reviews__visibility',
      'ck__marketplace_listing_samples__delivery',
      'ck__marketplace_listing_samples__different_parties',
      'ck__marketplace_listing_samples__feedback',
      'ck__marketplace_listing_samples__period',
      'ck__marketplace_listing_samples__policy',
      'ck__marketplace_listing_samples__revision',
      'ck__marketplace_listing_samples__source_kind',
      'ck__marketplace_listing_samples__source_pair',
      'ck__marketplace_listing_samples__status',
      'ck__marketplace_offers__binding_status',
      'ck__marketplace_offers__delivery_price',
      'ck__marketplace_offers__delivery_terms',
      'ck__marketplace_offers__price',
      'ck__marketplace_offers__resolved_parties',
      'ck__marketplace_offers__status',
      'ck__marketplace_partner_memberships__capability',
      'ck__marketplace_partner_memberships__revision',
      'ck__marketplace_partner_memberships__revocation',
      'ck__marketplace_partner_memberships__role',
      'ck__marketplace_partner_memberships__status',
      'ck__marketplace_provider_ops__attempt',
      'ck__marketplace_provider_ops__capability',
      'ck__marketplace_provider_ops__provider_event',
      'ck__marketplace_provider_ops__provider_mode',
      'ck__marketplace_provider_ops__provider_reference',
      'ck__marketplace_provider_ops__receipt_state',
      'ck__marketplace_provider_ops__reconciliation',
      'ck__marketplace_provider_ops__request_descriptor',
      'ck__marketplace_provider_ops__request_fingerprint',
      'ck__marketplace_provider_ops__resource_revision',
      'ck__marketplace_provider_ops__result_descriptor',
      'ck__marketplace_provider_ops__result_fingerprint',
      'ck__marketplace_provider_ops__safe_receipt',
      'ck__marketplace_provider_ops__scope',
      'ck__marketplace_provider_ops__status',
      'ck__marketplace_public_seller_revisions__content',
      'ck__marketplace_public_seller_revisions__moderation',
      'ck__marketplace_public_seller_revisions__revision',
      'ck__marketplace_public_sellers__content_revision',
      'ck__marketplace_public_sellers__partner_kind',
      'ck__marketplace_public_sellers__status',
      'ck__marketplace_publication_moderation_ops__kind',
      'ck__marketplace_publication_moderation_ops__snapshot',
      'ck__marketplace_request_publications__buyer_display_name',
      'ck__marketplace_request_publications__content_revision',
      'ck__marketplace_request_publications__moderation',
      'ck__marketplace_request_publications__public_budget',
      'ck__marketplace_request_publications__public_text',
      'ck__marketplace_request_publications__revision',
      'ck__marketplace_request_publications__status',
      'ck__marketplace_requests__binding_status',
      'ck__marketplace_requests__resolved_party',
      'ck__marketplace_requests__status',
      'ck__marketplace_review_aggregates__values',
      'ck__marketplace_review_replies__comment',
      'ck__marketplace_review_replies__revision',
      'ck__marketplace_review_reports__reason',
      'ck__marketplace_review_reports__snapshot',
      'ck__marketplace_review_reports__status',
      'ck__marketplace_reviews__rating',
      'ck__marketplace_sample_monthly_usage__count',
      'ck__marketplace_sample_monthly_usage__period',
      'ck__marketplace_sample_policies__lifecycle',
      'ck__marketplace_sample_policies__limit',
      'ck__marketplace_sample_requests__status',
      'ck__marketplace_verification_evidence__case_revision',
      'ck__marketplace_verification_evidence__document_revision',
      'ck__marketplace_verification_evidence__kind',
      'ck__marketplace_verification_evidence__mime_type',
      'ck__marketplace_verification_evidence__provider_mode',
      'ck__marketplace_verification_evidence__sha256',
      'ck__marketplace_verification_evidence__size',
      'ck__marketplace_verifications__case_revision',
      'ck__marketplace_verifications__identity_assurance',
      'ck__marketplace_verifications__identity_provenance',
      'ck__marketplace_verifications__level',
      'ck__marketplace_verifications__provider_mode',
      'ck__marketplace_verifications__rejection_reason',
      'ck__marketplace_verifications__role',
      'ck__marketplace_verifications__status',
      'ck__marketplace_verifications__version',
      'ct__carts__party_coherence',
      'ct__contract_artifacts__coherence',
      'ct__contract_dispute_evidence__coherence',
      'ct__contract_dispute_resolution__coherence',
      'ct__contract_dispute_resolution_evidence__coherence',
      'ct__contract_lifecycle_events__coherence',
      'ct__contract_reputation_signals__coherence',
      'ct__contract_signatures__coherence',
      'ct__contracts__party_coherence',
      'ct__marketplace_ai_consultations__receipts',
      'ct__marketplace_contracts__offer_selection',
      'ct__marketplace_listing_publications__coherence',
      'ct__marketplace_partner_memberships__coherence',
      'ct__marketplace_produce_org_bindings__coherence',
      'ct__marketplace_public_sellers__organization_coherence',
      'ct__marketplace_request_offers__public_request',
      'ct__marketplace_request_org_bindings__coherence',
      'ct__marketplace_request_publications__party_coherence',
      'ct__marketplace_requests__organization_binding_coherence',
      'ct__marketplace_requests__party_coherence',
      'ct__request_offers__party_coherence',
      'fk__contract_dispute_evidence__contract_id',
      'fk__contract_dispute_evidence__dispute_id',
      'fk__contract_dispute_evidence__provider_operation_id',
      'fk__contract_dispute_resolution_evidence__dispute_id',
      'fk__contract_dispute_resolution_evidence__evidence_id',
      'fk__contract_lifecycle_events__contract_id',
      'fk__contract_lifecycle_events__provider_operation_id',
      'fk__contract_notification_intents__contract_id',
      'fk__contract_notification_intents__timeline_event_id',
      'fk__contract_reputation_signals__contract_id',
      'fk__contract_reputation_signals__dispute_id',
      'fk__contract_review_eligibilities__buyer_partner_id',
      'fk__contract_review_eligibilities__contract_id',
      'fk__contract_review_eligibilities__publication_id',
      'fk__contract_review_eligibilities__seller_partner_id',
      'fk__listing_promotions__billing_operation_id',
      'fk__listing_promotions__listing_publication_id',
      'fk__listing_promotions__seller_partner_id',
      'fk__listing_promotions__seller_public_id',
      'fk__marketplace_ai_consultation_operations__consultation_id',
      'fk__marketplace_ai_starter_cart_operations__buyer_partner_id',
      'fk__marketplace_ai_starter_cart_operations__consultation_id',
      'fk__marketplace_carts__buyer_partner_id',
      'fk__marketplace_carts__seller_partner_id',
      'fk__marketplace_contract_artifacts__contract_id',
      'fk__marketplace_contract_artifacts__provider_operation_id',
      'fk__marketplace_contract_commissions__contract_id',
      'fk__marketplace_contract_disputes__contract_id',
      'fk__marketplace_contract_fulfillments__contract_id',
      'fk__marketplace_contract_settlements__contract_id',
      'fk__marketplace_contract_signatures__artifact_id',
      'fk__marketplace_contract_signatures__contract_id',
      'fk__marketplace_contract_signatures__provider_operation_id',
      'fk__marketplace_contracts__buyer_partner_id',
      'fk__marketplace_contracts__seller_partner_id',
      'fk__marketplace_engagement_notification__event_id',
      'fk__marketplace_listing_favorites__listing_id',
      'fk__marketplace_listing_publications__produce_listing_id',
      'fk__marketplace_listing_publications__product_id',
      'fk__marketplace_listing_publications__seller_public_id',
      'fk__marketplace_listing_publications__seller_revision_id',
      'fk__marketplace_listing_reviews__eligibility_id',
      'fk__marketplace_listing_reviews__listing_id',
      'fk__marketplace_listing_reviews__produce_id',
      'fk__marketplace_listing_reviews__product_id',
      'fk__marketplace_listing_samples__listing_id',
      'fk__marketplace_listing_samples__policy_id',
      'fk__marketplace_listing_samples__produce_id',
      'fk__marketplace_listing_samples__product_id',
      'fk__marketplace_offers__buyer_partner_id',
      'fk__marketplace_offers__request',
      'fk__marketplace_offers__request_public_id',
      'fk__marketplace_offers__seller_partner_id',
      'fk__marketplace_partner_memberships__partner_id',
      'fk__marketplace_produce_org_bindings__produce_listing_id',
      'fk__marketplace_produce_org_bindings__supplier_partner_id',
      'fk__marketplace_public_seller_revisions__seller_public_id',
      'fk__marketplace_public_sellers__partner_id',
      'fk__marketplace_request_org_bindings__buyer_partner_id',
      'fk__marketplace_request_org_bindings__request_id',
      'fk__marketplace_request_publications__buyer_partner_id',
      'fk__marketplace_request_publications__request_id',
      'fk__marketplace_requests__buyer_partner_id',
      'fk__marketplace_review_aggregates__listing_id',
      'fk__marketplace_review_replies__review_id',
      'fk__marketplace_review_reports__review_id',
      'fk__marketplace_verification_evidence__verification_actor',
      'marketplace_commerce_operations_pkey',
      'marketplace_commission_rate_policies_pkey',
      'marketplace_contract_artifacts_pkey',
      'marketplace_contract_commissions_pkey',
      'marketplace_contract_dispute_evidence_pkey',
      'marketplace_contract_dispute_resolution_evidence_pkey',
      'marketplace_contract_disputes_pkey',
      'marketplace_contract_fulfillments_pkey',
      'marketplace_contract_lifecycle_events_pkey',
      'marketplace_contract_notification_intents_pkey',
      'marketplace_contract_reputation_signals_pkey',
      'marketplace_contract_review_eligibilities_pkey',
      'marketplace_contract_settlements_pkey',
      'marketplace_contract_signatures_pkey',
      'marketplace_engagement_events_pkey',
      'marketplace_engagement_notification_intents_pkey',
      'marketplace_engagement_operations_pkey',
      'marketplace_listing_favorites_pkey',
      'marketplace_listing_promotions_pkey',
      'marketplace_listing_publications_pkey',
      'marketplace_listing_reviews_pkey',
      'marketplace_listing_samples_pkey',
      'marketplace_partner_memberships_pkey',
      'marketplace_produce_organization_bindings_pkey',
      'marketplace_provider_operations_pkey',
      'marketplace_public_seller_revisions_pkey',
      'marketplace_public_sellers_pkey',
      'marketplace_publication_moderation_operations_pkey',
      'marketplace_request_organization_bindings_pkey',
      'marketplace_request_publications_pkey',
      'marketplace_review_aggregates_pkey',
      'marketplace_review_replies_pkey',
      'marketplace_review_reports_pkey',
      'marketplace_sample_monthly_usage_pkey',
      'marketplace_sample_policies_pkey',
      'marketplace_verification_evidence_pkey',
      'pk__marketplace_ai_consultation_operations',
      'pk__marketplace_ai_consultations',
      'pk__marketplace_ai_starter_cart_operations',
      'pk__marketplace_carts',
      'pk__marketplace_contracts',
      'pk__marketplace_favorites',
      'pk__marketplace_request_offers',
      'pk__marketplace_requests',
      'pk__marketplace_reviews',
      'pk__marketplace_sample_requests',
      'pk__marketplace_verifications',
      'uq__commission_rate_policies__activation_key',
      'uq__commission_rate_policies__version',
      'uq__contract_dispute_evidence__dispute_revision',
      'uq__contract_dispute_evidence__provider_operation',
      'uq__contract_dispute_resolution_evidence__dispute_evidence',
      'uq__contract_lifecycle_events__contract_id_sequence',
      'uq__contract_lifecycle_events__provider_operation_id',
      'uq__contract_notification_intents__event_recipient',
      'uq__contract_reputation_signals__dispute_id',
      'uq__contract_review_eligibilities__contract_source',
      'uq__listing_promotions__activation_reference',
      'uq__listing_promotions__actor_command_key',
      'uq__listing_promotions__billing_operation_id',
      'uq__marketplace_ai_consultation_operations__actor_key',
      'uq__marketplace_ai_consultation_operations__consultation_id',
      'uq__marketplace_ai_starter_cart_operations__actor_key',
      'uq__marketplace_ai_starter_cart_operations__consultation_id',
      'uq__marketplace_commerce_operations__actor_operation_key',
      'uq__marketplace_contract_artifacts__contract_id',
      'uq__marketplace_contract_artifacts__provider_operation_id',
      'uq__marketplace_contract_artifacts__storage_reference',
      'uq__marketplace_contract_commissions__contract_id',
      'uq__marketplace_contract_disputes__contract_id',
      'uq__marketplace_contract_fulfillments__contract_id',
      'uq__marketplace_contract_settlements__contract_id',
      'uq__marketplace_contract_signatures__contract_id_party',
      'uq__marketplace_contract_signatures__provider_operation_id',
      'uq__marketplace_contracts__tenant_id_source_type_source_id',
      'uq__marketplace_engagement_events__aggregate_sequence',
      'uq__marketplace_engagement_notification__event_recipient',
      'uq__marketplace_engagement_operations__actor_operation_key',
      'uq__marketplace_listing_favorites__actor_listing',
      'uq__marketplace_listing_publications__produce_listing_id',
      'uq__marketplace_listing_publications__product_id',
      'uq__marketplace_listing_publications__tenant_id_owner_65e6b9c7',
      'uq__marketplace_listing_reviews__eligibility',
      'uq__marketplace_partner_memberships__partner_user_capability',
      'uq__marketplace_provider_ops__scope_key',
      'uq__marketplace_public_seller_revisions__seller_fingerprint',
      'uq__marketplace_public_seller_revisions__seller_revision',
      'uq__marketplace_public_sellers__id_tenant_id',
      'uq__marketplace_public_sellers__partner_id',
      'uq__marketplace_publication_moderation_ops__tenant_reviewer_key',
      'uq__marketplace_request_publications__request_id',
      'uq__marketplace_request_publications__tenant_id_buyer_84329ad6',
      'uq__marketplace_review_replies__review_id',
      'uq__marketplace_review_reports__reporter_reason',
      'uq__marketplace_reviews__tenant_id_product_id_user_id',
      'uq__marketplace_sample_policies__tenant_version',
      'uq__marketplace_verification_evidence__case_kind_revision',
      'uq__marketplace_verifications__id_tenant_id_user_id',
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
      .filter((statement) => statement.includes('"marketplace_'))
      .filter(
        (statement) =>
          ![
            'drop constraint "fk__marketplace_verification_evidence__verification_actor"',
            'drop constraint "ck__marketplace_verification_evidence__document_revision"',
            'drop constraint "ck__marketplace_verification_evidence__size"',
            'drop trigger if exists "trg__marketplace_verification_evidence__immutable"',
            'drop function if exists "marketplace_verification_evidence_trg__marketplace_verification_evidence__immutable_fn"',
            'drop trigger if exists "ct__marketplace_requests__organization_binding_coherence"',
            'drop function if exists "marketplace_requests_ct__marketplace_requests__organization_binding_coherence_fn"',
            'drop trigger if exists "ct__marketplace_public_sellers__organization_coherence"',
            'drop function if exists "marketplace_public_sellers_ct__marketplace_public_sellers__organization_coherence_fn"',
            'drop trigger if exists "tr__marketplace_public_seller_revisions__immutable_content"',
            'drop function if exists "marketplace_public_seller_revisions_tr__marketplace_public_seller_revisions__immutable_content_fn"',
            'drop trigger if exists "ct__marketplace_request_org_bindings__coherence"',
            'drop function if exists "marketplace_request_organization_bindings_ct__marketplace_request_org_bindings__coherence_fn"',
            'drop trigger if exists "tr__marketplace_request_org_bindings__immutable"',
            'drop function if exists "marketplace_request_organization_bindings_tr__marketplace_request_org_bindings__immutable_fn"',
            'drop trigger if exists "ct__marketplace_request_publications__party_coherence"',
            'drop function if exists "marketplace_request_publications_ct__marketplace_request_publications__party_coherence_fn"',
            'drop trigger if exists "ct__marketplace_produce_org_bindings__coherence"',
            'drop function if exists "marketplace_produce_organization_bindings_ct__marketplace_produce_org_bindings__coherence_fn"',
            'drop trigger if exists "tr__marketplace_produce_org_bindings__immutable"',
            'drop function if exists "marketplace_produce_organization_bindings_tr__marketplace_produce_org_bindings__immutable_fn"',
            'drop trigger if exists "ct__marketplace_listing_publications__coherence"',
            'drop function if exists "marketplace_listing_publications_ct__marketplace_listing_publications__coherence_fn"',
            'drop trigger if exists "ct__marketplace_requests__party_coherence"',
            'drop function if exists "marketplace_requests_ct__marketplace_requests__party_coherence_fn"',
            'drop trigger if exists "ct__carts__party_coherence"',
            'drop function if exists "marketplace_carts_ct__carts__party_coherence_fn"',
            'drop trigger if exists "ct__contracts__party_coherence"',
            'drop function if exists "marketplace_contracts_ct__contracts__party_coherence_fn"',
            'drop trigger if exists "tr__marketplace_contracts__frozen_authority"',
            'drop function if exists "marketplace_contracts_tr__marketplace_contracts__frozen_authority_fn"',
            // 20260812120000: the single-award rules. MikroORM knows the partial
            // unique index from the entity, but not the two guards behind it.
            'drop trigger if exists "ct__marketplace_contracts__offer_selection"',
            'drop function if exists "marketplace_contracts_ct__marketplace_contracts__offer_selection_fn"',
            'drop trigger if exists "tr__marketplace_requests__stage_authority"',
            'drop function if exists "marketplace_requests_tr__marketplace_requests__stage_authority_fn"',
            'drop trigger if exists "tr__marketplace_commerce_operations__immutable"',
            'drop function if exists "marketplace_commerce_operations_tr__marketplace_commerce_operations__immutable_fn"',
            'drop trigger if exists "ct__marketplace_partner_memberships__coherence"',
            'drop function if exists "marketplace_partner_memberships_ct__marketplace_partner_memberships__coherence_fn"',
            'drop trigger if exists "tr__marketplace_partner_memberships__immutable_identity"',
            'drop function if exists "marketplace_partner_memberships_tr__marketplace_partner_memberships__immutable_identity_fn"',
            'drop trigger if exists "tr__marketplace_request_bindings__resolve_party"',
            'drop function if exists "marketplace_request_organization_bindings_tr__marketplace_request_bindings__resolve_party_fn"',
            'drop trigger if exists "ct__marketplace_request_offers__public_request"',
            'drop function if exists "marketplace_request_offers_ct__marketplace_request_offers__public_request_fn"',
            'drop trigger if exists "ct__request_offers__party_coherence"',
            'drop function if exists "marketplace_request_offers_ct__request_offers__party_coherence_fn"',
            'drop trigger if exists "tr__marketplace_contracts__provider_ops_anchor"',
            'drop function if exists "marketplace_contracts_tr__marketplace_contracts__provider_ops_anchor_fn"',
            'drop trigger if exists "tr__marketplace_provider_ops__guard"',
            'drop function if exists "marketplace_provider_operations_tr__marketplace_provider_ops__guard_fn"',
            'drop trigger if exists "tr__marketplace_provider_ops__resource_anchor"',
            'drop function if exists "marketplace_provider_operations_tr__marketplace_provider_ops__resource_anchor_fn"',
            'drop trigger if exists "tr__marketplace_verifications__provider_ops_anchor"',
            'drop function if exists "marketplace_verifications_tr__marketplace_verifications__provider_ops_anchor_fn"',
            'drop trigger if exists "tr__listing_promotions__provider_ops_anchor"',
            'drop function if exists "marketplace_listing_promotions_tr__listing_promotions__provider_ops_anchor_fn"',
            'drop trigger if exists "tr__marketplace_listing_promotions__guard"',
            'drop function if exists "marketplace_listing_promotions_tr__marketplace_listing_promotions__guard_fn"',
            'drop constraint "ck__marketplace_provider_ops__provider_event"',
            'drop constraint "ck__marketplace_provider_ops__result_descriptor"',
            'drop constraint "ck__marketplace_provider_ops__scope"',
            'add constraint "ck__marketplace_provider_ops__provider_event"',
            'add constraint "ck__marketplace_provider_ops__result_descriptor"',
            'add constraint "ck__marketplace_provider_ops__scope"',
            'drop function if exists "marketplace_provider_receipt_is_safe"',
            'drop function if exists "marketplace_provider_descriptor_is_valid"',
            'drop function if exists "marketplace_provider_result_is_valid"',
            'drop function if exists "marketplace_contract_snapshot_is_valid"',
            'drop function if exists "marketplace_contract_lines_are_frozen"',
            'drop constraint "ck__listing_promotions__currency"',
            'drop constraint "ck__listing_promotions__plan"',
            'create unique index "uq__marketplace_listing_promotions__listing_publication_id"',
            'add constraint "ck__listing_promotions__currency"',
            'add constraint "ck__listing_promotions__plan"',
            'add constraint "ck__marketplace_verification_evidence__document_revision"',
            'add constraint "ck__marketplace_verification_evidence__size"',
            // 135000: MikroORM cannot represent the guarded dashboard/AI state machines.
            'constraint "ck__marketplace_ai_consultations__answer_shape"',
            'constraint "ck__marketplace_ai_consultations__question"',
            'constraint "ck__marketplace_ai_consultations__revision"',
            'constraint "ck__marketplace_ai_starter_cart_operations__result_snapshot"',
            'drop trigger if exists "ct__marketplace_ai_consultations__receipts"',
            'drop function if exists "marketplace_ai_consultations_ct__marketplace_ai_consultations__receipts_fn"',
            'drop trigger if exists "tr__marketplace_ai_consultations__guard"',
            'drop function if exists "marketplace_ai_consultations_tr__marketplace_ai_consultations__guard_fn"',
            'drop trigger if exists "tr__marketplace_ai_consultation_operations__guard"',
            'drop function if exists "marketplace_ai_consultation_operations_tr__marketplace_ai_consultation_operations__guard_fn"',
            'drop trigger if exists "tr__marketplace_ai_starter_cart_operations__guard"',
            'drop function if exists "marketplace_ai_starter_cart_operations_tr__marketplace_ai_starter_cart_operations__guard_fn"',
            // 134000/136000/137000: checks are semantically identical normalization;
            // triggers and functions are migration-owned immutable/coherence guards.
            'constraint "ck__commission_rate_policies__rates"',
            'constraint "ck__contract_disputes__resolution"',
            'constraint "ck__contract_fulfillments__timeline"',
            'constraint "ck__contract_reputation_signals__outcome"',
            'constraint "ck__contract_reputation_signals__reason"',
            'constraint "ck__contract_settlements__kind_status"',
            'constraint "ck__contract_settlements__reconciliation"',
            'constraint "ck__contract_lifecycle_events__provider"',
            'constraint "ck__contract_notification_intents__delivery_shape"',
            'constraint "ck__contract_dispute_evidence__shape"',
            'constraint "ck__contract_artifacts__shape"',
            'constraint "ck__contract_signatures__provider"',
            'alter column "claimed_at" set default to_timestamp(0)',
            'create unique index "uq__marketplace_provider_operations__resource_type_res_5a3eb243"',
            'create unique index "uq__marketplace_provider_operations__resource_type_res_60f8f54d"',
            'create unique index "uq__marketplace_provider_operations__resource_type_res_7c8d5a0e"',
            'create unique index "uq__marketplace_provider_operations__resource_type_res_e15a456d"',
            'drop trigger if exists "tr__marketplace_commission_rate_policies__guard"',
            'drop function if exists "marketplace_commission_rate_policies_tr__marketplace_commission_rate_policies__guard_fn"',
            'drop trigger if exists "tr__marketplace_contract_commissions__immutable"',
            'drop function if exists "marketplace_contract_commissions_tr__marketplace_contract_commissions__immutable_fn"',
            'drop trigger if exists "ct__contract_dispute_resolution__coherence"',
            'drop function if exists "marketplace_contract_disputes_ct__contract_dispute_resolution__coherence_fn"',
            'drop trigger if exists "tr__marketplace_contract_disputes__guard"',
            'drop function if exists "marketplace_contract_disputes_tr__marketplace_contract_disputes__guard_fn"',
            'drop trigger if exists "tr__contract_fulfillments__guard"',
            'drop function if exists "marketplace_contract_fulfillments_tr__contract_fulfillments__guard_fn"',
            'drop trigger if exists "ct__contract_reputation_signals__coherence"',
            'drop function if exists "marketplace_contract_reputation_signals_ct__contract_reputation_signals__coherence_fn"',
            'drop trigger if exists "tr__contract_reputation_signals__immutable"',
            'drop function if exists "marketplace_contract_reputation_signals_tr__contract_reputation_signals__immutable_fn"',
            'drop trigger if exists "tr__contract_settlements__guard"',
            'drop function if exists "marketplace_contract_settlements_tr__contract_settlements__guard_fn"',
            'drop trigger if exists "ct__contract_lifecycle_events__coherence"',
            'drop function if exists "marketplace_contract_lifecycle_events_ct__contract_lifecycle_events__coherence_fn"',
            'drop trigger if exists "tr__marketplace_contract_lifecycle_events__immutable"',
            'drop function if exists "marketplace_contract_lifecycle_events_tr__marketplace_contract_lifecycle_events__immutable_fn"',
            'drop trigger if exists "tr__marketplace_contract_notification_intents__delivery_guard"',
            'drop function if exists "marketplace_contract_notification_intents_tr__marketplace_contract_notification_intents__delivery_guard_fn"',
            'drop trigger if exists "ct__contract_dispute_evidence__coherence"',
            'drop function if exists "marketplace_contract_dispute_evidence_ct__contract_dispute_evidence__coherence_fn"',
            'drop trigger if exists "tr__contract_dispute_evidence__immutable"',
            'drop function if exists "marketplace_contract_dispute_evidence_tr__contract_dispute_evidence__immutable_fn"',
            'drop trigger if exists "ct__contract_dispute_resolution_evidence__coherence"',
            'drop function if exists "marketplace_contract_dispute_resolution_evidence_ct__contract_dispute_resolution_evidence__coherence_fn"',
            'drop trigger if exists "tr__contract_dispute_resolution_evidence__immutable"',
            'drop function if exists "marketplace_contract_dispute_resolution_evidence_tr__contract_dispute_resolution_evidence__immutable_fn"',
            'drop trigger if exists "ct__contract_artifacts__coherence"',
            'drop function if exists "marketplace_contract_artifacts_ct__contract_artifacts__coherence_fn"',
            'drop trigger if exists "tr__marketplace_contract_artifacts__immutable"',
            'drop function if exists "marketplace_contract_artifacts_tr__marketplace_contract_artifacts__immutable_fn"',
            'drop trigger if exists "ct__contract_signatures__coherence"',
            'drop function if exists "marketplace_contract_signatures_ct__contract_signatures__coherence_fn"',
            'drop trigger if exists "tr__marketplace_contract_signatures__immutable"',
            'drop function if exists "marketplace_contract_signatures_tr__marketplace_contract_signatures__immutable_fn"',
            'drop trigger if exists "tr__marketplace_contract_review_eligibilities__immutable"',
            'drop function if exists "marketplace_contract_review_eligibilities_tr__marketplace_contract_review_eligibilities__immutable_fn"',
            // 138000: append-only engagement guards and parser-normalized checks.
            'constraint "ck__marketplace_engagement_notification__status"',
            'constraint "ck__marketplace_engagement_operations__operation"',
            'constraint "ck__marketplace_sample_monthly_usage__count"',
            'constraint "ck__marketplace_sample_policies__limit"',
            'constraint "ck__marketplace_listing_samples__delivery"',
            'constraint "ck__marketplace_listing_samples__feedback"',
            'constraint "ck__marketplace_listing_samples__policy"',
            'constraint "ck__marketplace_listing_reviews__rating"',
            'constraint "ck__marketplace_listing_reviews__visibility"',
            'constraint "ck__marketplace_review_reports__status"',
            'drop trigger if exists "tr__marketplace_engagement_events__immutable"',
            'drop function if exists "marketplace_engagement_events_tr__marketplace_engagement_events__immutable_fn"',
            'drop trigger if exists "tr__marketplace_engagement_notification__immutable"',
            'drop function if exists "marketplace_engagement_notification_intents_tr__marketplace_engagement_notification__immutable_fn"',
            'drop trigger if exists "tr__marketplace_engagement_operations__immutable"',
            'drop function if exists "marketplace_engagement_operations_tr__marketplace_engagement_operations__immutable_fn"',
            'drop trigger if exists "tr__marketplace_sellers__engagement_identity"',
            'drop function if exists "marketplace_public_sellers_tr__marketplace_sellers__engagement_identity_fn"',
            'drop trigger if exists "tr__marketplace_sample_policies__guard"',
            'drop function if exists "marketplace_sample_policies_tr__marketplace_sample_policies__guard_fn"',
            'drop trigger if exists "tr__marketplace_publications__engagement_identity"',
            'drop function if exists "marketplace_listing_publications_tr__marketplace_publications__engagement_identity_fn"',
            'drop trigger if exists "tr__marketplace_listing_samples__coherence"',
            'drop function if exists "marketplace_listing_samples_tr__marketplace_listing_samples__coherence_fn"',
            'drop trigger if exists "tr__marketplace_listing_samples__guard"',
            'drop function if exists "marketplace_listing_samples_tr__marketplace_listing_samples__guard_fn"',
            'drop trigger if exists "tr__marketplace_listing_reviews__aggregate"',
            'drop function if exists "marketplace_listing_reviews_tr__marketplace_listing_reviews__aggregate_fn"',
            'drop trigger if exists "tr__marketplace_listing_reviews__coherence"',
            'drop function if exists "marketplace_listing_reviews_tr__marketplace_listing_reviews__coherence_fn"',
            'drop trigger if exists "tr__marketplace_listing_reviews__guard"',
            'drop function if exists "marketplace_listing_reviews_tr__marketplace_listing_reviews__guard_fn"',
            'drop trigger if exists "tr__marketplace_review_reports__coherence"',
            'drop function if exists "marketplace_review_reports_tr__marketplace_review_reports__coherence_fn"',
            'drop trigger if exists "tr__marketplace_review_reports__guard"',
            'drop function if exists "marketplace_review_reports_tr__marketplace_review_reports__guard_fn"',
            'drop trigger if exists "tr__marketplace_review_replies__coherence"',
            'drop function if exists "marketplace_review_replies_tr__marketplace_review_replies__coherence_fn"',
            'drop trigger if exists "tr__marketplace_review_replies__immutable"',
            'drop function if exists "marketplace_review_replies_tr__marketplace_review_replies__immutable_fn"',
          ].some((knownMigrationOwnedFragment) => statement.includes(knownMigrationOwnedFragment)),
      );
    expect(marketplaceSchemaDrift).toEqual([]);
  });

  it('does not retain legacy internal signing contention paths', () => {
    expect('signContract' in new PostgresMarketplaceRepository(requireOrm(orm).em.fork())).toBe(false);
  });

  it('serializes competing offer selection and rolls back every mutation on a duplicate contract source', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const tenantId = 'tenant-offer-contention';
    const buyer = { tenantId, userId: 'buyer-offers' };
    const sellerA = { tenantId, userId: 'seller-a' };
    const sellerB = { tenantId, userId: 'seller-b' };

    const buyerPartnerId = randomUUID();
    const sellerPartnerAId = randomUUID();
    const sellerPartnerBId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', ownerUserId: buyer.userId, tenantId });
    await insertPartner(database.em, { id: sellerPartnerAId, ownerUserId: sellerA.userId, tenantId });
    await insertPartner(database.em, { id: sellerPartnerBId, ownerUserId: sellerB.userId, tenantId });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyer.userId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: sellerA.userId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: sellerB.userId });

    const request = await new PostgresMarketplaceRepository(database.em.fork()).createRequest(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        title: 'Certified corn seed',
        region: 'Samarkand',
      },
      'request-contention-001',
    );
    if (request.status !== 'ok') {
      throw new Error('The buyer request fixture must be persisted before offer contention.');
    }
    const requestPublicId = await publishBuyerRequest(database.em, {
      buyerPartnerId,
      buyerUserId: buyer.userId,
      requestId: request.value.id,
      tenantId,
      title: request.value.title,
    });
    const offerA = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      sellerA,
      requestPublicId,
      { actingPartnerId: sellerPartnerAId, deliveryTerms: 'pickup', priceUzs: 4_100_000 },
      'offer-contention-a',
    );
    const offerB = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      sellerB,
      requestPublicId,
      { actingPartnerId: sellerPartnerBId, deliveryTerms: 'pickup', priceUzs: 4_200_000 },
      'offer-contention-b',
    );
    if (offerA.status !== 'ok' || offerB.status !== 'ok') {
      throw new Error('Both seller offers must be persisted before selection contention.');
    }

    const selections = await Promise.all([
      new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(
        buyer,
        requestPublicId,
        offerA.value.id,
        'choose-contention-a',
      ),
      new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(
        buyer,
        requestPublicId,
        offerB.value.id,
        'choose-contention-b',
      ),
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

    const rollbackRequest = await new PostgresMarketplaceRepository(database.em.fork()).createRequest(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        title: 'Rollback source conflict',
        region: 'Samarkand',
      },
      'request-rollback-0001',
    );
    if (rollbackRequest.status !== 'ok') {
      throw new Error('The rollback request fixture must be persisted.');
    }
    const rollbackRequestPublicId = await publishBuyerRequest(database.em, {
      buyerPartnerId,
      buyerUserId: buyer.userId,
      requestId: rollbackRequest.value.id,
      tenantId,
      title: rollbackRequest.value.title,
    });
    const rollbackOffer = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      sellerA,
      rollbackRequestPublicId,
      { actingPartnerId: sellerPartnerAId, deliveryTerms: 'pickup', priceUzs: 4_300_000 },
      'offer-rollback-0001',
    );
    if (rollbackOffer.status !== 'ok') {
      throw new Error('The rollback offer fixture must be persisted.');
    }
    const existingSourceContract = new ContractEntity();
    existingSourceContract.id = randomUUID();
    existingSourceContract.tenantId = tenantId;
    existingSourceContract.buyerUserId = buyer.userId;
    existingSourceContract.buyerPartnerId = buyerPartnerId;
    existingSourceContract.buyerPartySnapshot = {
      legalName: 'Marketplace organization',
      partnerId: buyerPartnerId,
      region: 'Samarkand',
      tenantId,
      userId: buyer.userId,
    };
    existingSourceContract.sellerTenantId = tenantId;
    existingSourceContract.sellerUserId = sellerA.userId;
    existingSourceContract.sellerPartnerId = sellerPartnerAId;
    existingSourceContract.sellerPartySnapshot = {
      legalName: 'Marketplace organization',
      partnerId: sellerPartnerAId,
      region: 'Samarkand',
      tenantId,
      userId: sellerA.userId,
    };
    existingSourceContract.bindingStatus = 'resolved';
    existingSourceContract.sourceType = 'offer_selection';
    existingSourceContract.sourceId = rollbackOffer.value.id;
    existingSourceContract.subject = 'Pre-existing source record';
    existingSourceContract.amountUzs = 4_300_000;
    existingSourceContract.lines = [
      {
        lineTotalUzs: 4_300_000,
        name: rollbackRequest.value.title,
        quantity: 1,
        sourceId: rollbackRequest.value.id,
        sourceKind: 'request',
        sourcePublicationId: rollbackRequestPublicId,
        sourceRevision: 1,
        unit: 'request',
        unitPriceUzs: 4_300_000,
      },
    ];
    existingSourceContract.deliveryTerms = 'pickup';
    existingSourceContract.deliveryPriceUzs = 0;
    database.em.persist(existingSourceContract);
    await database.em.flush();
    database.em.clear();

    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(
        buyer,
        rollbackRequestPublicId,
        rollbackOffer.value.id,
        'choose-rollback-0001',
      ),
    ).rejects.toThrow(/uq__marketplace_contracts__source_type_source_id|unique constraint/u);

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
        0,
        'verification-review-approve',
      ),
      new PostgresMarketplaceRepository(database.em.fork()).reviewVerification(
        tenantId,
        verificationId,
        'rejected',
        'admin-reject',
        0,
        'verification-review-reject',
        'criteria_not_met',
      ),
    ]);

    expect(decisions.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(decisions.filter(({ status }) => status === 'conflict')).toHaveLength(1);
    const winningDecision = decisions.find(({ status }) => status === 'ok');
    if (!winningDecision || winningDecision.status !== 'ok') {
      throw new Error('One serialized verification decision must succeed.');
    }
    const winningIndex = decisions.findIndex(({ status }) => status === 'ok');
    const winningCommand =
      winningIndex === 0
        ? {
            decision: 'verified' as const,
            idempotencyKey: 'verification-review-approve',
            reviewedBy: 'admin-approve',
          }
        : {
            decision: 'rejected' as const,
            idempotencyKey: 'verification-review-reject',
            reason: 'criteria_not_met' as const,
            reviewedBy: 'admin-reject',
          };
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).reviewVerification(
        tenantId,
        verificationId,
        winningCommand.decision,
        winningCommand.reviewedBy,
        0,
        winningCommand.idempotencyKey,
        'reason' in winningCommand ? winningCommand.reason : undefined,
      ),
    ).resolves.toEqual(winningDecision);
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).reviewVerification(
        tenantId,
        verificationId,
        winningCommand.decision === 'verified' ? 'rejected' : 'verified',
        winningCommand.reviewedBy,
        0,
        winningCommand.idempotencyKey,
        winningCommand.decision === 'verified' ? 'criteria_not_met' : undefined,
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    expect(
      await rows<{ reviewedBy: string; status: string }>(
        database.em,
        `select reviewed_by as "reviewedBy", status
           from marketplace_verifications
          where id = ?`,
        [verificationId],
      ),
    ).toEqual([{ reviewedBy: winningDecision.value.reviewedBy, status: winningDecision.value.status }]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_commerce_operations
          where operation = 'verification_review' and resource_key = ?`,
        [verificationId],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('persists verification creation replays and fences concurrent stale revisions', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const actor = { tenantId: 'tenant-verification-create-replay', userId: 'verification-user' };
    const idempotencyKey = 'verification-create-replay';
    const created = await new PostgresMarketplaceRepository(database.em.fork()).createVerification(
      actor,
      'buyer',
      0,
      idempotencyKey,
    );
    expect(created).toMatchObject({ status: 'ok', value: { role: 'buyer', status: 'none' } });
    if (created.status !== 'ok') {
      throw new Error('The verification creation fixture must be persisted.');
    }
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).createVerification(actor, 'buyer', 0, idempotencyKey),
    ).resolves.toEqual(created);
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).createVerification(actor, 'farmer', 0, idempotencyKey),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).createVerification(
        actor,
        'buyer',
        0,
        'verification-create-stale',
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'expectedRevision' });

    const concurrentActor = { tenantId: 'tenant-verification-create-cas', userId: 'verification-user' };
    const concurrentResults = await Promise.all([
      new PostgresMarketplaceRepository(database.em.fork()).createVerification(
        concurrentActor,
        'buyer',
        0,
        'verification-create-cas-a',
      ),
      new PostgresMarketplaceRepository(database.em.fork()).createVerification(
        concurrentActor,
        'buyer',
        0,
        'verification-create-cas-b',
      ),
    ]);
    expect(concurrentResults.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(concurrentResults.filter(({ status }) => status === 'conflict')).toEqual([
      { status: 'conflict', field: 'expectedRevision' },
    ]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_commerce_operations
          where operation = 'verification_create' and actor_tenant_id in (?, ?)`,
        [actor.tenantId, concurrentActor.tenantId],
      ),
    ).toEqual([{ count: 2 }]);
  });

  it('executes only one concurrent request for the same scoped provider idempotency key', async () => {
    const database = requireOrm(orm);
    await database.migrator.up();
    const actor = { tenantId: 'tenant-provider-same-key', userId: 'verification-user' };
    const created = await new PostgresMarketplaceRepository(database.em.fork()).createVerification(
      actor,
      'farmer',
      0,
      'verification-create-provider-same',
    );
    if (created.status !== 'ok') {
      throw new Error('The verification fixture must be persisted.');
    }
    const preparation = oneIdProviderPreparation(created.value.id, created.value.caseRevision, 'oneid-concurrent-key');

    const prepared = await Promise.all([
      new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(actor, preparation),
      new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(actor, preparation),
    ]);

    expect(prepared.filter((result) => result.status === 'ok' && result.value.execute)).toHaveLength(1);
    expect(prepared.filter((result) => result.status === 'conflict')).toEqual([
      { status: 'conflict', field: 'operationInProgress' },
    ]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_provider_operations
          where tenant_id = ? and user_id = ? and capability = 'oneid_link'
            and resource_type = 'verification' and resource_id = ? and idempotency_key = ?`,
        [actor.tenantId, actor.userId, created.value.id, preparation.idempotencyKey],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('replays a JSONB-hydrated result and fences a stale callback after lease takeover', async () => {
    const database = requireOrm(orm);
    const actor = { tenantId: 'tenant-provider-replay', userId: 'verification-user' };
    const repository = new PostgresMarketplaceRepository(database.em.fork());
    const created = await repository.createVerification(actor, 'buyer', 0, 'verification-create-provider-replay');
    if (created.status !== 'ok') {
      throw new Error('The verification fixture must be persisted.');
    }
    const preparation = oneIdProviderPreparation(created.value.id, created.value.caseRevision, 'oneid-replay-key');
    const operationId = randomUUID();
    await database.em.getConnection().execute(
      `insert into marketplace_provider_operations
        (id, tenant_id, user_id, actor_type, capability, resource_type, resource_id,
         resource_revision, idempotency_key, request_fingerprint, request_descriptor,
         provider_mode, provider_name, status, attempt, lease_expires_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, 'started', 1,
               now() + interval '100 milliseconds', now(), now())`,
      [
        operationId,
        actor.tenantId,
        actor.userId,
        preparation.actorType,
        preparation.capability,
        preparation.resourceType,
        preparation.resourceId,
        preparation.resourceRevision,
        preparation.idempotencyKey,
        preparation.requestFingerprint,
        JSON.stringify(preparation.requestDescriptor),
        preparation.providerMode,
        preparation.providerName,
      ],
    );
    await database.em.getConnection().execute(`select pg_sleep(0.15)`);
    const takeover = await new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(
      actor,
      preparation,
    );
    expect(takeover).toMatchObject({ status: 'ok', value: { attempt: 2, execute: true } });
    if (takeover.status !== 'ok') {
      throw new Error('The expired provider operation must be taken over.');
    }
    const providerResult = {
      identityAssurance: 'mock' as const,
      linkedAt: new Date(),
      providerMode: 'mock' as const,
      providerName: 'mock-oneid',
      receiptId: `mock-oneid:${operationId}`,
      subjectKey: createHash('sha256').update(`mock-oneid:${actor.userId}`).digest('hex'),
    };
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).completeIdentityLink(actor, operationId, 1, providerResult),
    ).resolves.toEqual({ status: 'conflict', field: 'operationAttempt' });
    const completed = await new PostgresMarketplaceRepository(database.em.fork()).completeIdentityLink(
      actor,
      takeover.value.operationId,
      takeover.value.attempt,
      providerResult,
    );
    expect(completed).toMatchObject({ status: 'ok', value: { oneIdLinked: true } });

    database.em.clear();
    const replayed = await new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(
      actor,
      preparation,
    );
    expect(replayed).toMatchObject({
      status: 'ok',
      value: { attempt: 2, execute: false, replay: { oneIdLinked: true } },
    });
  });

  it('invalidates old provider keys and resets migrated legacy identity when a rejected case resumes', async () => {
    const database = requireOrm(orm);
    const actor = { tenantId: 'tenant-provider-resume', userId: 'verification-user' };
    const repository = new PostgresMarketplaceRepository(database.em.fork());
    const created = await repository.createVerification(actor, 'farmer', 0, 'verification-create-provider-resume');
    if (created.status !== 'ok') {
      throw new Error('The verification fixture must be persisted.');
    }
    const oldOneId = oneIdProviderPreparation(created.value.id, created.value.caseRevision, 'oneid-old-case-key');
    const oldDocument = documentProviderPreparation(
      created.value.id,
      created.value.caseRevision,
      'document-old-case-key',
      { fileName: 'farm.pdf', kind: 'farm', mimeType: 'application/pdf', sha256: 'a'.repeat(64), sizeBytes: 10 },
    );
    expect(await repository.prepareProviderOperation(actor, oldOneId)).toMatchObject({ status: 'ok' });
    expect(await repository.prepareProviderOperation(actor, oldDocument)).toMatchObject({ status: 'ok' });
    await database.em.getConnection().execute(
      `update marketplace_verifications
          set status = 'rejected', rejection_reason = 'documents_unreadable', one_id_linked = true,
              provider_mode = 'legacy', identity_assurance = 'legacy_unknown'
        where id = ?`,
      [created.value.id],
    );
    const resumed = await new PostgresMarketplaceRepository(database.em.fork()).createVerification(
      actor,
      'farmer',
      created.value.version,
      'verification-create-provider-resume-next',
    );
    expect(resumed).toMatchObject({
      status: 'ok',
      value: { caseRevision: 1, identityAssurance: 'none', oneIdLinked: false, providerMode: 'none', status: 'none' },
    });
    if (resumed.status !== 'ok') {
      throw new Error('The rejected case must resume.');
    }
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(actor, {
        ...oldOneId,
        requestDescriptor: { ...oldOneId.requestDescriptor, resourceRevision: resumed.value.caseRevision },
        resourceRevision: resumed.value.caseRevision,
        requestFingerprint: marketplaceProviderFingerprint({
          ...oldOneId.requestDescriptor,
          resourceRevision: resumed.value.caseRevision,
        }),
      }),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    const newDocumentDescriptor = { ...oldDocument.requestDescriptor, resourceRevision: resumed.value.caseRevision };
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(actor, {
        ...oldDocument,
        requestDescriptor: newDocumentDescriptor,
        resourceRevision: resumed.value.caseRevision,
        requestFingerprint: marketplaceProviderFingerprint(newDocumentDescriptor),
      }),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
  });

  it('serializes different OneID keys so only one can establish identity provenance', async () => {
    const database = requireOrm(orm);
    const actor = { tenantId: 'tenant-provider-different-keys', userId: 'verification-user' };
    const created = await new PostgresMarketplaceRepository(database.em.fork()).createVerification(
      actor,
      'buyer',
      0,
      'verification-create-provider-different',
    );
    if (created.status !== 'ok') {
      throw new Error('The verification fixture must be persisted.');
    }
    const repositoryA = new PostgresMarketplaceRepository(database.em.fork());
    const repositoryB = new PostgresMarketplaceRepository(database.em.fork());
    const makePreparation = (key: string) =>
      oneIdProviderPreparation(created.value.id, created.value.caseRevision, key);
    const prepared = await Promise.all([
      repositoryA.prepareProviderOperation(actor, makePreparation('oneid-key-a')),
      repositoryB.prepareProviderOperation(actor, makePreparation('oneid-key-b')),
    ]);
    const [preparedA, preparedB] = prepared;
    if (preparedA.status !== 'ok' || preparedB.status !== 'ok') {
      throw new Error('Different keys must create two independently traceable provider operations.');
    }
    const operationIds = [preparedA.value.operationId, preparedB.value.operationId];
    const subjectKey = createHash('sha256').update(`mock-oneid:${actor.userId}`).digest('hex');
    const linkedAt = new Date();
    const completions = await Promise.all([
      repositoryA.completeIdentityLink(actor, preparedA.value.operationId, preparedA.value.attempt, {
        identityAssurance: 'mock',
        linkedAt,
        providerMode: 'mock',
        providerName: 'mock-oneid',
        receiptId: 'receipt-a',
        subjectKey,
      }),
      repositoryB.completeIdentityLink(actor, preparedB.value.operationId, preparedB.value.attempt, {
        identityAssurance: 'mock',
        linkedAt,
        providerMode: 'mock',
        providerName: 'mock-oneid',
        receiptId: 'receipt-b',
        subjectKey,
      }),
    ]);

    expect(completions.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(completions.filter(({ status }) => status === 'conflict')).toHaveLength(1);
    const loserIndex = completions.findIndex(({ status }) => status === 'conflict');
    if (loserIndex < 0) {
      throw new Error('One competing provider operation must lose identity completion.');
    }
    await new PostgresMarketplaceRepository(database.em.fork()).failProviderOperation(
      actor,
      operationIds[loserIndex] ?? '',
      loserIndex === 0 ? preparedA.value.attempt : preparedB.value.attempt,
      'identity_provider_failed',
    );
    expect(
      await rows<{ providerReceiptId: string; providerSubjectKey: string }>(
        database.em,
        `select provider_receipt_id as "providerReceiptId", provider_subject_key as "providerSubjectKey"
           from marketplace_verifications
          where id = ? and tenant_id = ? and user_id = ?`,
        [created.value.id, actor.tenantId, actor.userId],
      ),
    ).toEqual([
      {
        providerReceiptId: completions[0].status === 'ok' ? 'receipt-a' : 'receipt-b',
        providerSubjectKey: subjectKey,
      },
    ]);
    expect(
      await rows<{ status: string }>(
        database.em,
        `select status
           from marketplace_provider_operations
          where id in (?, ?)
          order by status`,
        operationIds,
      ),
    ).toEqual([{ status: 'failed' }, { status: 'succeeded' }]);
  });

  it('persists checksum-bound evidence metadata immutably and restricts evidence history deletion', async () => {
    const database = requireOrm(orm);
    const actor = { tenantId: 'tenant-provider-evidence', userId: 'verification-user' };
    const repository = new PostgresMarketplaceRepository(database.em.fork());
    const created = await repository.createVerification(actor, 'farmer', 0, 'verification-create-provider-evidence');
    if (created.status !== 'ok') {
      throw new Error('The verification fixture must be persisted.');
    }
    const identityOperation = await repository.prepareProviderOperation(
      actor,
      oneIdProviderPreparation(created.value.id, created.value.caseRevision, 'oneid-evidence-key'),
    );
    if (identityOperation.status !== 'ok') {
      throw new Error('The identity operation must be prepared.');
    }
    const storedAt = new Date();
    const identityCompleted = await repository.completeIdentityLink(
      actor,
      identityOperation.value.operationId,
      identityOperation.value.attempt,
      {
        identityAssurance: 'mock',
        linkedAt: storedAt,
        providerMode: 'mock',
        providerName: 'mock-oneid',
        receiptId: 'identity-receipt',
        subjectKey: createHash('sha256').update(`mock-oneid:${actor.userId}`).digest('hex'),
      },
    );
    if (identityCompleted.status !== 'ok') {
      throw new Error(`The identity fixture must be linked: ${JSON.stringify(identityCompleted)}`);
    }
    const content = Uint8Array.from(Buffer.from('%PDF-immutable-evidence'));
    const sha256 = createHash('sha256').update(content).digest('hex');
    const documentOperation = await repository.prepareProviderOperation(
      actor,
      documentProviderPreparation(created.value.id, created.value.caseRevision, 'document-evidence-key', {
        fileName: 'farm.pdf',
        kind: 'farm',
        mimeType: 'application/pdf',
        sha256,
        sizeBytes: content.byteLength,
      }),
    );
    if (documentOperation.status !== 'ok') {
      throw new Error('The document operation must be prepared.');
    }
    const completed = await repository.completeVerificationDocuments(
      actor,
      documentOperation.value.operationId,
      documentOperation.value.attempt,
      {
        evidence: [
          {
            document: {
              fileName: 'farm.pdf',
              kind: 'farm',
              mimeType: 'application/pdf',
              optional: false,
              providerMode: 'mock',
              providerName: 'mock-document-storage',
              providerReceiptId: 'document-receipt',
              sha256,
              sizeBytes: content.byteLength,
              storedAt: storedAt.toISOString(),
            },
          },
        ],
        providerMode: 'mock',
        providerName: 'mock-document-storage',
        receiptId: 'document-receipt',
        storedAt,
      },
    );
    if (completed.status !== 'ok') {
      throw new Error(`The document evidence must be persisted: ${JSON.stringify(completed)}`);
    }
    expect(completed.value.documents[0]).not.toHaveProperty('storageKey');
    const evidenceId = completed.value.documents[0]?.evidenceId;
    if (!evidenceId) {
      throw new Error('The persisted document must contain a private evidence reference.');
    }

    expect(
      await rows<{ caseRevision: number; sha256: string; sizeBytes: number }>(
        database.em,
        `select case_revision as "caseRevision", sha256, size_bytes as "sizeBytes"
           from marketplace_verification_evidence
          where id = ? and tenant_id = ? and user_id = ?`,
        [evidenceId, actor.tenantId, actor.userId],
      ),
    ).toEqual([{ caseRevision: created.value.caseRevision, sha256, sizeBytes: content.byteLength }]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_verification_evidence
          where id = ? and tenant_id = 'foreign-tenant'`,
        [evidenceId],
      ),
    ).toEqual([{ count: 0 }]);

    const storeRevision = async (
      kind: VerificationDocument['kind'],
      key: string,
      fileName: string,
      bytes: Uint8Array,
    ) => {
      const checksum = createHash('sha256').update(bytes).digest('hex');
      const operation = await new PostgresMarketplaceRepository(database.em.fork()).prepareProviderOperation(
        actor,
        documentProviderPreparation(created.value.id, created.value.caseRevision, key, {
          fileName,
          kind,
          mimeType: 'application/pdf',
          sha256: checksum,
          sizeBytes: bytes.byteLength,
        }),
      );
      if (operation.status !== 'ok') {
        return operation;
      }
      const revisionStoredAt = new Date();
      return await new PostgresMarketplaceRepository(database.em.fork()).completeVerificationDocuments(
        actor,
        operation.value.operationId,
        operation.value.attempt,
        {
          evidence: [
            {
              document: {
                fileName,
                kind,
                mimeType: 'application/pdf',
                providerMode: 'mock',
                providerName: 'mock-document-storage',
                providerReceiptId: `mock-documents:${operation.value.operationId}`,
                sha256: checksum,
                sizeBytes: bytes.byteLength,
                storedAt: revisionStoredAt.toISOString(),
              },
            },
          ],
          providerMode: 'mock',
          providerName: 'mock-document-storage',
          receiptId: `mock-documents:${operation.value.operationId}`,
          storedAt: revisionStoredAt,
        },
      );
    };
    expect(
      await storeRevision('farm', 'document-evidence-key-2', 'farm-correction-2.pdf', Buffer.from('%PDF-v2')),
    ).toMatchObject({ status: 'ok', value: { documents: [{ evidenceRevision: 2, kind: 'farm' }] } });
    expect(
      await storeRevision('farm', 'document-evidence-key-3', 'farm-correction-3.pdf', Buffer.from('%PDF-v3')),
    ).toMatchObject({ status: 'ok', value: { documents: [{ evidenceRevision: 3, kind: 'farm' }] } });
    expect(
      await storeRevision('farm', 'document-evidence-key-4', 'farm-correction-4.pdf', Buffer.from('%PDF-v4')),
    ).toEqual({ status: 'conflict', field: 'evidenceQuota' });
    const landRevision = await storeRevision('land', 'document-land-key', 'land.pdf', Buffer.from('%PDF-land'));
    expect(landRevision).toMatchObject({ status: 'ok' });
    if (landRevision.status !== 'ok') {
      throw new Error('A different evidence kind must retain an independent revision budget.');
    }
    expect(landRevision.value.documents.find(({ kind }) => kind === 'land')).toMatchObject({
      evidenceRevision: 1,
      kind: 'land',
    });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_verification_evidence
          where verification_id = ? and case_revision = ? and kind = 'farm'`,
        [created.value.id, created.value.caseRevision],
      ),
    ).toEqual([{ count: 3 }]);
    const ready = await new PostgresMarketplaceRepository(database.em.fork()).getVerification(actor);
    if (!ready) {
      throw new Error('The evidence-complete verification must be reloadable.');
    }
    const submitCommands = ['verification-submit-cas-a', 'verification-submit-cas-b'] as const;
    const submitResults = await Promise.all(
      submitCommands.map((key) =>
        new PostgresMarketplaceRepository(database.em.fork()).submitVerification(actor, ready.version, key),
      ),
    );
    expect(submitResults.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(submitResults.filter(({ status }) => status === 'conflict')).toEqual([
      { status: 'conflict', field: 'expectedRevision' },
    ]);
    const submitWinnerIndex = submitResults.findIndex(({ status }) => status === 'ok');
    const submitted = submitResults[submitWinnerIndex];
    const winningSubmitKey = submitCommands[submitWinnerIndex];
    if (!submitted || submitted.status !== 'ok' || !winningSubmitKey) {
      throw new Error('Exactly one concurrent verification submission must succeed.');
    }
    const replayedSubmission = await new PostgresMarketplaceRepository(database.em.fork()).submitVerification(
      actor,
      ready.version,
      winningSubmitKey,
    );
    expect(JSON.parse(JSON.stringify(replayedSubmission))).toEqual(JSON.parse(JSON.stringify(submitted)));
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).submitVerification(
        actor,
        ready.version + 1,
        winningSubmitKey,
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_commerce_operations
          where operation = 'verification_submit' and actor_tenant_id = ? and actor_user_id = ?`,
        [actor.tenantId, actor.userId],
      ),
    ).toEqual([{ count: 1 }]);
    await expect(
      database.em
        .getConnection()
        .execute('update marketplace_verification_evidence set file_name = ? where id = ?', [
          'changed.pdf',
          evidenceId,
        ]),
    ).rejects.toThrow(/marketplace verification evidence is immutable/u);
    await expect(
      database.em.getConnection().execute('delete from marketplace_verification_evidence where id = ?', [evidenceId]),
    ).rejects.toThrow(/marketplace verification evidence is immutable/u);
    await expect(
      database.em.getConnection().execute('delete from marketplace_verifications where id = ?', [created.value.id]),
    ).rejects.toThrow(
      /marketplace provider operation resource anchor is immutable|fk__marketplace_verification_evidence__verification_actor|foreign key/u,
    );
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
    const buyerPartnerId = randomUUID();
    await insertPartner(database.em, { id: buyerPartnerId, kind: 'buyer', ownerUserId: buyer.userId, tenantId });
    await insertPartner(database.em, { id: sellerPartnerId, ownerUserId: seller.userId, tenantId });
    await insertVerification(database.em, { role: 'buyer', tenantId, userId: buyer.userId });
    await insertVerification(database.em, { role: 'seller', tenantId, userId: seller.userId });
    await insertProduct(database.em, { id: productId, supplierId: sellerPartnerId, tenantId });
    await insertCart(database.em, { buyerUserId: buyer.userId, cartId, productId, sellerPartnerId, tenantId });

    const checkout = await new PostgresMarketplaceRepository(database.em.fork()).checkoutCart(
      buyer,
      cartId,
      { deliveryTerms: 'seller_delivery' },
      'checkout-delivery-quote',
    );
    if (checkout.status !== 'ok') {
      throw new Error('The unquoted cart contract fixture must be persisted.');
    }
    const quoteRevision = (
      await rows<{ revision: number }>(
        database.em,
        'select version as revision from marketplace_contracts where id = ?',
        [checkout.value.contractId],
      )
    )[0]?.revision;
    if (quoteRevision === undefined) {
      throw new Error('The unquoted cart contract revision must be persisted.');
    }
    const quoteCommands = [
      {
        input: {
          deliveryDays: 2,
          deliveryNote: 'Farm gate',
          deliveryPriceUzs: 250_000,
          expectedRevision: quoteRevision,
        },
        key: 'delivery-quote-concurrent-a',
      },
      {
        input: {
          deliveryDays: 3,
          deliveryNote: 'Warehouse gate',
          deliveryPriceUzs: 300_000,
          expectedRevision: quoteRevision,
        },
        key: 'delivery-quote-concurrent-b',
      },
    ] as const;
    const quoteResults = await Promise.all(
      quoteCommands.map(({ input, key }) =>
        new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
          seller,
          checkout.value.contractId,
          input,
          key,
        ),
      ),
    );
    expect(quoteResults.filter(({ status }) => status === 'ok')).toHaveLength(1);
    expect(quoteResults.filter(({ status }) => status === 'conflict')).toEqual([
      { status: 'conflict', field: 'expectedRevision' },
    ]);
    const quoteWinnerIndex = quoteResults.findIndex(({ status }) => status === 'ok');
    const quoted = quoteResults[quoteWinnerIndex];
    const winningQuote = quoteCommands[quoteWinnerIndex];
    if (!quoted || quoted.status !== 'ok' || !winningQuote) {
      throw new Error('Exactly one concurrent delivery quote must succeed.');
    }
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
        seller,
        checkout.value.contractId,
        winningQuote.input,
        winningQuote.key,
      ),
    ).resolves.toEqual(quoted);
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
        seller,
        checkout.value.contractId,
        { ...winningQuote.input, deliveryPriceUzs: winningQuote.input.deliveryPriceUzs + 1 },
        winningQuote.key,
      ),
    ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
        seller,
        checkout.value.contractId,
        { deliveryPriceUzs: 350_000, expectedRevision: quoted.value.revision },
        'delivery-quote-after-close',
      ),
    ).resolves.toMatchObject({ status: 'invalid_state' });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_commerce_operations
          where operation = 'contract_delivery_quote' and resource_key = ?`,
        [checkout.value.contractId],
      ),
    ).toEqual([{ count: 1 }]);

    const request = await new PostgresMarketplaceRepository(database.em.fork()).createRequest(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        region: 'Samarkand',
        title: 'Immutable offer terms',
      },
      'request-delivery-quote',
    );
    if (request.status !== 'ok') {
      throw new Error('The quote request fixture must be persisted.');
    }
    const requestPublicId = await publishBuyerRequest(database.em, {
      buyerPartnerId,
      buyerUserId: buyer.userId,
      requestId: request.value.id,
      tenantId,
      title: request.value.title,
    });
    const offer = await new PostgresMarketplaceRepository(database.em.fork()).makeOffer(
      seller,
      requestPublicId,
      {
        actingPartnerId: sellerPartnerId,
        deliveryDays: 4,
        deliveryNote: 'Accepted seller delivery',
        deliveryPriceUzs: 800_000,
        deliveryTerms: 'seller_delivery',
        priceUzs: 4_000_000,
      },
      'offer-delivery-quote',
    );
    if (offer.status !== 'ok') {
      throw new Error('The quoted offer fixture must be persisted.');
    }
    const selection = await new PostgresMarketplaceRepository(database.em.fork()).chooseOffer(
      buyer,
      requestPublicId,
      offer.value.id,
      'choose-delivery-quote',
    );
    if (selection.status !== 'ok') {
      throw new Error('The selected offer contract fixture must be persisted.');
    }
    const selectedContractRevision = (
      await rows<{ revision: number }>(
        database.em,
        'select version as revision from marketplace_contracts where id = ?',
        [selection.value.contractId],
      )
    )[0]?.revision;
    if (selectedContractRevision === undefined) {
      throw new Error('The selected offer contract revision must be persisted.');
    }
    await expect(
      new PostgresMarketplaceRepository(database.em.fork()).updateContractDeliveryQuote(
        seller,
        selection.value.contractId,
        { deliveryPriceUzs: 900_000, expectedRevision: selectedContractRevision },
        'delivery-quote-offer-invalid',
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
      { deliveryPriceUzs: winningQuote.input.deliveryPriceUzs, id: checkout.value.contractId },
      { deliveryPriceUzs: 800_000, id: selection.value.contractId },
    ]);
  });
});

function requireOrm(orm: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!orm) {
    throw new Error('AgriTech marketplace PostgreSQL component database was not initialized.');
  }
  return orm;
}

const marketplaceEntities: PostgresEntityList = [
  AgriTechPartnerEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplaceListingPromotionEntitySchema,
  MarketplaceCommerceOperationEntitySchema,
  MarketplaceAiConsultationEntitySchema,
  MarketplaceAiConsultationOperationEntitySchema,
  MarketplaceAiStarterCartOperationEntitySchema,
  MarketplaceCommissionRatePolicyEntitySchema,
  MarketplaceContractArtifactEntitySchema,
  MarketplaceContractCommissionEntitySchema,
  MarketplaceContractDisputeEntitySchema,
  MarketplaceContractDisputeEvidenceEntitySchema,
  MarketplaceContractDisputeResolutionEvidenceEntitySchema,
  MarketplaceContractFulfillmentEntitySchema,
  MarketplaceContractLifecycleEventEntitySchema,
  MarketplaceContractNotificationIntentEntitySchema,
  MarketplaceContractReputationSignalEntitySchema,
  MarketplaceContractReviewEligibilityEntitySchema,
  MarketplaceContractSettlementEntitySchema,
  MarketplaceContractSignatureEntitySchema,
  MarketplaceEngagementEventEntitySchema,
  MarketplaceEngagementNotificationIntentEntitySchema,
  MarketplaceEngagementOperationEntitySchema,
  MarketplaceListingFavoriteEntitySchema,
  MarketplaceLegacyFavoriteArchiveEntitySchema,
  MarketplaceLegacyReviewArchiveEntitySchema,
  MarketplaceLegacySampleRequestArchiveEntitySchema,
  MarketplaceListingReviewEntitySchema,
  MarketplaceListingSampleEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceProduceOrganizationBindingEntitySchema,
  MarketplacePublicationModerationOperationEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceRequestOrganizationBindingEntitySchema,
  MarketplaceRequestPublicationEntitySchema,
  MarketplaceReviewAggregateEntitySchema,
  MarketplaceReviewReplyEntitySchema,
  MarketplaceReviewReportEntitySchema,
  MarketplaceSampleMonthlyUsageEntitySchema,
  MarketplaceSamplePolicyEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  RequestOfferEntitySchema,
  VerificationEntitySchema,
  VerificationEvidenceEntitySchema,
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
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', ?, true, 'legacy', 'legacy_unknown', '[]'::jsonb, now(), now())`,
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
  const buyerPartners = await rows<{ id: string }>(
    em,
    `select id
       from agritech_partners
      where tenant_id = ? and owner_user_id = ? and kind = 'buyer' and status = 'approved'
      order by created_at, id
      limit 1`,
    [input.tenantId, input.buyerUserId],
  );
  const sellerPartners = await rows<{ ownerUserId: string }>(
    em,
    `select owner_user_id as "ownerUserId"
       from agritech_partners
      where tenant_id = ? and id = ? and kind = 'supplier' and status = 'approved'`,
    [input.tenantId, input.sellerPartnerId],
  );
  const buyerPartnerId = buyerPartners[0]?.id;
  const sellerUserId = sellerPartners[0]?.ownerUserId;
  if (!buyerPartnerId || !sellerUserId) {
    throw new Error('Resolved cart fixtures require approved buyer and seller organizations.');
  }
  const listingPublicationId = await ensureApprovedProductPublication(em, {
    productId: input.productId,
    sellerPartnerId: input.sellerPartnerId,
    sellerUserId,
    tenantId: input.tenantId,
  });
  await em.getConnection().execute(
    `insert into marketplace_carts
      (id, tenant_id, user_id, seller_id, buyer_partner_id, seller_tenant_id, seller_user_id,
       seller_partner_id, binding_status, items, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'resolved',
       jsonb_build_array(jsonb_build_object(
         'listingPublicationId', ?, 'sourceKind', 'product', 'sourceId', ?, 'quantity', 6
       )), 'open', now(), now())`,
    [
      input.cartId,
      input.tenantId,
      input.buyerUserId,
      input.sellerPartnerId,
      buyerPartnerId,
      input.tenantId,
      sellerUserId,
      input.sellerPartnerId,
      listingPublicationId,
      input.productId,
    ],
  );
}

async function ensureApprovedProductPublication(
  em: EntityManager,
  input: { productId: string; sellerPartnerId: string; sellerUserId: string; tenantId: string },
): Promise<string> {
  const existing = await rows<{ id: string }>(
    em,
    'select id from marketplace_listing_publications where product_id = ?',
    [input.productId],
  );
  if (existing[0]) {
    return existing[0].id;
  }
  const sellerPublicId = randomUUID();
  const sellerRevisionId = randomUUID();
  const listingPublicationId = randomUUID();
  const sellerFingerprint = createHash('sha256').update(`seller:${input.sellerPartnerId}`).digest('hex');
  const listingFingerprint = createHash('sha256').update(`listing:${input.productId}`).digest('hex');
  await em.getConnection().execute(
    `insert into marketplace_public_sellers
      (id, tenant_id, partner_id, partner_kind, owner_user_id, content_revision, status, created_at, updated_at)
     values (?, ?, ?, 'supplier', ?, 1, 'published', now(), now())`,
    [sellerPublicId, input.tenantId, input.sellerPartnerId, input.sellerUserId],
  );
  await em.getConnection().execute(
    `insert into marketplace_public_seller_revisions
      (id, seller_public_id, tenant_id, content_revision, content_fingerprint, display_name, region,
       moderation_status, moderated_by, moderated_at, created_at, updated_at)
     values (?, ?, ?, 1, ?, 'Marketplace supplier', 'Samarkand', 'approved', 'fixture-reviewer', now(), now(), now())`,
    [sellerRevisionId, sellerPublicId, input.tenantId, sellerFingerprint],
  );
  await em.getConnection().execute(
    `insert into marketplace_listing_publications
      (id, tenant_id, owner_user_id, seller_public_id, seller_revision_id, seller_content_revision,
       product_id, source_kind, section, public_title, public_description, public_category, public_unit,
       public_region, public_images, content_fingerprint, content_revision, status, moderation_status,
       moderated_by, moderated_at, idempotency_key, request_fingerprint, revision, published_at,
       created_at, updated_at)
     values (?, ?, ?, ?, ?, 1, ?, 'product', 'seeds', 'Corn seed', 'Certified seed', 'seed', 'kg',
       'Samarkand', '[]'::jsonb, ?, 1, 'published', 'approved', 'fixture-reviewer', now(), ?, ?, 0,
       now(), now(), now())`,
    [
      listingPublicationId,
      input.tenantId,
      input.sellerUserId,
      sellerPublicId,
      sellerRevisionId,
      input.productId,
      listingFingerprint,
      `fixture-listing-${input.productId}`,
      listingFingerprint,
    ],
  );
  return listingPublicationId;
}

async function publishBuyerRequest(
  em: EntityManager,
  input: {
    buyerPartnerId: string;
    buyerUserId: string;
    requestId: string;
    tenantId: string;
    title: string;
  },
): Promise<string> {
  const publicId = randomUUID();
  const fingerprint = createHash('sha256').update(`request:${input.requestId}`).digest('hex');
  await em.getConnection().execute(
    `insert into marketplace_request_publications
      (id, tenant_id, buyer_user_id, buyer_partner_id, request_id, buyer_display_name, public_title,
       public_region, content_fingerprint, content_revision, status, moderation_status, moderated_by,
       moderated_at, idempotency_key, request_fingerprint, revision, published_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, 'Marketplace buyer', ?, 'Samarkand', ?, 1, 'published', 'approved',
       'fixture-reviewer', now(), ?, ?, 0, now(), now(), now())`,
    [
      publicId,
      input.tenantId,
      input.buyerUserId,
      input.buyerPartnerId,
      input.requestId,
      input.title,
      fingerprint,
      `fixture-request-${input.requestId}`,
      fingerprint,
    ],
  );
  return publicId;
}

async function rows<T>(em: EntityManager, sql: string, params: unknown[] = []): Promise<T[]> {
  const result: unknown = await em.getConnection().execute(sql, params);
  return result as T[];
}

function oneIdProviderPreparation(
  resourceId: string,
  resourceRevision: number,
  idempotencyKey: string,
): MarketplaceProviderOperationPreparation {
  const requestDescriptor = {
    action: 'link-oneid' as const,
    resourceId,
    resourceRevision,
    resourceType: 'verification' as const,
  };
  return {
    actorType: 'verification_subject',
    capability: 'oneid_link',
    idempotencyKey,
    providerMode: 'mock',
    providerName: 'mock-oneid',
    requestDescriptor,
    requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
    resourceId,
    resourceRevision,
    resourceType: 'verification',
  };
}

function documentProviderPreparation(
  resourceId: string,
  resourceRevision: number,
  idempotencyKey: string,
  document: Required<Pick<VerificationDocument, 'fileName' | 'kind' | 'mimeType' | 'sha256' | 'sizeBytes'>>,
): MarketplaceProviderOperationPreparation {
  const requestDescriptor = {
    action: 'store-verification-document' as const,
    document,
    resourceId,
    resourceRevision,
    resourceType: 'verification' as const,
  };
  return {
    actorType: 'verification_subject',
    capability: 'verification_documents',
    idempotencyKey,
    providerMode: 'mock',
    providerName: 'mock-document-storage',
    requestDescriptor,
    requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
    resourceId,
    resourceRevision,
    resourceType: 'verification',
  };
}
