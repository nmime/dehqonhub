// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { describe, expect, it } from 'vitest';
import { Migration20260812130000RequireMarketplacePromotionBilling } from './Migration20260812130000RequireMarketplacePromotionBilling';
import { agritechMigrations } from './index';

const collect = (run: (migration: Migration20260812130000RequireMarketplacePromotionBilling) => void): string => {
  const migration = new Migration20260812130000RequireMarketplacePromotionBilling(
    undefined as never,
    undefined as never,
  );
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
};

describe('marketplace promotion billing migration', () => {
  it('runs after the promotion table and the generalized provider operation ledger it references', () => {
    const names = agritechMigrations.map((migration) => migration.name);

    for (const earlier of [
      'Migration20260810131000AddMarketplacePromotions',
      'Migration20260810133000GeneralizeMarketplaceProviderOperations',
    ]) {
      expect(names.indexOf(earlier)).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(earlier)).toBeLessThan(
        names.indexOf(Migration20260812130000RequireMarketplacePromotionBilling.name),
      );
    }
  });

  it('makes a promoted placement impossible without a succeeded promotion_billing charge', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('add column "billing_operation_id" uuid null');
    expect(sql).toContain('fk__listing_promotions__billing_operation_id');
    expect(sql).toContain('uq__listing_promotions__billing_operation_id');
    expect(sql).toContain("check (\"status\" in ('pending_billing', 'scheduled', 'active', 'expired'))");
    expect(sql).toContain('ck__listing_promotions__billing');
    expect(sql).toContain(`where "status" in ('pending_billing', 'scheduled', 'active')`);
    expect(sql).toContain('uq__marketplace_provider_operations__resource_type_res_5a3eb243');
    expect(sql).toContain(`"capability" = 'promotion_billing'`);
    expect(sql).toContain(`charge."status" = 'succeeded'`);
    expect(sql).toContain('create or replace function "guard_marketplace_listing_promotion"');
    // The reservation itself must never carry a charge reference.
    expect(sql).toContain('new."billing_operation_id" is not null');
    expect(sql).not.toContain('payment');
    expect(sql).not.toContain('drop table');
  });

  it('refuses to roll back while a reservation is still unsettled', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('cannot downgrade marketplace promotion billing while a reservation is unsettled');
    expect(sql).toContain('drop index "uq__marketplace_provider_operations__resource_type_res_5a3eb243"');
    expect(sql).toContain('drop column "billing_operation_id"');
    expect(sql).toContain("check (\"status\" in ('scheduled', 'active', 'expired'))");
    expect(sql).not.toContain('cascade');
  });
});
