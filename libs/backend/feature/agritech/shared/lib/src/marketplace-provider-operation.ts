// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import type { AgriTechOwner, OperationResult } from './agritech.types';
import type { MarketplaceProviderMode, Verification } from './marketplace.types';

export const MarketplaceProviderOperationRepositoryInjectToken = Symbol(
  'MarketplaceProviderOperationRepositoryInjectToken',
);

export type MarketplaceExternalProviderMode = Extract<MarketplaceProviderMode, 'mock' | 'live'> | 'disabled';

export type MarketplaceProviderCapability =
  | 'oneid_link'
  | 'verification_documents'
  | 'contract_artifact_storage'
  | 'dispute_evidence_storage'
  | 'qualified_signature'
  | 'promotion_billing'
  | 'direct_payment'
  | 'factoring';

export type MarketplaceProviderResourceType = 'verification' | 'contract' | 'promotion';

export type MarketplaceProviderActorType =
  'verification_subject' | 'contract_buyer' | 'contract_seller' | 'promotion_owner';

export type MarketplaceProviderOperationStatus = 'started' | 'succeeded' | 'failed';

export type MarketplaceProviderAction =
  | 'link-oneid'
  | 'store-verification-document'
  | 'store-contract-artifact'
  | 'store-dispute-evidence'
  | 'qualify-contract-signature'
  | 'bill-listing-promotion'
  | 'record-direct-payment'
  | 'record-factoring';

export interface MarketplaceProviderResourceDescriptor {
  action: MarketplaceProviderAction;
  resourceId: string;
  resourceRevision: number;
  resourceType: MarketplaceProviderResourceType;
}

export interface MarketplaceVerificationProviderRequestDescriptor extends MarketplaceProviderResourceDescriptor {
  action: 'link-oneid' | 'store-verification-document';
  resourceType: 'verification';
  document?: {
    fileName: string;
    kind: 'id' | 'land' | 'lease' | 'cadastre' | 'farm' | 'machinery' | 'warehouse' | 'business' | 'license';
    mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
    sha256: string;
    sizeBytes: number;
  };
}

/**
 * Generic commands persist only a server-created fingerprint of capability
 * input. Provider payloads, credentials, legal identifiers, and document bytes
 * are deliberately outside the operation ledger.
 */
export interface MarketplaceScopedProviderRequestDescriptor extends MarketplaceProviderResourceDescriptor {
  action:
    | 'store-contract-artifact'
    | 'store-dispute-evidence'
    | 'qualify-contract-signature'
    | 'bill-listing-promotion'
    | 'record-direct-payment'
    | 'record-factoring';
  parametersFingerprint: string;
}

export type MarketplaceProviderRequestDescriptor =
  MarketplaceVerificationProviderRequestDescriptor | MarketplaceScopedProviderRequestDescriptor;

export interface MarketplaceProviderOperationPreparation {
  actorType: MarketplaceProviderActorType;
  capability: MarketplaceProviderCapability;
  idempotencyKey: string;
  providerMode: Exclude<MarketplaceProviderMode, 'none' | 'legacy'>;
  providerName: string;
  requestDescriptor: MarketplaceProviderRequestDescriptor;
  resourceId: string;
  resourceRevision: number;
  resourceType: MarketplaceProviderResourceType;
  requestFingerprint: string;
}

export type MarketplaceProviderSafeReceiptValue = boolean | number | string | null;
export type MarketplaceProviderSafeReceipt = Record<string, MarketplaceProviderSafeReceiptValue>;

export interface MarketplaceProviderResultDescriptor {
  completedAt: string;
  outcome: string;
  resourceId: string;
  resourceRevision: number;
  resourceType: MarketplaceProviderResourceType;
}

export interface MarketplaceProviderOperationCompletion {
  providerEventId?: string;
  providerMode: Exclude<MarketplaceProviderMode, 'none' | 'legacy'>;
  providerName: string;
  providerReference: string;
  reconciliationReason?: string;
  resultDescriptor: MarketplaceProviderResultDescriptor;
  safeReceipt: MarketplaceProviderSafeReceipt;
}

export interface MarketplaceProviderOperationReplay {
  attempt: number;
  operationId: string;
  providerEventId?: string;
  providerMode: Exclude<MarketplaceProviderMode, 'none' | 'legacy'>;
  providerName: string;
  providerReference: string;
  reconciliationRequired: boolean;
  resultDescriptor: MarketplaceProviderResultDescriptor;
  resultFingerprint: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
}

export interface PreparedMarketplaceProviderOperation {
  attempt: number;
  execute: boolean;
  operationId: string;
  providerReplay?: MarketplaceProviderOperationReplay;
  /** Verification retains its typed domain replay while generic consumers use providerReplay. */
  replay?: Verification;
}

export interface MarketplaceProviderOperationRepository {
  prepareProviderOperation(
    owner: AgriTechOwner,
    input: MarketplaceProviderOperationPreparation,
  ): Promise<OperationResult<PreparedMarketplaceProviderOperation>>;
  completeProviderOperation(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceProviderOperationCompletion,
  ): Promise<OperationResult<MarketplaceProviderOperationReplay>>;
  failProviderOperation(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    errorCode: string,
    reconciliationReason?: string,
  ): Promise<void>;
}

export const marketplaceProviderOperationScopes = {
  oneid_link: {
    action: 'link-oneid',
    actorTypes: ['verification_subject'],
    resourceType: 'verification',
  },
  verification_documents: {
    action: 'store-verification-document',
    actorTypes: ['verification_subject'],
    resourceType: 'verification',
  },
  contract_artifact_storage: {
    action: 'store-contract-artifact',
    actorTypes: ['contract_buyer', 'contract_seller'],
    resourceType: 'contract',
  },
  dispute_evidence_storage: {
    action: 'store-dispute-evidence',
    actorTypes: ['contract_buyer', 'contract_seller'],
    resourceType: 'contract',
  },
  qualified_signature: {
    action: 'qualify-contract-signature',
    actorTypes: ['contract_buyer', 'contract_seller'],
    resourceType: 'contract',
  },
  promotion_billing: {
    action: 'bill-listing-promotion',
    actorTypes: ['promotion_owner'],
    resourceType: 'promotion',
  },
  direct_payment: {
    action: 'record-direct-payment',
    actorTypes: ['contract_buyer', 'contract_seller'],
    resourceType: 'contract',
  },
  factoring: {
    action: 'record-factoring',
    actorTypes: ['contract_buyer', 'contract_seller'],
    resourceType: 'contract',
  },
} as const satisfies Record<
  MarketplaceProviderCapability,
  {
    action: MarketplaceProviderAction;
    actorTypes: readonly MarketplaceProviderActorType[];
    resourceType: MarketplaceProviderResourceType;
  }
>;

function canonicalizeProviderValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeProviderValue);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeProviderValue(entry)]),
    );
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function marketplaceProviderFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeProviderValue(value)))
    .digest('hex');
}
