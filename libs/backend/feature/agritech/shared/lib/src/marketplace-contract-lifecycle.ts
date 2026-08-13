// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-STAGE2-017
import type { AgriTechOwner, OperationResult } from './agritech.types';
import type { ContractLine, MarketplacePartySnapshot, MarketplaceProviderMode } from './marketplace.types';
import type { MarketplaceProviderSafeReceipt } from './marketplace-provider-operation';
import type { MarketplaceContractNotificationStatus } from './marketplace-contract-notification';

export const MarketplaceContractLifecycleRepositoryInjectToken = Symbol(
  'MarketplaceContractLifecycleRepositoryInjectToken',
);
export const MarketplaceContractArtifactStorageProviderInjectToken = Symbol(
  'MarketplaceContractArtifactStorageProviderInjectToken',
);
export const MarketplaceDisputeEvidenceStorageProviderInjectToken = Symbol(
  'MarketplaceDisputeEvidenceStorageProviderInjectToken',
);
export const MarketplaceQualifiedSignatureProviderInjectToken = Symbol(
  'MarketplaceQualifiedSignatureProviderInjectToken',
);
export const MarketplaceDirectPaymentProviderInjectToken = Symbol('MarketplaceDirectPaymentProviderInjectToken');
export const MarketplaceFactoringProviderInjectToken = Symbol('MarketplaceFactoringProviderInjectToken');

export const marketplaceContractTemplateVersion = 'dehqonhub-contract-v1' as const;
export const marketplaceMockContractWatermark = 'MOCK PROVIDER — NOT A LEGAL CONTRACT' as const;

export type MarketplaceContractParty = 'buyer' | 'seller';
export type MarketplaceContractTimelineActor = MarketplaceContractParty | 'admin';
export type MarketplaceContractSettlementKind = 'direct_payment' | 'factoring';
export type MarketplaceDirectPaymentCommand = 'confirm_buyer_payment' | 'confirm_seller_receipt';
export type MarketplaceFactoringProviderCommand =
  'request_decision' | 'record_seller_payout' | 'record_buyer_repayment' | 'close';
export type MarketplaceSettlementProviderCommand =
  MarketplaceDirectPaymentCommand | MarketplaceFactoringProviderCommand;

export type MarketplaceDirectPaymentStatus = 'awaiting_buyer_confirmation' | 'buyer_confirmed' | 'seller_received';
export type MarketplaceFactoringStatus =
  'awaiting_consents' | 'ready_to_request' | 'approved' | 'rejected' | 'seller_paid' | 'buyer_repaid' | 'closed';
export type MarketplaceContractSettlementStatus = MarketplaceDirectPaymentStatus | MarketplaceFactoringStatus;
export type MarketplaceContractSettlementProviderMode = 'none' | Extract<MarketplaceProviderMode, 'mock' | 'live'>;
export type MarketplaceReconciliationState = 'clear' | 'required';
export type MarketplaceContractFulfillmentStatus =
  'awaiting_settlement' | 'ready' | 'in_progress' | 'delivered' | 'disputed' | 'cancelled' | 'completed';
export type MarketplaceContractFulfillmentCommand = 'start' | 'mark_delivered' | 'accept_delivery';
export type MarketplaceContractDisputeReason = 'delivery_issue' | 'quality_issue' | 'quantity_issue' | 'other';
export type MarketplaceDisputeEvidenceMediaType = 'application/pdf' | 'image/jpeg' | 'image/png';
export type MarketplaceDisputeDecision = 'dismissed' | 'upheld_cancelled';
export type MarketplaceReputationOutcome = 'dispute_dismissed' | 'dispute_upheld';
export type MarketplaceCommissionSourceKind = 'produce' | 'product' | 'request';
export type MarketplaceCommissionRateSnapshot = Record<MarketplaceCommissionSourceKind, number>;
export const maximumMarketplaceDisputeEvidenceBytes = 10 * 1024 * 1024;

export interface MarketplaceContractArtifactSnapshot {
  amountUzs: number;
  buyer: MarketplacePartySnapshot;
  contractCreatedAt: string;
  contractId: string;
  delivery: {
    days?: number;
    note?: string;
    priceUzs?: number;
    terms: 'pickup' | 'seller_delivery' | 'by_agreement';
  };
  lines: ContractLine[];
  seller: MarketplacePartySnapshot;
  settlementKind: MarketplaceContractSettlementKind;
  snapshotRevision: number;
  subject: string;
  templateVersion: typeof marketplaceContractTemplateVersion;
}

