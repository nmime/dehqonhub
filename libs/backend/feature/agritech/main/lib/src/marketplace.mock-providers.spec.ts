// @requirements REQ-AGRITECH-INTEGRATION-013
import { describe, expect, it } from 'vitest';
import type { MarketplaceProviderConfig } from './marketplace-provider.config';
import { resolveMarketplaceProviderConfig } from './marketplace-provider.config';
import { createMarketplaceDocumentProvider, createMarketplaceIdentityProvider } from './marketplace.mock-providers';

const disabledConfig = resolveMarketplaceProviderConfig({ NODE_ENV: 'test' });

/**
 * A live capability can never come out of the environment — `providerMode` throws
 * on it — so the factory guard is only reachable through a hand-built config, and
 * it is what keeps a half-wired live verification flow from booting.
 */
const liveConfig: MarketplaceProviderConfig = {
  ...disabledConfig,
  oneId: { mode: 'live', providerName: null, timeoutMs: 10_000 },
  verificationDocuments: { mode: 'live', providerName: null, timeoutMs: 10_000 },
};

describe('verification provider factories', () => {
  it('fails closed with disabled identity and document adapters when neither switch is set', async () => {
    const identity = createMarketplaceIdentityProvider(disabledConfig);
    const documents = createMarketplaceDocumentProvider(disabledConfig);
    const signal = new AbortController().signal;

    expect(identity).toMatchObject({ mode: 'disabled', name: 'disabled' });
    expect(documents).toMatchObject({ mode: 'disabled', name: 'disabled' });
    await expect(
      identity.linkIdentity({
        operationAttempt: 1,
        operationId: 'operation-1',
        owner: { tenantId: 'tenant-a', userId: 'user-a' },
        signal,
      }),
    ).rejects.toThrow('Marketplace identity provider is disabled.');
    await expect(
      documents.storeVerificationDocuments({
        documents: [
          {
            content: Uint8Array.from(Buffer.from('%PDF-farm')),
            fileName: 'farm.pdf',
            kind: 'farm',
            mimeType: 'application/pdf',
          },
        ],
        operationAttempt: 1,
        operationId: 'operation-1',
        signal,
      }),
    ).rejects.toThrow('Marketplace document provider is disabled.');
  });

  it('refuses to build live identity or document adapters that do not exist yet', () => {
    expect(() => createMarketplaceIdentityProvider(liveConfig)).toThrow(
      'MARKETPLACE_ONEID_PROVIDER_MODE=live requires a configured OneID provider adapter.',
    );
    expect(() => createMarketplaceDocumentProvider(liveConfig)).toThrow(
      'MARKETPLACE_DOCUMENT_PROVIDER_MODE=live requires a configured document storage provider adapter.',
    );
  });

  it('stamps the simulated receipts with the system clock when no clock is injected', async () => {
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_DOCUMENT_PROVIDER_MODE: 'mock',
      MARKETPLACE_ONEID_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });
    const before = Date.now();

    const linked = await createMarketplaceIdentityProvider(config).linkIdentity({
      operationAttempt: 1,
      operationId: 'operation-1',
      owner: { tenantId: 'tenant-a', userId: 'user-a' },
      signal: new AbortController().signal,
    });
    const stored = await createMarketplaceDocumentProvider(config).storeVerificationDocuments({
      documents: [],
      operationAttempt: 1,
      operationId: 'operation-1',
      signal: new AbortController().signal,
    });

    expect(linked.linkedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored).toMatchObject({ evidence: [], providerName: 'mock-document-storage' });
    expect(stored.storedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
