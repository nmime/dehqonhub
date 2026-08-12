export type VerificationRole = 'farmer' | 'seller' | 'buyer';
export type VerificationLevel = 'basic' | 'verified' | 'trusted';
export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type VerificationRejectionReason = 'criteria_not_met' | 'documents_unreadable' | 'identity_mismatch';

export interface VerificationDocument {
  kind: 'id' | 'land' | 'lease' | 'cadastre' | 'farm' | 'machinery' | 'warehouse' | 'business';
  fileName: string;
  storageKey: string;
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
  documents: VerificationDocument[];
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: VerificationRejectionReason;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart {
  id: string;
  tenantId: string;
  userId: string;
  sellerId: string;
  items: CartItem[];
  status: 'open' | 'ordered' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}

export type SampleStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled';

export interface SampleRequest {
  id: string;
  tenantId: string;
  userId: string;
  productId: string;
  sellerId: string;
  status: SampleStatus;
  createdAt: Date;
}

export type RequestStatus = 'open' | 'offering' | 'selected' | 'closed' | 'expired';

export interface BuyerRequest {
  id: string;
  tenantId: string;
  buyerUserId: string;
  title: string;
  product?: string;
  volume?: string;
  region: string;
  deadline?: string;
  budgetUzs?: number;
  requirements?: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type OfferStatus = 'pending' | 'accepted' | 'declined';

export interface RequestOffer {
  id: string;
  requestId: string;
  tenantId: string;
  sellerUserId: string;
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
  productId: string;
  name: string;
  unit: string;
  unitPriceUzs: number;
  quantity: number;
  lineTotalUzs: number;
}

export interface Contract {
  id: string;
  tenantId: string;
  buyerUserId: string;
  sellerUserId: string;
  /**
   * The organizations behind the two ids, so a contract can name its parties.
   * The document used to print the raw party uuids, which told a reader nothing
   * about who they were about to sign with. Optional because a party's
   * organization is what carries the name, and a contract outlives it: a party
   * whose organization was removed still has to render.
   */
  buyerName?: string;
  sellerName?: string;
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
}

export interface OfferSelectionResult {
  requestId: string;
  offerId: string;
  sellerUserId: string;
  contractId: string;
}

export interface Favorite {
  tenantId: string;
  userId: string;
  productId: string;
  createdAt: Date;
}

export interface Review {
  id: string;
  tenantId: string;
  productId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

export type AiConsultationKind = 'recommendation' | 'find_cheaper' | 'season_advice' | 'generic';
export type AiConsultationAnswer = 'catalog_match' | 'no_catalog_match';

export interface AiConsultation {
  id: string;
  tenantId: string;
  userId: string;
  kind: AiConsultationKind;
  question: string;
  answer: AiConsultationAnswer;
  productIds: string[];
  createdAt: Date;
}
