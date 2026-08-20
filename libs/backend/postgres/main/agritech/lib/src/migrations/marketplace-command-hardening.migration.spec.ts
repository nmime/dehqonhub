// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { Migration20260810139000HardenMarketplaceCommands } from './Migration20260810139000HardenMarketplaceCommands';
import { agritechMigrations } from './index';

const sqlFrom = (direction: 'down' | 'up'): string => {
  const migration = new Migration20260810139000HardenMarketplaceCommands(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  migration[direction]();
  return statements.join('\n');
};

describe('marketplace command hardening migration', () => {
  it('runs after every schema it hardens and adds a contract revision plus the four persisted command kinds', () => {
    const migrationNames = agritechMigrations.map((migration) => migration.name);
    expect(migrationNames.indexOf('Migration20260810138000AddMarketplaceEngagement')).toBeLessThan(
      migrationNames.indexOf(Migration20260810139000HardenMarketplaceCommands.name),
    );
    expect(migrationNames.indexOf(Migration20260810139000HardenMarketplaceCommands.name)).toBeLessThan(
      migrationNames.indexOf('Migration20260810140000AlignMarketplaceSellerPartyRole'),
    );
    const sql = sqlFrom('up');
    expect(sql).toContain('add column "version" int not null default 0');
    expect(sql).toContain("'verification_create'");
    expect(sql).toContain("'verification_submit'");
    expect(sql).toContain("'verification_review'");
    expect(sql).toContain("'contract_delivery_quote'");
  });

  it('restores the prior allowlist and removes the additive revision column on rollback', () => {
    const sql = sqlFrom('down');
    expect(sql).toContain('cannot remove marketplace command hardening after hardened command traffic has begun');
    expect(sql).toContain("'offer_choose'");
    expect(sql).toContain('drop column "version"');
  });
});
