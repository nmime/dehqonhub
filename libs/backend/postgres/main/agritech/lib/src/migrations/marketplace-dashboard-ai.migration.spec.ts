// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Migration20260810135000AddMarketplaceDashboardsAndGroundedAi } from './Migration20260810135000AddMarketplaceDashboardsAndGroundedAi';

const collect = (run: (migration: Migration20260810135000AddMarketplaceDashboardsAndGroundedAi) => void): string => {
  const migration = new Migration20260810135000AddMarketplaceDashboardsAndGroundedAi(
    undefined as never,
    undefined as never,
  );
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run(migration);
  return statements.join('\n');
};

describe('marketplace dashboard and grounded AI migration', () => {
  it('replaces private product references with bounded opaque publication grounding', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('rename column "product_ids" to "listing_publication_ids"');
    expect(sql).toContain('set "answer" = \'no_catalog_match\'');
    expect(sql).toContain('ck__marketplace_ai_consultations__grounded_listing');
    expect(sql).toContain('publication."moderation_status" = \'approved\'');
    expect(sql).toContain('membership."status" = \'active\'');
    expect(sql).toContain('verification."status" = \'verified\'');
    expect(sql).toContain('product."stock_quantity" > 0');
    expect(sql).toContain('produce."available_quantity_kg" > 0');
  });

  it('creates one immutable actor-keyed confirmation receipt per consultation', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('create table "marketplace_ai_starter_cart_operations"');
    expect(sql).toContain('uq__marketplace_ai_starter_cart_operations__actor_key');
    expect(sql).toContain('uq__marketplace_ai_starter_cart_operations__consultation_id');
    expect(sql).toContain('ck__marketplace_ai_starter_cart_operations__immutable');
    expect(sql).toContain('ck__marketplace_ai_starter_cart_operations__authority');
    expect(sql).toContain('membership."capability" = \'buyer\'');
    expect(sql).toContain('ck__marketplace_ai_starter_cart_operations__result_snapshot');
    expect(sql).toContain('ck__marketplace_ai_starter_cart_operations__cart');
    expect(sql).toContain('ck__marketplace_ai_starter_cart_operations__item');
    expect(sql).toContain('ck__marketplace_ai_consultations__starter_cart_receipt');
  });

  it('bounds retained questions and persists a coherent create-command receipt', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain('ck__marketplace_ai_consultations__question');
    expect(sql).toContain('char_length("question") between 1 and 2000');
    expect(sql).toContain('"question" !~ \'[[:cntrl:]]\'');
    expect(sql).toContain('"question" !~ U&\'[\\00AD\\061C\\200B-\\200F');
    expect(sql).toContain('create table "marketplace_ai_consultation_operations"');
    expect(sql).toContain('uq__marketplace_ai_consultation_operations__actor_key');
    expect(sql).toContain('ck__marketplace_ai_consultation_operations__idempotency_key');
    expect(sql).toContain('ck__marketplace_ai_consultation_operations__request_fingerprint');
    expect(sql).toContain('ck__marketplace_ai_consultation_operations__result_snapshot');
    expect(sql).toContain('ck__marketplace_ai_consultation_operations__coherence');
    expect(sql).toContain('ck__marketplace_ai_consultations__create_receipt');
  });

  it('freezes all four reviewed title variants in the grounded recommendation snapshot', () => {
    const sql = collect((migration) => {
      migration.up();
    });

    expect(sql).toContain("\"recommendation\" -> 'titles' ->> 'en'");
    expect(sql).toContain("\"recommendation\" -> 'titles' ->> 'ru'");
    expect(sql).toContain("\"recommendation\" -> 'titles' ->> 'uz'");
    expect(sql).toContain("\"recommendation\" -> 'titles' ->> 'uzCyrl'");
    expect(sql).toContain('coalesce(publication."public_title_ru", publication."public_title")');
    expect(sql).toContain('coalesce(publication."public_title_uz", publication."public_title")');
    expect(sql).toContain('coalesce(publication."public_title_uz_cyrl", publication."public_title")');
  });

  it('keeps promotion weight outside AI grounding source and schema', () => {
    const repository = readFileSync(
      resolve(__dirname, '../repositories/marketplace-dashboard-ai.repository.ts'),
      'utf8',
    );
    const sql = collect((migration) => {
      migration.up();
    });

    expect(repository).not.toContain('marketplace_listing_promotions');
    expect(repository).not.toContain('promoted');
    expect(sql).not.toContain('marketplace_listing_promotions');
  });

  it('documents a pre-traffic-only contraction and restores the legacy column shape', () => {
    const sql = collect((migration) => {
      migration.down();
    });

    expect(sql).toContain('drop table if exists "marketplace_ai_starter_cart_operations"');
    expect(sql).not.toContain('cascade');
    expect(sql).toContain('rename column "listing_publication_ids" to "product_ids"');
    expect(sql).toContain('ck__marketplace_ai__product_ids_array');
  });
});
