// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import type {
  MarketplaceDocumentProvider,
  MarketplaceDocumentProviderResult,
  MarketplaceIdentityProvider,
  MarketplaceIdentityProviderResult,
  VerificationDocumentInput,
} from '@app/backend-feature-agritech-shared';
import type { MarketplaceProviderConfig } from './marketplace-provider.config';

type Clock = () => Date;

const systemClock: Clock = () => new Date();

class DisabledMarketplaceIdentityProvider implements MarketplaceIdentityProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';

  linkIdentity(): Promise<MarketplaceIdentityProviderResult> {
    return Promise.reject(new Error('Marketplace identity provider is disabled.'));
  }
}

class DisabledMarketplaceDocumentProvider implements MarketplaceDocumentProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';

  storeVerificationDocuments(): Promise<MarketplaceDocumentProviderResult> {
    return Promise.reject(new Error('Marketplace document provider is disabled.'));
  }
}

export class MockMarketplaceIdentityProvider implements MarketplaceIdentityProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-oneid';

  constructor(private readonly clock: Clock = systemClock) {}

  linkIdentity(input: {
    owner: { tenantId: string; userId: string };
    operationAttempt: number;
    operationId: string;
    signal: AbortSignal;
  }): Promise<MarketplaceIdentityProviderResult> {
    return Promise.resolve({
      identityAssurance: 'mock',
      linkedAt: this.clock(),
      providerMode: 'mock',
      providerName: this.name,
      receiptId: `mock-oneid:${input.operationId}`,
      subjectKey: createHash('sha256').update(`dehqonhub:mock-oneid:v1:${input.owner.userId}`).digest('hex'),
    });
  }
}

export class MockMarketplaceDocumentProvider implements MarketplaceDocumentProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-document-storage';

  constructor(private readonly clock: Clock = systemClock) {}

  storeVerificationDocuments(input: {
    documents: VerificationDocumentInput[];
    operationAttempt: number;
    operationId: string;
    signal: AbortSignal;
  }): Promise<MarketplaceDocumentProviderResult> {
    const storedAt = this.clock();
    const receiptId = `mock-documents:${input.operationId}`;
    return Promise.resolve({
      evidence: input.documents.map((document) => ({
        document: {
          fileName: document.fileName,
          kind: document.kind,
          mimeType: document.mimeType,
          providerMode: 'mock' as const,
          providerName: this.name,
          providerReceiptId: receiptId,
          sha256: createHash('sha256').update(document.content).digest('hex'),
          sizeBytes: document.content.byteLength,
          storedAt: storedAt.toISOString(),
        },
      })),
      providerMode: 'mock',
      providerName: this.name,
      receiptId,
      storedAt,
    });
  }
}

export function createMarketplaceIdentityProvider(config: MarketplaceProviderConfig): MarketplaceIdentityProvider {
  if (config.oneId.mode === 'mock') {
    return new MockMarketplaceIdentityProvider();
  }
  if (config.oneId.mode === 'live') {
    throw new Error('MARKETPLACE_ONEID_PROVIDER_MODE=live requires a configured OneID provider adapter.');
  }
  return new DisabledMarketplaceIdentityProvider();
}

export function createMarketplaceDocumentProvider(config: MarketplaceProviderConfig): MarketplaceDocumentProvider {
  if (config.verificationDocuments.mode === 'mock') {
    return new MockMarketplaceDocumentProvider();
  }
  if (config.verificationDocuments.mode === 'live') {
    throw new Error('MARKETPLACE_DOCUMENT_PROVIDER_MODE=live requires a configured document storage provider adapter.');
  }
  return new DisabledMarketplaceDocumentProvider();
}