export interface MarketplaceContractArtifact {
  byteSize: number;
  checksumSha256: string;
  contractId: string;
  createdAt: Date;
  id: string;
  mediaType: 'application/pdf';
  providerMode: Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName: string;
  simulation: boolean;
  snapshotFingerprint: string;
  snapshotRevision: number;
  storageReference: string;
  templateVersion: typeof marketplaceContractTemplateVersion;
  watermark: typeof marketplaceMockContractWatermark | null;
}

export interface MarketplaceContractSignature {
  artifactChecksum: string;
  artifactId: string;
  contractId: string;
  id: string;
  party: MarketplaceContractParty;
  partyPartnerId: string;
  partyTenantId: string;
  partyUserId: string;
  providerMode: Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName: string;
  providerReference: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
  signedAt: Date;
  simulation: boolean;
  snapshotRevision: number;
}

export interface MarketplaceContractSettlementEvent {
  actorParty: MarketplaceContractParty;
  actorTenantId: string;
  actorUserId: string;
  contractId: string;
  createdAt: Date;
  eventType:
    | 'buyer_consented'
    | 'seller_consented'
    | 'buyer_payment_confirmed'
    | 'seller_receipt_confirmed'
    | 'factoring_requested'
    | 'factoring_approved'
    | 'factoring_rejected'
    | 'seller_paid'
    | 'buyer_repaid'
    | 'factoring_closed';
  id: string;
  providerEventId?: string;
  providerMode: 'none' | Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName?: string;
  providerReference?: string;
  safeReceipt?: MarketplaceProviderSafeReceipt;
  sequence: number;
  simulation: boolean;
}

export interface MarketplaceContractTimelineEvent {
  actorParty: MarketplaceContractTimelineActor;
  actorTenantId: string;
  actorUserId: string;
  category: 'artifact' | 'signature' | 'settlement' | 'fulfillment' | 'dispute' | 'completion';
  contractId: string;
  createdAt: Date;
  eventType: string;
  id: string;
  providerMode: 'none' | Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  sequence: number;
  simulation: boolean;
}

export interface MarketplaceContractFulfillment {
  completedAt?: Date;
  contractId: string;
  createdAt: Date;
  deliveredAt?: Date;
  id: string;
  revision: number;
  startedAt?: Date;
  status: MarketplaceContractFulfillmentStatus;
  updatedAt: Date;
}

export interface MarketplaceContractDispute {
  contractId: string;
  createdAt: Date;
  id: string;
  openedByParty: MarketplaceContractParty;
  openedByTenantId: string;
  openedByUserId: string;
  reason: MarketplaceContractDisputeReason;
  decision?: MarketplaceDisputeDecision;
  evidenceRevision?: number;
  outcomeNote?: string;
  resolvedAt?: Date;
  resolvedByAdminId?: string;
  status: 'open' | 'resolved';
}

export interface MarketplaceContractDisputeEvidence {
  byteSize: number;
  checksumSha256: string;
  contractId: string;
  createdAt: Date;
  disputeId: string;
  fileName: string;
  id: string;
  mediaType: MarketplaceDisputeEvidenceMediaType;
  providerMode: Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName: string;
  revision: number;
  simulation: boolean;
  storageReference: string;
  uploadedByParty: MarketplaceContractParty;
  uploadedByTenantId: string;
  uploadedByUserId: string;
}

export interface MarketplaceContractReputationSignal {
  contractId: string;
  createdAt: Date;
  disputeId: string;
  disputeRevision: number;
  id: string;
  impact: 'negative';
  outcome: MarketplaceReputationOutcome;
  reason: MarketplaceContractDisputeReason;
  subjectParty: MarketplaceContractParty;
}

export interface MarketplaceCommissionRatePolicy {
  createdAt: Date;
  createdByAdminId: string;
  id: string;
  rateSnapshot: MarketplaceCommissionRateSnapshot;
  retiredAt?: Date;
  status: 'active' | 'retired';
  version: string;
}

export interface MarketplaceContractCommission {
  amountUzs: number;
  baseAmountUzs: number;
  contractId: string;
  createdAt: Date;
  currency: 'UZS';
  id: string;
  rateSnapshot: MarketplaceCommissionRateSnapshot;
  rateVersion: string;
}

