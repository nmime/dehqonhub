// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { marketplaceProviderReadiness, resolveMarketplaceProviderConfig } from './marketplace-provider.config';
import {
  createMarketplaceDocumentProvider,
  createMarketplaceIdentityProvider,
  MockMarketplaceDocumentProvider,
  MockMarketplaceIdentityProvider,
} from './marketplace.mock-providers';

const capabilityVariables = [
  ['oneId', 'MARKETPLACE_ONEID_PROVIDER_MODE'],
  ['verificationDocuments', 'MARKETPLACE_DOCUMENT_PROVIDER_MODE'],
  ['contractArtifactStorage', 'MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_MODE'],
  ['disputeEvidenceStorage', 'MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_MODE'],
  ['qualifiedSignature', 'MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_MODE'],
  ['promotionBilling', 'MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE'],
  ['directPayment', 'MARKETPLACE_DIRECT_PAYMENT_PROVIDER_MODE'],
  ['factoring', 'MARKETPLACE_FACTORING_PROVIDER_MODE'],
  ['notificationDelivery', 'MARKETPLACE_NOTIFICATION_PROVIDER_MODE'],
] as const;

const timeoutVariables = [
  ['oneId', 'MARKETPLACE_ONEID_PROVIDER_TIMEOUT_MS'],
  ['verificationDocuments', 'MARKETPLACE_DOCUMENT_PROVIDER_TIMEOUT_MS'],
  ['contractArtifactStorage', 'MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_TIMEOUT_MS'],
  ['disputeEvidenceStorage', 'MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_TIMEOUT_MS'],
  ['qualifiedSignature', 'MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_TIMEOUT_MS'],
  ['promotionBilling', 'MARKETPLACE_PROMOTION_BILLING_PROVIDER_TIMEOUT_MS'],
  ['directPayment', 'MARKETPLACE_DIRECT_PAYMENT_PROVIDER_TIMEOUT_MS'],
  ['factoring', 'MARKETPLACE_FACTORING_PROVIDER_TIMEOUT_MS'],
  ['notificationDelivery', 'MARKETPLACE_NOTIFICATION_PROVIDER_TIMEOUT_MS'],
] as const;

describe('marketplace provider configuration', () => {
  it('fails closed with every exact capability disabled by default', () => {
    const config = resolveMarketplaceProviderConfig({ NODE_ENV: 'development' });

    expect(Object.keys(config)).toEqual(capabilityVariables.map(([capability]) => capability));
    for (const [capability] of capabilityVariables) {
      expect(config[capability]).toEqual({ mode: 'disabled', providerName: null, timeoutMs: 10_000 });
    }
  });

  it.each(capabilityVariables)('allows %s mock only through its own non-production switch', (capability, variable) => {
    const config = resolveMarketplaceProviderConfig({ [variable]: 'mock', NODE_ENV: 'staging' });

    expect(config[capability]).toMatchObject({ mode: 'mock', providerName: expect.stringMatching(/^mock-/u) });
    for (const [otherCapability] of capabilityVariables) {
      if (otherCapability !== capability) {
        expect(config[otherCapability].mode).toBe('disabled');
      }
    }
  });

  it.each(capabilityVariables)('rejects %s mock before production can start', (_capability, variable) => {
    expect(() => resolveMarketplaceProviderConfig({ [variable]: 'mock', NODE_ENV: 'production' })).toThrow(
      `${variable}=mock`,
    );
  });

  it.each([undefined, 'preview', 'qa'])('rejects mock providers for an unapproved NODE_ENV value %s', (nodeEnv) => {
    expect(() =>
      resolveMarketplaceProviderConfig({ MARKETPLACE_ONEID_PROVIDER_MODE: 'mock', NODE_ENV: nodeEnv }),
    ).toThrow('allowed only');
  });

  it.each(capabilityVariables)('rejects incomplete live %s configuration before listen', (_capability, variable) => {
    expect(() => resolveMarketplaceProviderConfig({ [variable]: 'live', NODE_ENV: 'production' })).toThrow(
      'approved configured live provider adapter',
    );
  });

  it('rejects invalid values and retired coarse bank/signature switches', () => {
    expect(() =>
      resolveMarketplaceProviderConfig({ MARKETPLACE_ONEID_PROVIDER_MODE: 'automatic', NODE_ENV: 'test' }),
    ).toThrow('MARKETPLACE_ONEID_PROVIDER_MODE');
    expect(() =>
      resolveMarketplaceProviderConfig({ MARKETPLACE_SIGNATURE_PROVIDER_MODE: 'disabled', NODE_ENV: 'test' }),
    ).toThrow('is retired');
    expect(() =>
      resolveMarketplaceProviderConfig({ MARKETPLACE_BANK_PROVIDER_MODE: 'mock', NODE_ENV: 'test' }),
    ).toThrow('is retired');
  });

  it.each(timeoutVariables)('bounds the independent %s timeout below the operation lease', (capability, variable) => {
    expect(resolveMarketplaceProviderConfig({ [variable]: '2500', NODE_ENV: 'test' })[capability].timeoutMs).toBe(2500);
    expect(() => resolveMarketplaceProviderConfig({ [variable]: '30001', NODE_ENV: 'test' })).toThrow(variable);
    expect(() => resolveMarketplaceProviderConfig({ [variable]: '0', NODE_ENV: 'test' })).toThrow(variable);
  });

  it('reports exact source, timeout, disabled, and mock readiness without provider secrets', () => {
    const readiness = marketplaceProviderReadiness(
      resolveMarketplaceProviderConfig({
        MARKETPLACE_DOCUMENT_PROVIDER_MODE: 'mock',
        MARKETPLACE_DOCUMENT_PROVIDER_TIMEOUT_MS: '2500',
        NODE_ENV: 'staging',
      }),
    );

    expect(readiness.verificationDocuments).toEqual({
      mode: 'mock',
      providerName: 'mock-document-storage',
      ready: true,
      reconciliation: 'idempotent-retry',
      simulation: true,
      timeoutMs: 2500,
    });
    expect(readiness.directPayment).toEqual({
      mode: 'disabled',
      providerName: null,
      ready: false,
      reconciliation: 'disabled',
      simulation: false,
      timeoutMs: 10_000,
    });
    expect(JSON.stringify(readiness)).not.toMatch(/secret|token|credential/iu);
  });

  it('constructs only the two currently consumed deterministic mock adapters', () => {
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_DOCUMENT_PROVIDER_MODE: 'mock',
      MARKETPLACE_ONEID_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });

    expect(createMarketplaceIdentityProvider(config)).toBeInstanceOf(MockMarketplaceIdentityProvider);
    expect(createMarketplaceDocumentProvider(config)).toBeInstanceOf(MockMarketplaceDocumentProvider);
  });
});

