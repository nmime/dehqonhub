// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { Migration20260810140000AlignMarketplaceSellerPartyRole } from './Migration20260810140000AlignMarketplaceSellerPartyRole';
import { agritechMigrations } from './index';

function collect(run: (migration: Migration20260810140000AlignMarketplaceSellerPartyRole) => void): string {
  const migration = new Migration20260810140000AlignMarketplaceSellerPartyRole(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

describe('marketplace seller party role migration', () => {
  it('runs after the trigger it replaces was created and before the buying-side alignment', () => {
    const migrationNames = agritechMigrations.map((migration) => migration.name);
    expect(migrationNames.indexOf('Migration20260810130500AddMarketplaceCommerceParties')).toBeLessThan(
      migrationNames.indexOf(Migration20260810140000AlignMarketplaceSellerPartyRole.name),
    );
    // The buying-side alignment replaces the same function afterwards, so it
    // must stay downstream of this one for the final definition to carry both
    // widened predicates.
    expect(migrationNames.indexOf(Migration20260810140000AlignMarketplaceSellerPartyRole.name)).toBeLessThan(
      migrationNames.indexOf('Migration20260811110000AlignMarketplaceBuyerPartyRole'),
    );
  });

  it('accepts the same two selling verification roles the domain policy authorizes', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('create or replace function "assert_marketplace_resolved_commerce_parties"()');
    expect(sql).toContain("verification.\"role\" in ('seller', 'farmer')");
    expect(sql).not.toContain('verification."role" = \'seller\'');
  });

  it('keeps every other party requirement, including the buying side as it stood, untouched', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('verification."role" = \'buyer\'');
    expect(sql).toContain('membership."capability" = \'seller\'');
    expect(sql).toContain('membership."status" = \'active\'');
    expect(sql).toContain('partner."status" = \'approved\'');
    expect(sql).toContain('partner."kind" = \'supplier\'');
    expect(sql).toContain('verification."status" = \'verified\'');
    expect(sql).toContain("errcode = '23514', constraint = 'ck__marketplace_commerce__party_coherence'");
  });

  it('restores the seller-only predicate on rollback without dropping the trigger', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('create or replace function "assert_marketplace_resolved_commerce_parties"()');
    expect(sql).toContain('verification."role" = \'seller\'');
    expect(sql).not.toContain('drop trigger');
    expect(sql).not.toContain('drop function');
  });
});
