// @requirements REQ-AGRITECH-LIFECYCLE-020
import { describe, expect, it } from 'vitest';
import { Migration20260810136000AddContractNotificationDelivery } from './Migration20260810136000AddContractNotificationDelivery';
import { Migration20260810137000AddMarketplaceDisputeEvidence } from './Migration20260810137000AddMarketplaceDisputeEvidence';
import { agritechMigrations } from './index';

function collect(run: (migration: Migration20260810137000AddMarketplaceDisputeEvidence) => void): string {
  const migration = new Migration20260810137000AddMarketplaceDisputeEvidence(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

describe('marketplace dispute evidence migration', () => {
  it('orders immutable evidence and derived reputation after notification delivery', () => {
    expect(agritechMigrations.indexOf(Migration20260810136000AddContractNotificationDelivery)).toBeLessThan(
      agritechMigrations.indexOf(Migration20260810137000AddMarketplaceDisputeEvidence),
    );
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('create table "marketplace_contract_dispute_evidence"');
    expect(sql).toContain('create table "marketplace_contract_dispute_resolution_evidence"');
    expect(sql).toContain('create table "marketplace_contract_reputation_signals"');
    expect(sql).toContain("'dispute_evidence_storage'");
    expect(sql).toContain("'store-dispute-evidence'");
    expect(sql).toContain('ck__contract_dispute_evidence__coherence');
    expect(sql).toContain('ck__contract_dispute_resolution_evidence__coherence');
    expect(sql).toContain('ck__contract_reputation_signals__coherence');
    expect(sql).not.toContain('bytea');
    expect(sql).not.toContain('raw_payload');
    expect(sql).not.toContain('cascade');
  });

  it('refuses lossy rollback and restores the pre-evidence provider/dispute contracts', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('cannot downgrade marketplace dispute evidence after evidence or resolution traffic');
    expect(sql).toContain('add column "evidence_reference"');
    expect(sql).toContain("('verification_documents')");
    expect(sql).not.toContain('cascade');
  });
});
