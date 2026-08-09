// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  maxMonthlySamples,
  canBuyInMarketplace,
  canOfferInMarketplace,
  isVerificationReviewReasonValid,
  type AgriTechOwner,
  type AiConsultationKind,
  type BuyerRequest,
  type Cart,
  type CheckoutCartInput,
  type CheckoutCartResult,
  type Contract,
  type ContractDeliveryQuoteInput,
  type DeliveryTerms,
  type MarketplaceRepository,
  type OperationResult,
  type OfferSelectionResult,
  type SampleRequest,
  type Verification,
  type VerificationRejectionReason,
  type VerificationRole,
} from '@app/backend-feature-agritech-shared';

function unwrap<T>(result: OperationResult<T>, label: string): T {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(label);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(label);
  }
  if (result.status === 'invalid_state') {
    throw new BadRequestException({ meta: { resourceType: label, field: result.field } });
  }
  if (result.status === 'forbidden') {
    throw new ForbiddenException(label);
  }
  throw new BadRequestException({ meta: { resourceType: label } });
}

/**
 * Framework-independent marketplace application service. Runtime Nest wiring
 * subclasses this service, while non-framework adapters can exercise the same
 * authorization and orchestration path directly.
 */
export class MarketplaceDomainService {
  constructor(protected readonly repository: MarketplaceRepository) {}

  async getVerification(owner: AgriTechOwner): Promise<Verification | null> {
    return (await this.repository.getVerification(owner)) ?? null;
  }

  async listVerifications(tenantId: string): Promise<Verification[]> {
    return this.repository.listVerifications(tenantId);
  }

