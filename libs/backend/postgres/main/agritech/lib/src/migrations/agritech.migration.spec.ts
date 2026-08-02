// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import { describe, expect, it } from 'vitest';
import { Migration20260802120000CreateAgriTechMarketplace } from './Migration20260802120000CreateAgriTechMarketplace';

function collect(run: (migration: Migration20260802120000CreateAgriTechMarketplace) => void): string {
  const migration = new Migration20260802120000CreateAgriTechMarketplace(undefined as never, undefined as never);
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
