// @requirements REQ-AGRITECH-LIFECYCLE-020
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

    const branchSnapshot: MarketplaceContractArtifactSnapshot = {
      ...structuredClone(snapshot),
      delivery: { terms: 'pickup' },
      lines: [
        {
          ...snapshot.lines[0]!,
          name: `${'x'.repeat(192)} Ā Ѡ Ꙁ`,
        },
      ],
      settlementKind: 'direct_payment',
      subject: `${'y'.repeat(220)} Ā Ѡ Ꙁ`,
    };
    const branchFingerprint = marketplaceProviderFingerprint(branchSnapshot);
    const branchPdf = await generateMarketplaceContractPdf(branchSnapshot, branchFingerprint);
    expect(branchPdf.content.byteLength).toBeGreaterThan(0);

    const originalSplit = String.prototype.split;
    const originalJoin = Array.prototype.join;
    const split = vi.spyOn(String.prototype, 'split').mockImplementation(function (this: string, separator, limit) {
      const value = String(this);
      return value.startsWith('SALE AND PURCHASE')
        ? ['x'.repeat(156)]
        : Reflect.apply(originalSplit, value, [separator, limit]);
    });
    const arrayJoin = vi.spyOn(Array.prototype, 'join').mockImplementation(function (this: unknown[], separator) {
      return this.length === 78 && this.every((value) => value === 'x')
        ? ''
        : Reflect.apply(originalJoin, this, [separator]);
    });
    try {
      const longFirstWordPdf = await generateMarketplaceContractPdf(branchSnapshot, branchFingerprint);
      expect(longFirstWordPdf.content.byteLength).toBeGreaterThan(0);
    } finally {
      arrayJoin.mockRestore();
      split.mockRestore();
    }

    const codePointAt = vi.spyOn(String.prototype, 'codePointAt').mockReturnValue(undefined);
    try {
      const fallbackPdf = await generateMarketplaceContractPdf(
        { ...branchSnapshot, subject: 'fallback font' },
        branchFingerprint,
      );
      expect(fallbackPdf.content.byteLength).toBeGreaterThan(0);
    } finally {
      codePointAt.mockRestore();
    }

    const fixtureOutputDirectory = mkdtempSync(join(tmpdir(), 'dehqonhub-contract-pdf-'));
    temporaryDirectories.push(fixtureOutputDirectory);
    writeFileSync(join(fixtureOutputDirectory, 'mock-contract.pdf'), first.content);
  }, 30_000);
});
