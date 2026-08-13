// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { describe, expect, it } from 'vitest';
import { Migration20260810136000AddContractNotificationDelivery } from './Migration20260810136000AddContractNotificationDelivery';
import { Migration20260810137000AddMarketplaceDisputeEvidence } from './Migration20260810137000AddMarketplaceDisputeEvidence';
import { Migration20260810138000AddMarketplaceEngagement } from './Migration20260810138000AddMarketplaceEngagement';
import { agritechMigrations } from './index';

const collect = (run: (migration: Migration20260810138000AddMarketplaceEngagement) => void): string => {
  const migration = new Migration20260810138000AddMarketplaceEngagement(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
};

describe('marketplace engagement migration', () => {
  it('runs engagement only after notification delivery and persisted dispute outcomes', () => {
    const notificationIndex = agritechMigrations.indexOf(Migration20260810136000AddContractNotificationDelivery);
    const disputeIndex = agritechMigrations.indexOf(Migration20260810137000AddMarketplaceDisputeEvidence);
    const engagementIndex = agritechMigrations.indexOf(Migration20260810138000AddMarketplaceEngagement);

    expect(notificationIndex).toBeGreaterThanOrEqual(0);
    expect(disputeIndex).toBe(notificationIndex + 1);
    expect(engagementIndex).toBe(disputeIndex + 1);
  });

  it('creates opaque listing engagement with database-enforced quota, party, audit, and moderation boundaries', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('add column "sample_available" boolean not null default false');
    expect(sql).toContain('rename to "marketplace_legacy_sample_requests_archive"');
    expect(sql).toContain('create table "marketplace_listing_favorites"');
    expect(sql).toContain('create table "marketplace_listing_samples"');
    expect(sql).toContain('create table "marketplace_sample_monthly_usage"');
    expect(sql).toContain('create table "marketplace_listing_reviews"');
    expect(sql).toContain('create table "marketplace_review_reports"');
    expect(sql).toContain('create table "marketplace_engagement_notification_intents"');
    expect(sql).toContain('"monthly_limit" int not null default 5');
    expect(sql).toContain('"item_price_uzs" = 0');
    expect(sql).toContain('"requester_partner_id" <> "seller_partner_id"');
    expect(sql).toContain("\"recipient_locale\" in ('en', 'ru', 'uz', 'uz-cyrl')");
    expect(sql).toContain('"uq__marketplace_listing_samples__requester_tenant_id_r_63a04c4b"');
    expect(sql).toContain('"uq__marketplace_listing_samples__requester_tenant_id_r_3eba0d03"');
    expect(sql).toContain('"uq__marketplace_listing_reviews__eligibility"');
    expect(sql).toContain('create function "refresh_marketplace_review_aggregate"');
    expect(sql).toContain('create function "assert_marketplace_listing_sample_coherence"');
    expect(sql).toContain('create function "assert_marketplace_listing_review_coherence"');
    expect(sql).toContain('marketplace sample monthly quota is exhausted');
    expect(sql).toContain('marketplace-review-aggregate:');
    expect(sql).toContain('"review_count" = "marketplace_review_aggregates"."review_count" + 1');
    expect(sql).toContain('"review_count" = "review_count" - 1');
    expect(sql).toContain('unique ("actor_tenant_id", "actor_user_id", "operation", "idempotency_key")');
    expect(sql).not.toContain(
      'unique ("actor_tenant_id", "actor_user_id", "operation", "resource_key", "idempotency_key")',
    );
    expect(sql).toContain('marketplace sample transition is invalid');
    expect(sql).toContain('marketplace review is immutable except one moderation hide');
    expect(sql).not.toContain('on delete cascade');
  });

  it('refuses a lossy rollback after engagement traffic and restores archived table names otherwise', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('cannot remove marketplace engagement after engagement traffic has begun');
    expect(sql).toContain('exists (select 1 from "marketplace_engagement_events")');
    expect(sql).toContain('rename to "marketplace_reviews"');
    expect(sql).toContain('rename to "marketplace_favorites"');
    expect(sql).toContain('rename to "marketplace_sample_requests"');
    expect(sql).not.toContain('cascade');
  });
});
