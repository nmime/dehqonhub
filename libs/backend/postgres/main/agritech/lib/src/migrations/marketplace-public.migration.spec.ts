// @requirements REQ-AGRITECH-PUBLIC-018
import { describe, expect, it } from 'vitest';
import { Migration20260810130000AddMarketplacePublications } from './Migration20260810130000AddMarketplacePublications';
import { Migration20260810130500AddMarketplaceCommerceParties } from './Migration20260810130500AddMarketplaceCommerceParties';
import { agritechMigrations } from './index';

const collect = (run: (migration: Migration20260810130000AddMarketplacePublications) => void): string => {
  const migration = new Migration20260810130000AddMarketplacePublications(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
};

describe('marketplace public publication migration', () => {
  it('adds an opt-in discriminated publication model without backfilling private rows', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('create table "marketplace_public_sellers"');
    expect(sql).toContain('create table "marketplace_public_seller_revisions"');
    expect(sql).toContain('create table "marketplace_listing_publications"');
    expect(sql).toContain('create table "marketplace_request_publications"');
    expect(sql).toContain('create table "marketplace_produce_organization_bindings"');
    expect(sql).toContain('create table "marketplace_request_organization_bindings"');
    expect(sql).toContain('"product_id" uuid null');
    expect(sql).toContain('"produce_listing_id" uuid null');
    expect(sql).toContain('"ck__marketplace_listing_publications__source_pair"');
    expect(sql).toContain('"section" <> \'produce\'');
    expect(sql).toContain('"section" = \'produce\'');
    expect(sql).toContain('"fk__marketplace_listing_publications__product_id"');
    expect(sql).toContain('"fk__marketplace_listing_publications__produce_listing_id"');
    expect(sql).toContain('"uq__marketplace_listing_publications__tenant_id_owner_65e6b9c7"');
    expect(sql).toContain('"uq__marketplace_request_publications__tenant_id_buyer_84329ad6"');
    expect(sql).not.toContain('"promoted" boolean');
    expect(sql).toContain('"assert_marketplace_listing_publication_coherence"');
    expect(sql).toContain('"assert_marketplace_request_publication_coherence"');
    expect(sql).toContain('"enforce_marketplace_source_org_binding_immutability"');
    expect(sql).toContain('"enforce_marketplace_public_seller_revision_immutability"');
    expect(sql).toContain('"assert_marketplace_partner_parent_coherence"');
    expect(sql).toContain('"ck__produce_listings__price_per_kg_uzs_integer"');
    expect(sql).not.toMatch(/insert\s+into|update\s+"?(?:products|produce_listings|marketplace_requests)"?/iu);
    expect(agritechMigrations.indexOf(Migration20260810130000AddMarketplacePublications)).toBeLessThan(
      agritechMigrations.indexOf(Migration20260810130500AddMarketplaceCommerceParties),
    );
  });

  it('drops dependent publication tables before public seller profiles', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql.indexOf('"marketplace_request_publications"')).toBeLessThan(
      sql.indexOf('"marketplace_listing_publications"'),
    );
    expect(sql.indexOf('"marketplace_listing_publications"')).toBeLessThan(sql.indexOf('"marketplace_public_sellers"'));
    expect(sql).toContain('drop function "enforce_marketplace_source_org_binding_immutability"()');
    expect(sql).toContain('drop function "enforce_marketplace_public_seller_revision_immutability"()');
    expect(sql).toContain(
      'alter table "produce_listings" drop constraint "ck__produce_listings__price_per_kg_uzs_integer"',
    );
  });
});
