// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it } from 'vitest';
import { Migration20260810136000AddContractNotificationDelivery } from './Migration20260810136000AddContractNotificationDelivery';

function collect(run: (migration: Migration20260810136000AddContractNotificationDelivery) => void): string {
  const migration = new Migration20260810136000AddContractNotificationDelivery(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
}

describe('marketplace contract notification delivery migration', () => {
  it('replaces immutable intents with a leased and provenance-fenced delivery state machine', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('drop trigger "tr__marketplace_contract_notification_intents__immutable"');
    expect(sql).toContain('"claim_token" uuid not null');
    expect(sql).toContain('"claimed_at" timestamptz not null');
    expect(sql).toContain('"next_attempt_at" timestamptz not null');
    expect(sql).toContain('"attempts" between 0 and 10');
    expect(sql).toContain('"channel_attempts" between 0 and 5');
    expect(sql).toContain("\"recipient_locale\" in ('en', 'ru', 'uz', 'uz-cyrl')");
    expect(sql).toContain('"ix__marketplace_contract_notification_intents__status_b9dc6f48"');
    expect(sql).toContain('old."channel" = \'telegram\' and new."channel" = \'sms\'');
    expect(sql).toContain("'marketplace.contract.dispute.opened'");
    expect(sql).toContain('sms_fallback');
    expect(sql).toContain("'reconciliation_required'");
    expect(sql).toContain('provider identity is frozen');
    expect(sql).toContain('terminal marketplace contract notification intent is immutable');
    expect(sql).toContain('"provider_mode" = \'mock\' and "simulation" = true');
    expect(sql).toContain('"provider_mode" = \'live\' and "simulation" = false');
    expect(sql).not.toContain('cascade');
  });

  it('refuses lossy rollback after any claim or attempt and restores the original immutable guard otherwise', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('cannot remove notification delivery state after delivery processing has begun');
    expect(sql).toContain('"attempts" <> 0');
    expect(sql).toContain('"claim_token" <>');
    expect(sql).toContain('create function "guard_marketplace_contract_notification_intent_immutable"');
    expect(sql).toContain('create trigger "tr__marketplace_contract_notification_intents__immutable"');
    expect(sql).not.toContain('cascade');
  });
});
