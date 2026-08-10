// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import type { AgriTechOwner, OperationResult } from './agritech.types';
import type {
  MarketplaceExternalProviderMode,
  MarketplaceProviderOperationPreparation,
  PreparedMarketplaceProviderOperation,
} from './marketplace-provider-operation';
import type {
  MarketplaceProviderMode,
  Verification,
  VerificationDocument,
  VerificationRole,
} from './marketplace.types';

export const MarketplaceVerificationRepositoryInjectToken = Symbol('MarketplaceVerificationRepositoryInjectToken');
export const MarketplaceIdentityProviderInjectToken = Symbol('MarketplaceIdentityProviderInjectToken');
export const MarketplaceDocumentProviderInjectToken = Symbol('MarketplaceDocumentProviderInjectToken');

export interface MarketplaceIdentityProviderResult {
  identityAssurance: Extract<Verification['identityAssurance'], 'mock' | 'provider_verified'>;
  linkedAt: Date;
  providerMode: Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName: string;
  receiptId: string;
  subjectKey: string;
}

export interface VerificationDocumentInput {
  content: Uint8Array;
  fileName: string;
  kind: VerificationDocument['kind'];
  mimeType: NonNullable<VerificationDocument['mimeType']>;
}

export interface MarketplaceDocumentProviderEvidence {
  document: VerificationDocument;
}

export interface MarketplaceDocumentProviderResult {
  evidence: MarketplaceDocumentProviderEvidence[];
  providerMode: Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName: string;
  receiptId: string;
  storedAt: Date;
}

export interface MarketplaceIdentityProvider {
  readonly mode: MarketplaceExternalProviderMode;
  readonly name: string;
  /**
   * Adapters MUST use operationId as the provider-side idempotency key across
   * retries. operationAttempt only fences late callbacks in local persistence.
   */
  linkIdentity(input: {
    owner: AgriTechOwner;
    operationAttempt: number;
    operationId: string;
    signal: AbortSignal;
  }): Promise<MarketplaceIdentityProviderResult>;
}

export interface MarketplaceDocumentProvider {
  readonly mode: MarketplaceExternalProviderMode;
  readonly name: string;
  /**
   * Adapters MUST use operationId as the provider-side idempotency key across
   * retries. operationAttempt only fences late callbacks in local persistence.
   */
  storeVerificationDocuments(input: {
    documents: VerificationDocumentInput[];
    operationAttempt: number;
    operationId: string;
    signal: AbortSignal;
  }): Promise<MarketplaceDocumentProviderResult>;
}

export interface MarketplaceVerificationRepository {
  createVerification(
    owner: AgriTechOwner,
    role: VerificationRole,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<OperationResult<Verification>>;
  getVerification(owner: AgriTechOwner): Promise<Verification | undefined>;
  prepareProviderOperation(
    owner: AgriTechOwner,
    input: MarketplaceProviderOperationPreparation,
  ): Promise<OperationResult<PreparedMarketplaceProviderOperation>>;
  completeIdentityLink(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceIdentityProviderResult,
  ): Promise<OperationResult<Verification>>;
  completeVerificationDocuments(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceDocumentProviderResult,
  ): Promise<OperationResult<Verification>>;
  failProviderOperation(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    errorCode: string,
  ): Promise<void>;
  submitVerification(
    owner: AgriTechOwner,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<OperationResult<Verification>>;
}
