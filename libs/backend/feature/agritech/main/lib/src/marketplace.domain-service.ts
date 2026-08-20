// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  canBuyInMarketplace,
  canOfferInMarketplace,
  filterDemoBuyerRequests,
  isVerificationReviewReasonValid,
  type AgriTechOwner,
  type AddCartItemInput,
  type Cart,
  type CheckoutCartInput,
  type CheckoutCartResult,
  type Contract,
  type ContractDeliveryQuoteInput,
  type CreateBuyerRequestInput,
  type CreateRequestOfferInput,
  type MarketplaceRepository,
  type OperationResult,
  type OfferSelectionResult,
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
    // `ConflictException` publishes `field` as an RFC 9457 extension. Dropping
    // it turned every refusal into an unexplained 409: a buyer whose second
    // award was refused because the request is already decided read the same
    // body as one who replayed an idempotency key with a changed body.
    throw new ConflictException(label, result.field);
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
    expectedRevision: number,
    idempotencyKey: string,
    reason?: VerificationRejectionReason,
  ): Promise<Verification> {
    if (!isVerificationReviewReasonValid(decision, reason)) {
      throw new BadRequestException({ meta: { resourceType: 'verification', field: 'reason' } });
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new BadRequestException({ meta: { resourceType: 'verification', field: 'expectedRevision' } });
    }
    return unwrap(
      await this.repository.reviewVerification(
        tenantId,
        verificationId,
        decision,
        reviewedBy,
        expectedRevision,
        idempotencyKey,
        reason,
      ),
      'verification',
    );
  }

  async requireVerified(owner: AgriTechOwner): Promise<void> {
    const role = await this.repository.roleOf(owner);
    if (!role) {
      throw new ForbiddenException('verification');
    }
  }

  private async requireBuyerVerificationRole(owner: AgriTechOwner): Promise<VerificationRole> {
    const role = await this.repository.roleOf(owner);
    if (!canBuyInMarketplace(role)) {
      throw new ForbiddenException('marketplace:buy', role);
    }
    return role as VerificationRole;
  }

  private async requireOfferVerificationRole(owner: AgriTechOwner): Promise<VerificationRole> {
    const role = await this.repository.roleOf(owner);
    if (!canOfferInMarketplace(role)) {
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

  async addToCart(owner: AgriTechOwner, item: AddCartItemInput, idempotencyKey: string): Promise<Cart> {
    if (item.quantity <= 0) {
      throw new BadRequestException({ meta: { field: 'quantity' } });
    }
    await this.requireBuyerVerificationRole(owner);
    return unwrap(await this.repository.addToCart(owner, item, idempotencyKey), 'cart');
  }

  async updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<Cart> {
    await this.requireBuyerVerificationRole(owner);
    return unwrap(
      await this.repository.updateCartItem(owner, cartId, listingPublicationId, quantity, idempotencyKey),
      'cart',
    );
  }

  async removeCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<Cart> {
    await this.requireBuyerVerificationRole(owner);
    return unwrap(await this.repository.removeCartItem(owner, cartId, listingPublicationId, idempotencyKey), 'cart');
  }

  async checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
    idempotencyKey: string,
  ): Promise<CheckoutCartResult> {
    await this.requireBuyerVerificationRole(owner);
    return unwrap(await this.repository.checkoutCart(owner, cartId, input, idempotencyKey), 'cart');
  }

  async createRequest(owner: AgriTechOwner, input: CreateBuyerRequestInput, idempotencyKey: string) {
    await this.requireBuyerVerificationRole(owner);
    return unwrap(await this.repository.createRequest(owner, input, idempotencyKey), 'request');
  }

  /**
   * The reverse-auction feed. A tenant where nobody has posted a request yet
   * falls back to the demo feed: the filter chips and the offer flow need rows to
   * act on, and an empty feed on a new tenant reads as a broken page. The
   * unfiltered read decides it, so a status filter that matches nothing keeps
   * showing an honest empty result.
   */
  async listRequests(tenantId: string, status?: string) {
    const requests = await this.repository.listRequests(tenantId, status);
    if (requests.length > 0) {
      return requests;
    }
    const published = status ? await this.repository.listRequests(tenantId) : requests;
    return published.length > 0 ? requests : filterDemoBuyerRequests(status);
  }

  listMyRequests(owner: AgriTechOwner) {
    return this.repository.listMyRequests(owner);
  }

  async makeOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    input: CreateRequestOfferInput,
    idempotencyKey: string,
  ) {
    await this.requireOfferVerificationRole(owner);
    return unwrap(await this.repository.makeOffer(owner, requestPublicId, input, idempotencyKey), 'offer');
  }

  async listOffers(owner: AgriTechOwner, requestId: string) {
    return unwrap(await this.repository.listOffers(owner, requestId), 'request');
  }

  async chooseOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    offerId: string,
    idempotencyKey: string,
  ): Promise<OfferSelectionResult> {
    await this.requireBuyerVerificationRole(owner);
    return unwrap(await this.repository.chooseOffer(owner, requestPublicId, offerId, idempotencyKey), 'offer');
  }

  async updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
    idempotencyKey: string,
  ): Promise<Contract> {
    await this.requireOfferVerificationRole(owner);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new BadRequestException({ meta: { field: 'expectedRevision', resourceType: 'contract' } });
    }
    return unwrap(
      await this.repository.updateContractDeliveryQuote(owner, contractId, input, idempotencyKey),
      'contract',
    );
  }

  listContracts(owner: AgriTechOwner) {
    return this.repository.listContracts(owner);
  }

  listTenantContracts(tenantId: string) {
    return this.repository.listTenantContracts(tenantId);
  }
}
