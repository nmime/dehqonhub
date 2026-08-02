// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003 REQ-AGRITECH-PAYMENT-004 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-ADVISORY-009 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-INTEGRATION-013
import { describe, expect, it } from 'vitest';
import { Migration20260802120000CreateAgriTechMarketplace } from './Migration20260802120000CreateAgriTechMarketplace';
import { Migration20260802160000CompleteAgriTechPlatform } from './Migration20260802160000CompleteAgriTechPlatform';

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
});
