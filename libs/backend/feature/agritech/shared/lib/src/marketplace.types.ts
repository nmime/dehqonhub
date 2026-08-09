export type VerificationRole = 'farmer' | 'seller' | 'buyer';
export type VerificationLevel = 'basic' | 'verified' | 'trusted';
export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

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
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmitVerificationInput {
  role: VerificationRole;
  level: VerificationLevel;
  oneIdLinked: boolean;
  documents: VerificationDocument[];
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
  deliveryNote?: string;
  deliveryDays?: number;
  status: OfferStatus;
  createdAt: Date;
}

export type ContractStatus = 'draft' | 'signed' | 'active' | 'completed' | 'cancelled';
export type DeliveryTerms = 'pickup' | 'seller_delivery' | 'by_agreement';

export interface Contract {
  id: string;
  tenantId: string;
  buyerUserId: string;
  sellerUserId: string;
  subject: string;
  amountUzs: number;
  deliveryTerms: DeliveryTerms;
  deliveryPriceUzs?: number;
  factoringEnabled: boolean;
  status: ContractStatus;
  signedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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

export interface AiConsultation {
  id: string;
  tenantId: string;
  userId: string;
  kind: AiConsultationKind;
  question: string;
  answer: string;
  productIds: string[];
  createdAt: Date;
}
