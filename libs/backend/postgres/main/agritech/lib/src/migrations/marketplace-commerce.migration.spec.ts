// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { Migration20260810130500AddMarketplaceCommerceParties } from './Migration20260810130500AddMarketplaceCommerceParties';
import { agritechMigrations } from './index';

function collect(run: (migration: Migration20260810130500AddMarketplaceCommerceParties) => void): string {
  const migration = new Migration20260810130500AddMarketplaceCommerceParties(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

describe('marketplace cross-organization commerce migration', () => {
  it('runs after public publications and before promotions and provider operations', () => {
    const migrationNames = agritechMigrations.map((migration) => migration.name);
    expect(migrationNames.indexOf('Migration20260810130000AddMarketplacePublications')).toBeLessThan(
      migrationNames.indexOf(Migration20260810130500AddMarketplaceCommerceParties.name),
    );
    expect(migrationNames.indexOf(Migration20260810130500AddMarketplaceCommerceParties.name)).toBeLessThan(
      migrationNames.indexOf('Migration20260810131000AddMarketplacePromotions'),
    );
    expect(migrationNames.indexOf('Migration20260810131000AddMarketplacePromotions')).toBeLessThan(
      migrationNames.indexOf('Migration20260810133000GeneralizeMarketplaceProviderOperations'),
    );
  });

  it('persists immutable tenant-scoped partner membership and replay receipts', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('create table "marketplace_partner_memberships"');
    expect(sql).toContain('unique ("partner_id", "user_id", "capability")');
    expect(sql).toContain("\"capability\" in ('buyer', 'seller')");
    expect(sql).toContain("\"status\" in ('active', 'revoked')");
    expect(sql).toContain('revoked marketplace membership is terminal');
    expect(sql).toContain('create table "marketplace_commerce_operations"');
    expect(sql).toContain('"request_fingerprint" ~ \'^[0-9a-f]{64}$\'');
    expect(sql).toContain('marketplace commerce operation is immutable');
  });

  it('quarantines legacy authority and binds every resolved record to exact buyer and seller parties', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('set "status" = \'abandoned\' where "status" = \'open\'');
    expect(sql).toContain('"binding_status" varchar(20) not null default \'review_required\'');
    expect(sql).toContain('"status" = \'legacy_review_required\'');
    expect(sql).toContain('"buyer_partner_id" uuid null');
    expect(sql).toContain('"seller_tenant_id" varchar(100) null');
    expect(sql).toContain('"seller_partner_id" uuid null');
    expect(sql).toContain('membership."status" = \'active\'');
    expect(sql).toContain('partner."status" = \'approved\'');
    expect(sql).toContain('verification."status" = \'verified\'');
  });

  it('requires opaque approved request publications and freezes contract line and party authority', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('foreign key ("request_public_id") references "marketplace_request_publications"');
    expect(sql).toContain('publication."moderation_status" = \'approved\'');
    expect(sql).toContain('publication."status" = \'published\'');
    expect(sql).toContain('create function "marketplace_contract_snapshot_is_valid"');
    expect(sql).toContain('create function "marketplace_contract_lines_are_frozen"');
    expect(sql).toContain('resolved marketplace contract authority is frozen');
    expect(sql).toContain('"uq__marketplace_contracts__source_type_source_id"');
  });

  it('drops dependent triggers and constraints before membership storage', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql.indexOf('drop trigger "ct__marketplace_requests__party_coherence"')).toBeLessThan(
      sql.indexOf('drop table "marketplace_partner_memberships"'),
    );
    expect(sql.indexOf('drop trigger "tr__marketplace_contracts__frozen_authority"')).toBeLessThan(
      sql.indexOf('drop function "marketplace_contract_lines_are_frozen"'),
    );
    expect(sql.indexOf('drop table "marketplace_commerce_operations"')).toBeLessThan(
      sql.indexOf('drop table "marketplace_partner_memberships"'),
    );
  });
});
