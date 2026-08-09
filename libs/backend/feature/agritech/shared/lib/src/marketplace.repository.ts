import type {
  AiConsultation,
  AiConsultationKind,
  BuyerRequest,
  Cart,
  CartItem,
  Contract,
  Favorite,
  OfferStatus,
  RequestOffer,
  Review,
  SampleRequest,
  SubmitVerificationInput,
  Verification,
  VerificationRole,
} from './marketplace.types';
import type { AgriTechOwner, OperationResult } from './agritech.types';

export const MarketplaceRepositoryInjectToken = Symbol('MarketplaceRepositoryInjectToken');

export interface MarketplaceRepository {
  // Verification
  getVerification(owner: AgriTechOwner): Promise<Verification | undefined>;
  submitVerification(
    owner: AgriTechOwner,
    input: SubmitVerificationInput,
  ): Promise<OperationResult<Verification>>;
  reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    reason?: string,
  ): Promise<OperationResult<Verification>>;
  listVerifications(tenantId: string): Promise<Verification[]>;
  isVerified(owner: AgriTechOwner): Promise<boolean>;

  // Cart
  getCart(owner: AgriTechOwner, cartId: string): Promise<Cart | undefined>;
  listCarts(owner: AgriTechOwner): Promise<Cart[]>;
  addToCart(owner: AgriTechOwner, sellerId: string, item: CartItem): Promise<OperationResult<Cart>>;
  updateCartItem(owner: AgriTechOwner, cartId: string, productId: string, quantity: number): Promise<OperationResult<Cart>>;
  removeCartItem(owner: AgriTechOwner, cartId: string, productId: string): Promise<OperationResult<Cart>>;
  checkoutCart(owner: AgriTechOwner, cartId: string): Promise<OperationResult<{ cartId: string; orderId: string }>>;

  // Samples
  requestSample(owner: AgriTechOwner, productId: string, sellerId: string): Promise<OperationResult<SampleRequest>>;
  listSamples(owner: AgriTechOwner): Promise<SampleRequest[]>;
  sampleUsageThisMonth(owner: AgriTechOwner): Promise<number>;

  // Favorites
  addFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>>;
  removeFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>>;
  listFavorites(owner: AgriTechOwner): Promise<Favorite[]>;

  // Reviews
  addReview(owner: AgriTechOwner, productId: string, rating: number, comment?: string): Promise<OperationResult<Review>>;
  listProductReviews(tenantId: string, productId: string): Promise<Review[]>;

  // Reverse-auction requests
  createRequest(owner: AgriTechOwner, input: Omit<BuyerRequest, 'id' | 'tenantId' | 'buyerUserId' | 'status' | 'createdAt' | 'updatedAt'>): Promise<OperationResult<BuyerRequest>>;
  listRequests(tenantId: string, status?: string): Promise<BuyerRequest[]>;
  listMyRequests(owner: AgriTechOwner): Promise<BuyerRequest[]>;
  makeOffer(owner: AgriTechOwner, requestId: string, priceUzs: number, deliveryNote?: string, deliveryDays?: number): Promise<OperationResult<RequestOffer>>;
  listOffers(tenantId: string, requestId: string): Promise<RequestOffer[]>;
  chooseOffer(owner: AgriTechOwner, requestId: string, offerId: string): Promise<OperationResult<{ requestId: string; offerId: string; sellerUserId: string }>>;

  // Contracts
  createContract(owner: AgriTechOwner, input: {
    buyerUserId: string;
    sellerUserId: string;
    subject: string;
    amountUzs: number;
    deliveryTerms: 'pickup' | 'seller_delivery' | 'by_agreement';
    deliveryPriceUzs?: number;
    factoringEnabled: boolean;
  }): Promise<OperationResult<Contract>>;
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
