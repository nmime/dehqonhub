// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { Migration20260811110000AlignMarketplaceBuyerPartyRole } from './Migration20260811110000AlignMarketplaceBuyerPartyRole';
import { agritechMigrations } from './index';

function collect(run: (migration: Migration20260811110000AlignMarketplaceBuyerPartyRole) => void): string[] {
  const migration = new Migration20260811110000AlignMarketplaceBuyerPartyRole(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements;
}

const replacedFunctions = [
  'assert_marketplace_resolved_commerce_parties',
  'assert_marketplace_resolved_request_party',
  'assert_marketplace_listing_sample_coherence',
  'assert_marketplace_listing_review_coherence',
] as const;

describe('marketplace buyer party role migration', () => {
  it('runs last, after every buying-side trigger it replaces was created', () => {
    const migrationNames = agritechMigrations.map((migration) => migration.name);
    for (const earlier of [
      'Migration20260810130500AddMarketplaceCommerceParties',
      'Migration20260810138000AddMarketplaceEngagement',
      'Migration20260810140000AlignMarketplaceSellerPartyRole',
    ]) {
      expect(migrationNames.indexOf(earlier)).toBeGreaterThanOrEqual(0);
      expect(migrationNames.indexOf(earlier)).toBeLessThan(
        migrationNames.indexOf(Migration20260811110000AlignMarketplaceBuyerPartyRole.name),
      );
    }
    // Later migrations are allowed, but none of them may redefine a buying-side
    // coherence function this one owns, which is what `runs last` protected.
    const laterStatements = agritechMigrations
      .slice(migrationNames.indexOf(Migration20260811110000AlignMarketplaceBuyerPartyRole.name) + 1)
      .flatMap((Later) => {
        const migration = new Later(undefined as never, undefined as never);
        const statements: string[] = [];
        migration.addSql = (sql: string) => statements.push(sql);
        migration.up();
        return statements;
      })
      .join('\n');
    for (const replaced of replacedFunctions) {
      expect(laterStatements).not.toContain(replaced);
    }
  });

  it('replaces every buying-side coherence function without dropping a trigger', () => {
    const statements = collect((migration) => {
      migration.up();
    });

    expect(statements).toHaveLength(replacedFunctions.length);
    for (const [index, name] of replacedFunctions.entries()) {
      expect(statements[index]).toContain(`create or replace function "${name}"()`);
    }
    const sql = statements.join('\n');
    expect(sql).not.toContain('drop trigger');
    expect(sql).not.toContain('drop function');
    expect(sql).not.toContain('create trigger');
  });

  it('accepts the same two buying verification roles the domain policy authorizes', () => {
    const sql = collect((migration) => {
      migration.up();
    }).join('\n');

    expect(sql.split(`verification."role" in ('buyer', 'farmer')`)).toHaveLength(replacedFunctions.length + 1);
    expect(sql).not.toContain(`verification."role" = 'buyer'`);
  });

  it('keeps the widened selling side and every other party requirement untouched', () => {
    const sql = collect((migration) => {
      migration.up();
    }).join('\n');

    expect(sql).toContain(`verification."role" in ('seller', 'farmer')`);
    expect(sql).not.toContain(`verification."role" = 'seller'`);
    expect(sql).toContain(`membership."capability" = 'buyer'`);
    expect(sql).toContain(`membership."capability" = 'seller'`);
    expect(sql).toContain(`membership."status" = 'active'`);
    expect(sql).toContain(`partner."status" = 'approved'`);
    expect(sql).toContain(`partner."kind" = 'buyer'`);
    expect(sql).toContain(`partner."kind" = 'supplier'`);
    expect(sql).toContain(`verification."status" = 'verified'`);
    expect(sql).toContain(`errcode = '23514', constraint = 'ck__marketplace_commerce__party_coherence'`);
    expect(sql).toContain(`errcode = '23514', constraint = 'ck__marketplace_requests__party_coherence'`);
    expect(sql).toContain(`errcode = '23514', constraint = 'ck__marketplace_listing_samples__coherence'`);
    expect(sql).toContain(`errcode = '23514', constraint = 'ck__marketplace_listing_reviews__coherence'`);
  });

  it('restores the buyer-only predicate on rollback, one function at a time', () => {
    const statements = collect((migration) => {
      migration.down();
    });

    expect(statements).toHaveLength(replacedFunctions.length);
    for (const [index, name] of replacedFunctions.entries()) {
      expect(statements[index]).toContain(`create or replace function "${name}"()`);
    }
    const sql = statements.join('\n');
    expect(sql.split(`verification."role" = 'buyer'`)).toHaveLength(replacedFunctions.length + 1);
    expect(sql).not.toContain(`verification."role" in ('buyer', 'farmer')`);
    // Rollback restores the buying side only. The selling side belongs to
    // Migration20260810140000AlignMarketplaceSellerPartyRole and must survive.
    expect(sql).toContain(`verification."role" in ('seller', 'farmer')`);
    expect(sql).not.toContain('drop trigger');
    expect(sql).not.toContain('drop function');
  });

  it('emits the same statement text for up and down apart from the buying predicate', () => {
    const up = collect((migration) => {
      migration.up();
    });
    const down = collect((migration) => {
      migration.down();
    });

    for (const [index] of replacedFunctions.entries()) {
      expect(up[index]?.replace(`verification."role" in ('buyer', 'farmer')`, `verification."role" = 'buyer'`)).toBe(
        down[index],
      );
    }
  });
});
