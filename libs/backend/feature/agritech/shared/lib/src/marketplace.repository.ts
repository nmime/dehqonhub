import type {
  BuyerRequest,
  Cart,
  AddCartItemInput,
  CheckoutCartInput,
  CheckoutCartResult,
  Contract,
  ContractDeliveryQuoteInput,
  CreateBuyerRequestInput,
  CreateRequestOfferInput,
  RequestOffer,
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
    expectedRevision: number,
    idempotencyKey: string,
    reason?: VerificationRejectionReason,
  ): Promise<OperationResult<Verification>>;
  listVerifications(tenantId: string): Promise<Verification[]>;
  isApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): Promise<boolean>;

  // Cart
  getCart(owner: AgriTechOwner, cartId: string): Promise<Cart | undefined>;
  listCarts(owner: AgriTechOwner): Promise<Cart[]>;
  addToCart(owner: AgriTechOwner, item: AddCartItemInput, idempotencyKey: string): Promise<OperationResult<Cart>>;
  updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<OperationResult<Cart>>;
  removeCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<Cart>>;
  checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
    idempotencyKey: string,
  ): Promise<OperationResult<CheckoutCartResult>>;

  // Reverse-auction requests
  createRequest(
    owner: AgriTechOwner,
    input: CreateBuyerRequestInput,
    idempotencyKey: string,
  ): Promise<OperationResult<BuyerRequest>>;
  listRequests(tenantId: string, status?: string): Promise<BuyerRequest[]>;
  listMyRequests(owner: AgriTechOwner): Promise<BuyerRequest[]>;
  makeOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    input: CreateRequestOfferInput,
    idempotencyKey: string,
  ): Promise<OperationResult<RequestOffer>>;
  listOffers(owner: AgriTechOwner, requestId: string): Promise<OperationResult<RequestOffer[]>>;
  chooseOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    offerId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<OfferSelectionResult>>;

  // Contracts
  updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
    idempotencyKey: string,
  ): Promise<OperationResult<Contract>>;
  listContracts(owner: AgriTechOwner): Promise<Contract[]>;
  listTenantContracts(tenantId: string): Promise<Contract[]>;

  // Role helpers
  roleOf(owner: AgriTechOwner): Promise<VerificationRole | undefined>;
}
