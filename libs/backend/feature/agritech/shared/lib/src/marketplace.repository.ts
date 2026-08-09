import type {
  AiConsultation,
  AiConsultationKind,
  BuyerRequest,
  Cart,
  CartItem,
  CheckoutCartInput,
  CheckoutCartResult,
  Contract,
  ContractDeliveryQuoteInput,
  DeliveryTerms,
  Favorite,
  OfferStatus,
  RequestOffer,
  Review,
  SampleRequest,
  Verification,
  VerificationRejectionReason,
  VerificationRole,
  OfferSelectionResult,
} from './marketplace.types';
import type { AgriTechOwner, OperationResult } from './agritech.types';

export const MarketplaceRepositoryInjectToken = Symbol('MarketplaceRepositoryInjectToken');

export interface MarketplaceRepository {
  // Verification
  getVerification(owner: AgriTechOwner): Promise<Verification | undefined>;
  reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    reason?: VerificationRejectionReason,
  ): Promise<OperationResult<Verification>>;
  listVerifications(tenantId: string): Promise<Verification[]>;
  isVerified(owner: AgriTechOwner): Promise<boolean>;
  isApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): Promise<boolean>;

  // Cart
  getCart(owner: AgriTechOwner, cartId: string): Promise<Cart | undefined>;
  listCarts(owner: AgriTechOwner): Promise<Cart[]>;
  addToCart(owner: AgriTechOwner, item: CartItem): Promise<OperationResult<Cart>>;
  updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<OperationResult<Cart>>;
  removeCartItem(owner: AgriTechOwner, cartId: string, productId: string): Promise<OperationResult<Cart>>;
  checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
  ): Promise<OperationResult<CheckoutCartResult>>;

  // Samples
  requestSample(owner: AgriTechOwner, productId: string): Promise<OperationResult<SampleRequest>>;
  listSamples(owner: AgriTechOwner): Promise<SampleRequest[]>;
  sampleUsageThisMonth(owner: AgriTechOwner): Promise<number>;

  // Favorites
  addFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>>;
  removeFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>>;
  listFavorites(owner: AgriTechOwner): Promise<Favorite[]>;

  // Reviews
  addReview(
    owner: AgriTechOwner,
    productId: string,
    rating: number,
    comment?: string,
  ): Promise<OperationResult<Review>>;
  listProductReviews(tenantId: string, productId: string): Promise<Review[]>;

  // Reverse-auction requests
  createRequest(
    owner: AgriTechOwner,
    input: Omit<BuyerRequest, 'id' | 'tenantId' | 'buyerUserId' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<OperationResult<BuyerRequest>>;
  listRequests(tenantId: string, status?: string): Promise<BuyerRequest[]>;
  listMyRequests(owner: AgriTechOwner): Promise<BuyerRequest[]>;
  makeOffer(
    owner: AgriTechOwner,
    requestId: string,
    priceUzs: number,
    deliveryTerms: DeliveryTerms,
    deliveryPriceUzs?: number,
    deliveryNote?: string,
    deliveryDays?: number,
  ): Promise<OperationResult<RequestOffer>>;
  listOffers(owner: AgriTechOwner, requestId: string): Promise<OperationResult<RequestOffer[]>>;
  chooseOffer(owner: AgriTechOwner, requestId: string, offerId: string): Promise<OperationResult<OfferSelectionResult>>;

  // Contracts
  updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
  ): Promise<OperationResult<Contract>>;
  signContract(owner: AgriTechOwner, contractId: string): Promise<OperationResult<Contract>>;
  listContracts(owner: AgriTechOwner): Promise<Contract[]>;
  listTenantContracts(tenantId: string): Promise<Contract[]>;

  // AI consultant
  askAi(owner: AgriTechOwner, kind: AiConsultationKind, question: string): Promise<OperationResult<AiConsultation>>;
  listAiConsultations(owner: AgriTechOwner): Promise<AiConsultation[]>;

  // Role helpers
  roleOf(owner: AgriTechOwner): Promise<VerificationRole | undefined>;
}

export interface MarketplaceReviewInput {
  productId: string;
  rating: number;
  comment?: string;
}

export type { OfferStatus };
