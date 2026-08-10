// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003 REQ-AGRITECH-PAYMENT-004 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-ADVISORY-009 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-I18N-012
import { describe, expect, it } from 'vitest';
import { Migration20260802120000CreateAgriTechMarketplace } from './Migration20260802120000CreateAgriTechMarketplace';
import { Migration20260802160000CompleteAgriTechPlatform } from './Migration20260802160000CompleteAgriTechPlatform';
import { Migration20260809000000CreateMarketplace } from './Migration20260809000000CreateMarketplace';
import { Migration20260809120000SecureMarketplaceContracts } from './Migration20260809120000SecureMarketplaceContracts';
import { Migration20260810123000AddUzbekCyrillicProductNames } from './Migration20260810123000AddUzbekCyrillicProductNames';
import { Migration20260810124500AddMarketplaceVerificationProviders } from './Migration20260810124500AddMarketplaceVerificationProviders';
import { agritechMigrations } from './index';

function collect(run: (migration: Migration20260802120000CreateAgriTechMarketplace) => void): string {
  const migration = new Migration20260802120000CreateAgriTechMarketplace(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

function collectComplete(run: (migration: Migration20260802160000CompleteAgriTechPlatform) => void): string {
  const migration = new Migration20260802160000CompleteAgriTechPlatform(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

function collectMarketplace(run: (migration: Migration20260809000000CreateMarketplace) => void): string {
  const migration = new Migration20260809000000CreateMarketplace(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

function collectSecureContracts(run: (migration: Migration20260809120000SecureMarketplaceContracts) => void): string {
  const migration = new Migration20260809120000SecureMarketplaceContracts(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

function collectUzbekCyrillicNames(
  run: (migration: Migration20260810123000AddUzbekCyrillicProductNames) => void,
): string {
  const migration = new Migration20260810123000AddUzbekCyrillicProductNames(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

function collectVerificationProviders(
  run: (migration: Migration20260810124500AddMarketplaceVerificationProviders) => void,
): string {
  const migration = new Migration20260810124500AddMarketplaceVerificationProviders(
    undefined as never,
    undefined as never,
  );
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

describe('AgriTech marketplace migration', () => {
  it('binds farmers and orders to tenant/user ownership and protects stock constraints', () => {
    const sql = collect((migration) => {
      migration.up();
    });
    expect(sql).toContain('"ux__farmers__tenant_user"');
    expect(sql).toContain('"tenant_id" varchar(100) not null');
    expect(sql).toContain('"stock_quantity" >= 0');
    expect(sql).toContain('foreign key ("farmer_id")');
  });

  it('rolls back in reverse dependency order', () => {
    const sql = collect((migration) => {
      migration.down();
    });
    expect(sql.indexOf('"orders"')).toBeLessThan(sql.indexOf('"products"'));
    expect(sql.indexOf('"products"')).toBeLessThan(sql.indexOf('"farmers"'));
  });
});

describe('complete AgriTech platform migration', () => {
  it('creates governed partner, output, fulfillment, payment, pilot, and integration stores', () => {
    const sql = collectComplete((migration) => {
      migration.up();
    });

    for (const table of [
      'agritech_partners',
      'produce_listings',
      'agritech_deliveries',
      'agritech_field_visits',
      'agritech_advisories',
      'agritech_payment_transactions',
      'agritech_pilot_cohorts',
      'agritech_integration_state',
    ]) {
      expect(sql).toContain(`create table "${table}"`);
    }
    expect(sql).toContain('"available_quantity_kg" >= 0');
    expect(sql).toContain('"ux__agritech_payment_transactions__tenant_provider_key"');
    expect(sql).toContain('"ck__agritech_deliveries__status"');
    expect(sql).toContain('"ck__agritech_advisories__window"');
    expect(sql).toContain('"ux__agritech_integration_state__tenant_provider"');
  });

  it('removes dependent operational tables before partner and listing stores', () => {
    const sql = collectComplete((migration) => {
      migration.down();
    });

    expect(sql.indexOf('"agritech_payment_transactions"')).toBeLessThan(sql.indexOf('"produce_listings"'));
    expect(sql.indexOf('"agritech_deliveries"')).toBeLessThan(sql.indexOf('"produce_listings"'));
    expect(sql.indexOf('"produce_listings"')).toBeLessThan(sql.indexOf('"agritech_partners"'));
  });

  it('creates all marketplace tables with ownership and state constraints', () => {
    const sql = collectMarketplace((migration) => {
      migration.up();
    });

    for (const table of [
      'marketplace_verifications',
      'marketplace_carts',
      'marketplace_sample_requests',
      'marketplace_favorites',
      'marketplace_reviews',
      'marketplace_requests',
      'marketplace_request_offers',
      'marketplace_contracts',
      'marketplace_ai_consultations',
    ]) {
      expect(sql).toContain(`create table "${table}"`);
    }
    expect(sql).toContain('"ux__marketplace_verifications__tenant_user"');
    expect(sql).toContain('"ux__marketplace_favorites__tenant_user_product"');
    expect(sql).toContain('"ck__marketplace_reviews__rating"');
    expect(sql).toContain('"ck__marketplace_requests__status"');
    expect(sql).toContain('"ck__marketplace_contracts__status"');
    expect(sql).toContain('"ck__marketplace_contracts__delivery_terms"');
    expect(sql).toContain('"ix__marketplace_request_offers__tenant_id_request_id"');
    expect(sql).toContain('"ix__marketplace_ai_consultations__tenant_id_user_id"');
  });

  it('drops marketplace tables in reverse dependency order', () => {
    const sql = collectMarketplace((migration) => {
      migration.down();
    });

    expect(sql.indexOf('"marketplace_contracts"')).toBeLessThan(sql.indexOf('"marketplace_requests"'));
    expect(sql.indexOf('"marketplace_request_offers"')).toBeLessThan(sql.indexOf('"marketplace_requests"'));
    expect(sql.indexOf('"marketplace_carts"')).toBeLessThan(sql.indexOf('"marketplace_verifications"'));
  });
});

describe('secure marketplace contract migration', () => {
  it('quarantines unverifiable legacy consent and normalizes unsafe marketplace data', () => {
    const sql = collectSecureContracts((migration) => {
      migration.up();
    });

    expect(sql).toContain('"source_type" varchar(30) null');
    expect(sql).toContain('"lines" jsonb not null default');
    expect(sql).toContain('"buyer_signed_at" timestamptz null');
    expect(sql).toContain('"seller_signed_at" timestamptz null');
    expect(sql).toContain('"legacy_status" varchar(20) null');
    expect(sql).toContain('"legacy_factoring_enabled" boolean null');
    expect(sql).toContain('"delivery_terms" varchar(30) not null default \'by_agreement\'');
    expect(sql).toContain('"delivery_price_uzs" numeric(15,2) null');
    expect(sql).toContain(
      'alter index if exists "ix__marketplace_offers__tenant_request" rename to "ix__marketplace_request_offers__tenant_id_request_id"',
    );
    expect(sql).toContain('alter column "status" type varchar(30)');
    expect(sql).toContain('set "legacy_status" = "status"');
    expect(sql).toContain("where \"status\" in ('draft', 'signed', 'active')");
    expect(sql).toContain('"status" = \'legacy_review_required\'');
    expect(sql).toContain('set "factoring_enabled" = false');
    expect(sql).toContain('jsonb_array_elements_text');
    expect(sql).toContain('"product"."tenant_id" = "consultation"."tenant_id"');
    expect(sql).toContain('"consultation"."kind" <> \'season_advice\'');
    expect(sql).toContain("then 'catalog_match'");
    expect(sql).toContain('set "rejection_reason" = case');
    expect(sql).toContain("when \"status\" = 'rejected' then 'criteria_not_met'");
    expect(sql).toContain('delete from "marketplace_reviews" as "duplicate"');
    expect(sql).toContain('using "marketplace_reviews" as "canonical"');
    expect(sql).toContain('"uq__marketplace_contracts__tenant_id_source_type_source_id"');
    expect(sql).toContain('"ck__marketplace_contracts__source_pair"');
    expect(sql).toContain('"ck__marketplace_contracts__factoring_disabled"');
    expect(sql).toContain('"ck__marketplace_contracts__party_consent"');
    expect(sql).toContain('"ck__marketplace_contracts__delivery_price"');
    expect(sql).toContain('"ck__marketplace_offers__delivery_price"');
    expect(sql).toContain('"ck__marketplace_ai__answer"');
    expect(sql).toContain('"ck__marketplace_ai__product_ids_array"');
    expect(sql).toContain('"ck__marketplace_verifications__rejection_reason"');
    expect(sql).toContain("'documents_unreadable'");
    expect(sql).toContain("'identity_mismatch'");
    expect(sql).toContain('"uq__marketplace_reviews__tenant_id_product_id_user_id"');
  });

  it('removes constraints before the compatibility columns', () => {
    const sql = collectSecureContracts((migration) => {
      migration.down();
    });

    expect(sql.indexOf('drop constraint')).toBeLessThan(sql.indexOf('drop column'));
    expect(sql).toContain('set "status" = "legacy_status"');
    expect(sql).toContain('"signed_at" = "legacy_signed_at"');
    expect(sql).toContain('"factoring_enabled" = coalesce("legacy_factoring_enabled", false)');
    expect(sql).toContain('drop constraint if exists "ck__marketplace_ai__answer"');
    expect(sql).toContain('drop constraint if exists "uq__marketplace_reviews__tenant_id_product_id_user_id"');
    expect(sql).toContain('drop constraint if exists "ck__marketplace_verifications__rejection_reason"');
    expect(sql).toContain('alter column "status" type varchar(20)');
    expect(sql).toContain('add constraint "ck__marketplace_contracts__status"');
    expect(sql).toContain('drop column if exists "legacy_status"');
    expect(sql).toContain('drop column if exists "buyer_signed_at"');
    expect(sql).toContain('drop column if exists "source_type"');
    expect(sql).toContain('drop column if exists "delivery_price_uzs"');
    expect(sql).toContain(
      'alter index if exists "ix__marketplace_request_offers__tenant_id_request_id" rename to "ix__marketplace_offers__tenant_request"',
    );
  });
});

describe('Uzbek Cyrillic product-name migration', () => {
  it('adds and removes the independent Cyrillic authored-name column after marketplace hardening', () => {
    const upSql = collectUzbekCyrillicNames((migration) => {
      migration.up();
    });
    const downSql = collectUzbekCyrillicNames((migration) => {
      migration.down();
    });

    expect(upSql).toContain('add column if not exists "name_uz_cyrl" varchar(200) not null default');
    expect(upSql).toContain('alter column "name_uz_cyrl" drop not null');
    expect(upSql).toContain('set "name_uz_cyrl" = null');
    expect(downSql).toContain('drop column if exists "name_uz_cyrl"');
    expect(agritechMigrations).toContain(Migration20260810123000AddUzbekCyrillicProductNames);
  });
});

describe('marketplace verification-provider migration', () => {
  it('adds provider provenance, fenced idempotency receipts, and immutable safe evidence metadata', () => {
    const sql = collectVerificationProviders((migration) => {
      migration.up();
    });

    expect(sql).toContain('"provider_mode" varchar(20) not null default \'none\'');
    expect(sql).toContain('"uq__marketplace_verifications__tenant_id_provider_mode_8abb5356"');
    expect(sql).toContain('create table "marketplace_provider_operations"');
    expect(sql).toContain('"request_descriptor" jsonb not null');
    expect(sql).toContain('"lease_expires_at" timestamptz null');
    expect(sql).toContain('"attempt" int not null default 1');
    expect(sql).toContain('"fk__marketplace_provider_operations__verification_actor"');
    expect(sql).toContain('"result_snapshot" jsonb null');
    expect(sql).toContain('create table "marketplace_verification_evidence"');
    expect(sql).toContain('"document_revision" int not null');
    expect(sql).toContain('"uq__marketplace_verification_evidence__case_kind_revision"');
    expect(sql).toContain('"sha256" varchar(64) not null');
    expect(sql).not.toContain('"content" bytea');
    expect(sql).toContain('"trg__marketplace_verification_evidence__immutable"');
    expect(agritechMigrations).toContain(Migration20260810124500AddMarketplaceVerificationProviders);
  });

  it('drops immutable evidence before verification provenance columns', () => {
    const sql = collectVerificationProviders((migration) => {
      migration.down();
    });

    expect(sql.indexOf('drop table if exists "marketplace_verification_evidence"')).toBeLessThan(
      sql.indexOf('drop column if exists "provider_mode"'),
    );
    expect(sql).toContain('drop function if exists "prevent_marketplace_verification_evidence_mutation"');
  });
});
