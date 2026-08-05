// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { describe, expect, it } from 'vitest';
import { Migration20260810133000GeneralizeMarketplaceProviderOperations } from './Migration20260810133000GeneralizeMarketplaceProviderOperations';

function collect(run: (migration: Migration20260810133000GeneralizeMarketplaceProviderOperations) => void): string {
  const migration = new Migration20260810133000GeneralizeMarketplaceProviderOperations(
    undefined as never,
    undefined as never,
  );
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

describe('marketplace provider-operation migration', () => {
  it('generalizes the fenced ledger with exact capability and actor/resource scopes', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain("'contract_artifact_storage'");
    expect(sql).toContain("'qualified_signature'");
    expect(sql).toContain("'promotion_billing'");
    expect(sql).toContain("'direct_payment'");
    expect(sql).toContain("'factoring'");
    expect(sql).toContain('"actor_type" varchar(30)');
    expect(sql).toContain('"resource_type" = \'contract\'');
    expect(sql).toContain("\"actor_type\" in ('contract_buyer', 'contract_seller')");
    expect(sql).toContain('"resource_type" = \'promotion\'');
    expect(sql).toContain('"actor_type" = \'promotion_owner\'');
    expect(sql).toContain("binding_status\" = 'resolved'");
    expect(sql).toContain('ck__marketplace_provider_ops__resource_anchor');
  });

  it('enforces request/result fingerprints, safe receipts, events, transitions, and reconciliation state', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('marketplace_provider_descriptor_is_valid');
    expect(sql).toContain('marketplace_provider_result_is_valid');
    expect(sql).toContain('marketplace_provider_receipt_is_safe');
    expect(sql).toContain('ck__marketplace_provider_ops__request_fingerprint');
    expect(sql).toContain('ck__marketplace_provider_ops__result_fingerprint');
    expect(sql).toContain('uq__marketplace_provider_operations__provider_mode_pro_24c07bd3');
    expect(sql).toContain('ck__marketplace_provider_ops__reconciliation');
    expect(sql).toContain('ck__marketplace_provider_ops__immutable_identity');
    expect(sql).toContain('ck__marketplace_provider_ops__transition');
    expect(sql).toContain('access[_-]?token');
    expect(sql).toContain('document[_-]?bytes');
    expect(sql).toContain('private[_-]?key');
  });

  it('refuses a destructive downgrade after generalized traffic and restores the verification schema', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('cannot downgrade marketplace provider operations after generalized capability traffic');
    expect(sql).toContain('fk__marketplace_provider_operations__verification_actor');
    expect(sql).toContain('uq__marketplace_provider_ops__actor_capability_resource_key');
    expect(sql).toContain('drop function "marketplace_provider_receipt_is_safe"');
    expect(sql).not.toContain('drop table "marketplace_provider_operations"');
  });
});
