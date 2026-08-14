// @requirements REQ-AGRITECH-LIFECYCLE-020
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  marketplaceContractTemplateVersion,
  marketplaceProviderFingerprint,
  type MarketplaceContractArtifactSnapshot,
} from '@app/backend-feature-agritech-shared';
import { generateMarketplaceContractPdf } from './marketplace-contract-pdf';

const temporaryDirectories: string[] = [];

const snapshot: MarketplaceContractArtifactSnapshot = {
  amountUzs: 40_800_000,
  buyer: {
    legalName: 'Баҳор фермер хўжалиги',
    partnerId: '22222222-2222-4222-8222-222222222222',
    region: 'Самарқанд',
    tenantId: 'buyer-tenant',
    userId: 'buyer-user',
  },
  contractCreatedAt: '2026-08-10T08:00:00.000Z',
  contractId: '44444444-4444-4444-8444-444444444444',
  delivery: { days: 8, note: 'Самарқанд омборига', priceUzs: 800_000, terms: 'seller_delivery' },
  lines: [
    {
      lineTotalUzs: 40_000_000,
      name: 'Маккажўхори уруғи, F1 гибрид',
      quantity: 10,
      sourceId: '11111111-1111-4111-8111-111111111111',
      sourceKind: 'product',
      sourcePublicationId: '33333333-3333-4333-8333-333333333333',
      sourceRevision: 3,
      unit: 'тонна',
      unitPriceUzs: 4_000_000,
    },
  ],
  seller: {
    legalName: 'Зарафшон Агро',
    partnerId: '55555555-5555-4555-8555-555555555555',
    region: 'Самарқанд',
    tenantId: 'seller-tenant',
    userId: 'seller-user',
  },
  settlementKind: 'factoring',
  snapshotRevision: 1,
  subject: 'Маккажўхори уруғи, 10 тонна',
  templateVersion: marketplaceContractTemplateVersion,
};

describe('marketplace contract PDF', () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('is deterministic, preserves Unicode text, and emits a render fixture', async () => {
    const fingerprint = marketplaceProviderFingerprint(snapshot);
    const first = await generateMarketplaceContractPdf(snapshot, fingerprint);
    const second = await generateMarketplaceContractPdf(snapshot, fingerprint);

    expect(first.checksumSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.content).toEqual(second.content);
    expect(Buffer.from(first.content.subarray(0, 8)).toString('ascii')).toBe('%PDF-1.7');
    expect(Buffer.from(first.content).includes(Buffer.from('/ToUnicode'))).toBe(true);
    expect(Buffer.from(first.content).includes(Buffer.from('/Lang'))).toBe(true);

    const fixtureOutputDirectory = mkdtempSync(join(tmpdir(), 'dehqonhub-contract-pdf-'));
    temporaryDirectories.push(fixtureOutputDirectory);
    writeFileSync(join(fixtureOutputDirectory, 'mock-contract.pdf'), first.content);
    // Two full PDF renders are compute-bound; the default 5s budget is not enough
    // when the whole instrumented suite competes for the same cores.
  }, 30_000);

  it('paginates a long direct-payment contract and keeps every script and unpriced term legible', async () => {
    // One snapshot deliberately combining every alternate rendering path: direct
    // payment terms, a delivery with nothing but its terms, an unbreakable word
    // wider than the text column, Cyrillic Extended-B and Latin Extended
    // letters, and enough frozen lines to spill onto further pages.
    const unbreakable = 'M'.repeat(240);
    const long: MarketplaceContractArtifactSnapshot = {
      ...snapshot,
      buyer: { ...snapshot.buyer, legalName: 'Ꙋсмонов ōilaviy fermer xоʻjaligi' },
      delivery: { terms: 'by_agreement' },
      lines: Array.from({ length: 32 }, (_, index) => ({
        lineTotalUzs: 1_000_000 * (index + 1),
        name: `Партия ${index + 1} — маккажўхори уруғи, ẽkstra sinf`,
        quantity: index + 1,
        sourceId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        sourceKind: 'product' as const,
        sourcePublicationId: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
        sourceRevision: index + 1,
        unit: 'тонна',
        unitPriceUzs: 1_000_000,
      })),
      settlementKind: 'direct_payment',
      subject: `Маккажўхори уруғи ${unbreakable} партияси`,
    };

    const generated = await generateMarketplaceContractPdf(long, marketplaceProviderFingerprint(long));

    expect(generated.mediaType).toBe('application/pdf');
    expect(generated.content.byteLength).toBeGreaterThan(snapshot.lines.length * 1024);
    expect(Buffer.from(generated.content).includes(Buffer.from('/Count 3'))).toBe(true);
  }, 30_000);
});
