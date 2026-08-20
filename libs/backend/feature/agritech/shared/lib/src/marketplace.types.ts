import type { MarketplaceModerationStatus, MarketplacePublicationStatus } from './marketplace-public';

export type VerificationRole = 'farmer' | 'seller' | 'buyer';
export type VerificationLevel = 'basic' | 'verified' | 'trusted';
export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type VerificationRejectionReason = 'criteria_not_met' | 'documents_unreadable' | 'identity_mismatch';
export type MarketplaceProviderMode = 'none' | 'legacy' | 'mock' | 'live';
export type VerificationIdentityAssurance = 'none' | 'legacy_unknown' | 'mock' | 'provider_verified';

export interface VerificationDocument {
  kind: 'id' | 'land' | 'lease' | 'cadastre' | 'farm' | 'machinery' | 'warehouse' | 'business' | 'license';
  evidenceId?: string;
  fileName: string;
  storageKey?: string;
  mimeType?: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes?: number;
  providerMode?: Exclude<MarketplaceProviderMode, 'none'>;
  providerName?: string;
  providerReceiptId?: string;
  sha256?: string;
  storedAt?: string;
  caseRevision?: number;
  evidenceRevision?: number;
  optional?: boolean;
}

export interface Verification {
  id: string;
  tenantId: string;
  userId: string;
  role: VerificationRole;
  level: VerificationLevel;
  status: VerificationStatus;
  oneIdLinked: boolean;
  providerMode: MarketplaceProviderMode;
  identityAssurance: VerificationIdentityAssurance;
  providerName?: string;
  providerSubjectKey?: string;
  providerReceiptId?: string;
  oneIdLinkedAt?: Date;
  version: number;
  caseRevision: number;
  documents: VerificationDocument[];
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: VerificationRejectionReason;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  listingPublicationId: string;
  sourceKind: 'product' | 'produce';
  sourceId: string;
  quantity: number;
}

export interface MarketplaceSafeParty {
  displayName: string;
  region: string;
}

export interface Cart {
  id: string;
  buyerTenantId: string;
  buyerUserId: string;
  buyerPartnerId: string;
  sellerTenantId: string;
  sellerUserId: string;
  sellerPartnerId: string;
  seller: MarketplaceSafeParty;
  items: CartItem[];
  status: 'open' | 'ordered' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}

export type RequestStatus = 'open' | 'offering' | 'selected' | 'closed' | 'expired';

export interface BuyerRequest {
  id: string;
  tenantId: string;
  buyerUserId: string;
  buyerPartnerId: string;
  title: string;
  product?: string;
  volume?: string;
  region: string;
  deadline?: string;
  budgetUzs?: number;
  requirements?: string;
  status: RequestStatus;
  /**
   * The public request publication this request is exposed through. It is the only
   * id the offer endpoints accept, and it stays absent until the request is
   * published — an unpublished request has no offer surface at all, which callers
   * must surface instead of reading an empty offer list as "no offers yet".
   */
  publicationId?: string;
  publicationStatus?: MarketplacePublicationStatus;
  moderationStatus?: MarketplaceModerationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBuyerRequestInput extends Omit<
  BuyerRequest,
  | 'id'
  | 'tenantId'
  | 'buyerUserId'
  | 'buyerPartnerId'
  | 'status'
  | 'publicationId'
  | 'publicationStatus'
  | 'moderationStatus'
  | 'createdAt'
  | 'updatedAt'
> {
  actingPartnerId: string;
}

export interface AddCartItemInput {
  actingPartnerId: string;
  listingPublicationId: string;
  quantity: number;
}

export type OfferStatus = 'pending' | 'accepted' | 'declined';

export interface CreateRequestOfferInput {
  actingPartnerId: string;
  priceUzs: number;
  deliveryTerms: DeliveryTerms;
  deliveryPriceUzs?: number;
  deliveryNote?: string;
  deliveryDays?: number;
}

export interface RequestOffer {
  id: string;
  requestPublicId: string;
  buyerTenantId: string;
  buyerUserId: string;
  buyerPartnerId: string;
  sellerTenantId: string;
  sellerUserId: string;
  sellerPartnerId: string;
  seller: MarketplaceSafeParty;
  priceUzs: number;
  deliveryTerms: DeliveryTerms;
  deliveryPriceUzs?: number;
  deliveryNote?: string;
  deliveryDays?: number;
  status: OfferStatus;
  createdAt: Date;
}

export type ContractStatus = 'draft' | 'signed' | 'active' | 'completed' | 'cancelled' | 'legacy_review_required';
export type DeliveryTerms = 'pickup' | 'seller_delivery' | 'by_agreement';
export type ContractSourceType = 'cart_checkout' | 'offer_selection';

export interface ContractLine {
  sourcePublicationId: string;
  sourceKind: 'product' | 'produce' | 'request';
  sourceId: string;
  sourceRevision: number;
  name: string;
  unit: string;
  unitPriceUzs: number;
  quantity: number;
  lineTotalUzs: number;
}

export interface Contract {
  id: string;
  revision: number;
  buyerTenantId: string;
  buyerUserId: string;
  buyerPartnerId: string;
  sellerTenantId: string;
  sellerUserId: string;
  sellerPartnerId: string;
  buyerPartySnapshot: MarketplacePartySnapshot;
  sellerPartySnapshot: MarketplacePartySnapshot;
  sourceType?: ContractSourceType;
  sourceId?: string;
  subject: string;
  amountUzs: number;
  lines: ContractLine[];
  deliveryTerms: DeliveryTerms;
  deliveryPriceUzs?: number;
  deliveryNote?: string;
  deliveryDays?: number;
  factoringEnabled: boolean;
  status: ContractStatus;
  buyerSignedAt?: Date;
  sellerSignedAt?: Date;
  signedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplacePartySnapshot {
  tenantId: string;
  userId: string;
  partnerId: string;
  legalName: string;
  region: string;
}

export interface CheckoutCartInput {
  deliveryTerms: DeliveryTerms;
}

export interface CheckoutCartResult {
  cartId: string;
  contractId: string;
}

export interface ContractDeliveryQuoteInput {
  deliveryPriceUzs: number;
  deliveryNote?: string;
  deliveryDays?: number;
  expectedRevision: number;
}

export interface OfferSelectionResult {
  requestPublicId: string;
  offerId: string;
  sellerUserId: string;
  contractId: string;
}

export type AiConsultationKind = 'recommendation' | 'find_cheaper' | 'season_advice' | 'generic';
export type AiConsultationAnswer = 'catalog_match' | 'no_catalog_match';