describe('mock marketplace providers', () => {
  it('derives an opaque OneID subject from the authenticated actor, never caller identity input', async () => {
    const linkedAt = new Date('2030-01-01T00:00:00.000Z');
    const provider = new MockMarketplaceIdentityProvider(() => linkedAt);
    const signal = new AbortController().signal;
    const first = await provider.linkIdentity({
      operationAttempt: 1,
      operationId: 'operation-1',
      owner: { tenantId: 'tenant-a', userId: 'user-a' },
      signal,
    });
    const retried = await provider.linkIdentity({
      operationAttempt: 2,
      operationId: 'operation-1',
      owner: { tenantId: 'tenant-a', userId: 'user-a' },
      signal,
    });
    const sameActorOtherTenant = await provider.linkIdentity({
      operationAttempt: 1,
      operationId: 'operation-2',
      owner: { tenantId: 'tenant-b', userId: 'user-a' },
      signal,
    });

    expect(first).toMatchObject({
      identityAssurance: 'mock',
      providerMode: 'mock',
      providerName: 'mock-oneid',
      receiptId: 'mock-oneid:operation-1',
    });
    expect(first.subjectKey).toHaveLength(64);
    expect(retried).toMatchObject({ receiptId: first.receiptId, subjectKey: first.subjectKey });
    expect(first.subjectKey).toBe(sameActorOtherTenant.subjectKey);
    expect(first.subjectKey).not.toContain('user-a');
  });

  it('returns safe immutable metadata and a server-computed checksum without retaining document bytes', async () => {
    const content = Uint8Array.from(Buffer.from('%PDF-demo-evidence'));
    const provider = new MockMarketplaceDocumentProvider(() => new Date('2030-01-01T00:00:00.000Z'));
    const result = await provider.storeVerificationDocuments({
      documents: [{ content, fileName: 'farm.pdf', kind: 'farm', mimeType: 'application/pdf' }],
      operationAttempt: 1,
      operationId: 'operation-1',
      signal: new AbortController().signal,
    });

    expect(result.evidence[0]?.document).toMatchObject({
      providerMode: 'mock',
      providerName: 'mock-document-storage',
      sha256: createHash('sha256').update(content).digest('hex'),
      sizeBytes: content.byteLength,
    });
    expect(result.evidence[0]).not.toHaveProperty('content');
  });
});