  async reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    reason?: VerificationRejectionReason,
  ): Promise<Verification> {
    if (!isVerificationReviewReasonValid(decision, reason)) {
      throw new BadRequestException({ meta: { resourceType: 'verification', field: 'reason' } });
    }
    return unwrap(
      await this.repository.reviewVerification(tenantId, verificationId, decision, reviewedBy, reason),
      'verification',
    );
  }

  async requireVerified(owner: AgriTechOwner): Promise<void> {
    const role = await this.repository.roleOf(owner);
    if (!role) {
      throw new ForbiddenException('verification');
    }
  }

  private async requireBuyerRole(owner: AgriTechOwner): Promise<VerificationRole> {
    const role = await this.repository.roleOf(owner);
    if (!canBuyInMarketplace(role) || !(await this.repository.isApprovedOrganization(owner, 'buyer'))) {
      throw new ForbiddenException('marketplace:buy', role);
    }
    return role as VerificationRole;
  }

  private async requireOfferRole(owner: AgriTechOwner): Promise<VerificationRole> {
    const role = await this.repository.roleOf(owner);
    if (!canOfferInMarketplace(role) || !(await this.repository.isApprovedOrganization(owner, 'supplier'))) {
      throw new ForbiddenException('marketplace:offer', role);
    }
    return role as VerificationRole;
  }

  async listCarts(owner: AgriTechOwner): Promise<Cart[]> {
    return this.repository.listCarts(owner);
  }

  async getCart(owner: AgriTechOwner, cartId: string): Promise<Cart> {
    const cart = await this.repository.getCart(owner, cartId);
    if (!cart) {
      throw new ResourceNotFoundException('cart');
    }
    return cart;
  }

  async addToCart(owner: AgriTechOwner, item: { productId: string; quantity: number }): Promise<Cart> {
    if (item.quantity <= 0) {
      throw new BadRequestException({ meta: { field: 'quantity' } });
    }
    return unwrap(await this.repository.addToCart(owner, item), 'cart');
  }

  async updateCartItem(owner: AgriTechOwner, cartId: string, productId: string, quantity: number): Promise<Cart> {
    return unwrap(await this.repository.updateCartItem(owner, cartId, productId, quantity), 'cart');
  }

  async removeCartItem(owner: AgriTechOwner, cartId: string, productId: string): Promise<Cart> {
    return unwrap(await this.repository.removeCartItem(owner, cartId, productId), 'cart');
  }

  async checkoutCart(owner: AgriTechOwner, cartId: string, input: CheckoutCartInput): Promise<CheckoutCartResult> {
    await this.requireBuyerRole(owner);
    return unwrap(await this.repository.checkoutCart(owner, cartId, input), 'cart');
  }

  async requestSample(owner: AgriTechOwner, productId: string): Promise<SampleRequest> {
    await this.requireBuyerRole(owner);
    return unwrap(await this.repository.requestSample(owner, productId), 'sample');
  }

  async listSamples(owner: AgriTechOwner): Promise<SampleRequest[]> {
    return this.repository.listSamples(owner);
  }

  async sampleUsage(owner: AgriTechOwner): Promise<{ used: number; limit: number; remaining: number }> {
    const used = await this.repository.sampleUsageThisMonth(owner);
    return { used, limit: maxMonthlySamples, remaining: Math.max(0, maxMonthlySamples - used) };
  }

  async addFavorite(owner: AgriTechOwner, productId: string): Promise<{ productId: string }> {
    return unwrap(await this.repository.addFavorite(owner, productId), 'favorite');
  }

  async removeFavorite(owner: AgriTechOwner, productId: string): Promise<{ productId: string }> {
    return unwrap(await this.repository.removeFavorite(owner, productId), 'favorite');
  }

  async listFavorites(owner: AgriTechOwner) {
    return this.repository.listFavorites(owner);
  }

  async addReview(owner: AgriTechOwner, productId: string, rating: number, comment?: string) {
    await this.requireBuyerRole(owner);
    return unwrap(await this.repository.addReview(owner, productId, rating, comment), 'review');
  }

  async listProductReviews(tenantId: string, productId: string) {
    return this.repository.listProductReviews(tenantId, productId);
  }

  async createRequest(
    owner: AgriTechOwner,
    input: Omit<BuyerRequest, 'id' | 'tenantId' | 'buyerUserId' | 'status' | 'createdAt' | 'updatedAt'>,
  ) {
    await this.requireBuyerRole(owner);
    return unwrap(await this.repository.createRequest(owner, input), 'request');
  }

  listRequests(tenantId: string, status?: string) {
    return this.repository.listRequests(tenantId, status);
  }

  listMyRequests(owner: AgriTechOwner) {
    return this.repository.listMyRequests(owner);
  }

  async makeOffer(
    owner: AgriTechOwner,
    requestId: string,
    priceUzs: number,
    deliveryTerms: DeliveryTerms,
    deliveryPriceUzs?: number,
    deliveryNote?: string,
    deliveryDays?: number,
  ) {
    await this.requireOfferRole(owner);
    return unwrap(
      await this.repository.makeOffer(
        owner,
        requestId,
        priceUzs,
        deliveryTerms,
        deliveryPriceUzs,
        deliveryNote,
        deliveryDays,
      ),
      'offer',
    );
  }

  async listOffers(owner: AgriTechOwner, requestId: string) {
    return unwrap(await this.repository.listOffers(owner, requestId), 'request');
  }

  async chooseOffer(owner: AgriTechOwner, requestId: string, offerId: string): Promise<OfferSelectionResult> {
    await this.requireBuyerRole(owner);
    return unwrap(await this.repository.chooseOffer(owner, requestId, offerId), 'offer');
  }

  async updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
  ): Promise<Contract> {
    await this.requireOfferRole(owner);
    return unwrap(await this.repository.updateContractDeliveryQuote(owner, contractId, input), 'contract');
  }

  async signContract(owner: AgriTechOwner, contractId: string): Promise<Contract> {
    await this.requireVerified(owner);
    return unwrap(await this.repository.signContract(owner, contractId), 'contract');
  }

  listContracts(owner: AgriTechOwner) {
    return this.repository.listContracts(owner);
  }

  listTenantContracts(tenantId: string) {
    return this.repository.listTenantContracts(tenantId);
  }

  async askAi(owner: AgriTechOwner, kind: AiConsultationKind, question: string) {
    return unwrap(await this.repository.askAi(owner, kind, question), 'ai');
  }

  async listAiConsultations(owner: AgriTechOwner) {
    return this.repository.listAiConsultations(owner);
  }

  async roleOf(owner: AgriTechOwner): Promise<VerificationRole | undefined> {
    return this.repository.roleOf(owner);
  }
}
