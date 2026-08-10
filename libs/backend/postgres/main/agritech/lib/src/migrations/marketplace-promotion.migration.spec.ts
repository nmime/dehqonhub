// @requirements REQ-AGRITECH-STAGE2-017
import { describe, expect, it } from 'vitest';
import { Migration20260810131000AddMarketplacePromotions } from './Migration20260810131000AddMarketplacePromotions';

const collect = (run: (migration: Migration20260810131000AddMarketplacePromotions) => void): string => {
  const migration = new Migration20260810131000AddMarketplacePromotions(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
};

describe('marketplace promotion migration', () => {
  it('creates a bounded internal promotion activation lifecycle with exact organization coherence', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('create table "marketplace_listing_promotions"');
    expect(sql).toContain('uq__listing_promotions__actor_command_key');
    expect(sql).toContain('"actor_user_id" varchar(100) not null');
    expect(sql).not.toContain('"owner_user_id" varchar(100) not null');
    expect(sql).toContain('from "marketplace_partner_memberships" membership');
    expect(sql).toContain('uq__marketplace_listing_promotions__listing_publication_id');
    expect(sql).toContain('ck__listing_promotions__activation_reference');
    expect(sql).toContain('ck__listing_promotions__activation_time');
    expect(sql).toContain('ck__listing_promotions__status_transition');
    expect(sql).toContain('ck__listing_promotions__organization_coherence');
    expect(sql).toContain('guard_marketplace_listing_promotion');
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("interval '30 days'");
    expect(sql).not.toContain('promoted boolean');
    expect(sql).not.toContain('provider_mode');
    expect(sql).not.toContain('payment_pending');
  });

  it('removes only promotion-owned schema during a pre-traffic rollback', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('drop trigger if exists "tr__marketplace_listing_promotions__guard"');
    expect(sql).toContain('drop function if exists "guard_marketplace_listing_promotion"');
    expect(sql).toContain('drop table if exists "marketplace_listing_promotions";');
    expect(sql).not.toContain('cascade');
  });
});