export interface MarketplaceContractReviewEligibility {
  buyerPartnerId: string;
  buyerTenantId: string;
  buyerUserId: string;
  contractId: string;
  createdAt: Date;
  id: string;
  sellerPartnerId: string;
  sellerTenantId: string;
  sourceId: string;
  sourceKind: 'produce' | 'product';
  sourcePublicationId: string;
}

export interface MarketplaceContractNotificationIntent {
  attempts: number;
  channel: 'telegram' | 'sms';
  contractId: string;
  createdAt: Date;
  id: string;
  lastAttemptAt?: Date;
  recipientParty: MarketplaceContractParty;
  simulation: boolean;
  status: MarketplaceContractNotificationStatus;
}

export interface MarketplaceContractSettlement {
  amountUzs: number;
  buyerConsentedAt?: Date;
  contractId: string;
  createdAt: Date;
  currency: 'UZS';
  id: string;
  kind: MarketplaceContractSettlementKind;
  latestProviderMode: MarketplaceContractSettlementProviderMode;
  reconciliationReason?: string;
  reconciliationState: MarketplaceReconciliationState;
  revision: number;
  sellerConsentedAt?: Date;
  simulation: boolean;
  status: MarketplaceContractSettlementStatus;
  updatedAt: Date;
}

export interface MarketplaceContractLifecycle {
  artifact?: MarketplaceContractArtifact;
  commission?: MarketplaceContractCommission;
  contractId: string;
  dispute?: MarketplaceContractDispute;
  disputeEvidence: MarketplaceContractDisputeEvidence[];
  fulfillment: MarketplaceContractFulfillment;
  notificationIntents: MarketplaceContractNotificationIntent[];
  reviewEligibilities: MarketplaceContractReviewEligibility[];
  reputationSignals: MarketplaceContractReputationSignal[];
  settlement: MarketplaceContractSettlement;
  settlementEvents: MarketplaceContractSettlementEvent[];
  signatures: MarketplaceContractSignature[];
  timeline: MarketplaceContractTimelineEvent[];
}

export interface MarketplaceContractArtifactDownload {
  artifact: MarketplaceContractArtifact;
  content: Uint8Array;
  fileName: string;
}

export interface PreparedMarketplaceContractArtifact {
  existingArtifact?: MarketplaceContractArtifact;
  snapshot: MarketplaceContractArtifactSnapshot;
  snapshotFingerprint: string;
}

export interface PreparedMarketplaceContractSignature {
  artifact: MarketplaceContractArtifact;
  existingSignature?: MarketplaceContractSignature;
  party: MarketplaceContractParty;
  settlement: MarketplaceContractSettlement;
}

export interface PreparedMarketplaceSettlementProviderCommand {
  amountUzs: number;
  command: MarketplaceSettlementProviderCommand;
  expectedRevision: number;
  party: MarketplaceContractParty;
  settlement: MarketplaceContractSettlement;
}

export interface PreparedMarketplaceDisputeEvidence {
  disputeId: string;
  disputeRevision: number;
  party: MarketplaceContractParty;
}

export interface MarketplaceDisputeEvidenceMetadata {
  byteSize: number;
  checksumSha256: string;
  fileName: string;
  mediaType: MarketplaceDisputeEvidenceMediaType;
}

export interface MarketplaceContractLifecycleRepository {
  prepareArtifact(
    owner: AgriTechOwner,
    contractId: string,
    settlementKind: MarketplaceContractSettlementKind,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<PreparedMarketplaceContractArtifact>>;
  completeArtifact(
    owner: AgriTechOwner,
    operationId: string,
    content: Uint8Array,
  ): Promise<OperationResult<MarketplaceContractArtifact>>;
  findArtifact(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<MarketplaceContractArtifact | undefined>>;
  downloadArtifact(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<MarketplaceContractArtifactDownload>>;
  prepareSignature(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<PreparedMarketplaceContractSignature>>;
  completeSignature(owner: AgriTechOwner, operationId: string): Promise<OperationResult<MarketplaceContractLifecycle>>;
  recordFactoringConsent(
    owner: AgriTechOwner,
    contractId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>>;
  prepareSettlementProviderCommand(
    owner: AgriTechOwner,
    contractId: string,
    command: MarketplaceSettlementProviderCommand,
  ): Promise<OperationResult<PreparedMarketplaceSettlementProviderCommand>>;
  completeSettlementProviderCommand(
    owner: AgriTechOwner,
    operationId: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>>;
  transitionFulfillment(
    owner: AgriTechOwner,
    contractId: string,
    command: MarketplaceContractFulfillmentCommand,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>>;
  openDispute(
    owner: AgriTechOwner,
    contractId: string,
    reason: MarketplaceContractDisputeReason,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>>;
  prepareDisputeEvidence(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<PreparedMarketplaceDisputeEvidence>>;
  completeDisputeEvidence(
    owner: AgriTechOwner,
    operationId: string,
    metadata: MarketplaceDisputeEvidenceMetadata,
  ): Promise<OperationResult<MarketplaceContractDisputeEvidence>>;
  resolveDispute(
    admin: AgriTechOwner,
    contractId: string,
    decision: MarketplaceDisputeDecision,
    evidenceIds: string[],
    evidenceRevision: number,
    outcomeNote: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>>;
  listCommissionRatePolicies(): Promise<MarketplaceCommissionRatePolicy[]>;
  activateCommissionRatePolicy(
    admin: AgriTechOwner,
    version: string,
    rateSnapshot: MarketplaceCommissionRateSnapshot,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceCommissionRatePolicy>>;
  getLifecycle(owner: AgriTechOwner, contractId: string): Promise<OperationResult<MarketplaceContractLifecycle>>;
}

export interface MarketplaceProviderIdentity {
  readonly mode: 'disabled' | 'mock' | 'live';
  readonly name: string;
}

export interface MarketplaceContractArtifactStorageProviderResult {
  completedAt: Date;
  providerMode: 'mock' | 'live';
  providerName: string;
  providerReference: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
  storageReference: string;
}

export interface MarketplaceContractArtifactStorageProvider extends MarketplaceProviderIdentity {
  storeContractArtifact(input: {
    artifactChecksum: string;
    byteSize: number;
    content: Uint8Array;
    contractId: string;
    operationAttempt: number;
    operationId: string;
    signal: AbortSignal;
    snapshotFingerprint: string;
    snapshotRevision: number;
  }): Promise<MarketplaceContractArtifactStorageProviderResult>;
}

export interface MarketplaceDisputeEvidenceStorageProviderResult {
  completedAt: Date;
  providerMode: 'mock' | 'live';
  providerName: string;
  providerReference: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
  storageReference: string;
}

export interface MarketplaceDisputeEvidenceStorageProvider extends MarketplaceProviderIdentity {
  storeDisputeEvidence(input: {
    checksumSha256: string;
    content: Uint8Array;
    contractId: string;
    disputeId: string;
    fileName: string;
    mediaType: MarketplaceDisputeEvidenceMediaType;
    operationAttempt: number;
    operationId: string;
    signal: AbortSignal;
  }): Promise<MarketplaceDisputeEvidenceStorageProviderResult>;
}

export interface MarketplaceQualifiedSignatureProviderResult {
  completedAt: Date;
  providerMode: 'mock' | 'live';
  providerName: string;
  providerReference: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
}

export interface MarketplaceQualifiedSignatureProvider extends MarketplaceProviderIdentity {
  qualifyContractSignature(input: {
    artifactChecksum: string;
    contractId: string;
    operationAttempt: number;
    operationId: string;
    party: MarketplaceContractParty;
    signal: AbortSignal;
    snapshotRevision: number;
  }): Promise<MarketplaceQualifiedSignatureProviderResult>;
}

export interface MarketplaceSettlementProviderResult {
  completedAt: Date;
  outcome: string;
  providerEventId: string;
  providerMode: 'mock' | 'live';
  providerName: string;
  providerReference: string;
  reconciliationReason?: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
}

export interface MarketplaceDirectPaymentProvider extends MarketplaceProviderIdentity {
  recordDirectPayment(input: {
    amountUzs: number;
    command: MarketplaceDirectPaymentCommand;
    contractId: string;
    operationAttempt: number;
    operationId: string;
    party: MarketplaceContractParty;
    signal: AbortSignal;
  }): Promise<MarketplaceSettlementProviderResult>;
}

export interface MarketplaceFactoringProvider extends MarketplaceProviderIdentity {
  recordFactoring(input: {
    amountUzs: number;
    command: MarketplaceFactoringProviderCommand;
    contractId: string;
    operationAttempt: number;
    operationId: string;
    party: MarketplaceContractParty;
    signal: AbortSignal;
  }): Promise<MarketplaceSettlementProviderResult>;
}
