// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import { Inject, Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ConflictException, ForbiddenException, ResourceNotFoundException } from '@app/backend-common-exception';
import {
  MAX_MONTHLY_SAMPLES,
  MarketplaceRepositoryInjectToken,
  isSampleRequestAllowed,
  isVerificationAllowed,
  type AgriTechOwner,
  type AiConsultationKind,
  type BuyerRequest,
  type Cart,
  type Contract,
  type MarketplaceRepository,
  type OperationResult,
  type SampleRequest,
  type SubmitVerificationInput,
  type Verification,
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
    throw new BadRequestException(label);
  }
  if (result.status === 'forbidden') {
    throw new ForbiddenException(label);
  }
  throw new BadRequestException(label);
}

@Injectable()
export class MarketplaceService {
  constructor(
    @Inject(MarketplaceRepositoryInjectToken)
    private readonly repository: MarketplaceRepository,
  ) {}

  // ---- Verification ----
  async getVerification(owner: AgriTechOwner): Promise<Verification | undefined> {
    return this.repository.getVerification(owner);
  }

  async listVerifications(tenantId: string): Promise<Verification[]> {
    return this.repository.listVerifications(tenantId);
  }

  async reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    reason?: string,
  ): Promise<Verification> {
    return unwrap(await this.repository.reviewVerification(tenantId, verificationId, decision, reviewedBy, reason), 'verification');
  }

  async submitVerification(owner: AgriTechOwner, input: SubmitVerificationInput): Promise<Verification> {
    if (!isVerificationAllowed((await this.repository.getVerification(owner))?.status ?? 'none')) {
      throw new ConflictException('verification');
    }
    if (input.documents.length === 0) {
      throw new BadRequestException('documents');
    }
    return unwrap(await this.repository.submitVerification(owner, input), 'verification');
  }

  async requireVerified(owner: AgriTechOwner): Promise<void> {
    const verified = await this.repository.isVerified(owner);
    if (!verified) {
      throw new ForbiddenException('verification');
    }
  }

  // ---- Cart ----
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

  async addToCart(owner: AgriTechOwner, sellerId: string, item: { productId: string; quantity: number }): Promise<Cart> {
    if (item.quantity <= 0) {
      throw new BadRequestException('quantity');
    }
    return unwrap(await this.repository.addToCart(owner, sellerId, item), 'cart');
  }

  async updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<Cart> {
    return unwrap(await this.repository.updateCartItem(owner, cartId, productId, quantity), 'cart');
  }

  async removeCartItem(owner: AgriTechOwner, cartId: string, productId: string): Promise<Cart> {
    return unwrap(await this.repository.removeCartItem(owner, cartId, productId), 'cart');
  }

  async checkoutCart(owner: AgriTechOwner, cartId: string): Promise<{ cartId: string; orderId: string }> {
    await this.requireVerified(owner);
    return unwrap(await this.repository.checkoutCart(owner, cartId), 'cart');
  }

  // ---- Samples ----
  async requestSample(
    owner: AgriTechOwner,
    productId: string,
    sellerId: string,
  ): Promise<SampleRequest> {
    const verified = await this.repository.isVerified(owner);
    const used = await this.repository.sampleUsageThisMonth(owner);
    if (!isSampleRequestAllowed({ verified, requestsThisMonth: used })) {
      throw new BadRequestException('samples');
    }
    return unwrap(await this.repository.requestSample(owner, productId, sellerId), 'sample');
  }

  async listSamples(owner: AgriTechOwner): Promise<SampleRequest[]> {
    return this.repository.listSamples(owner);
  }

  async sampleUsage(owner: AgriTechOwner): Promise<{ used: number; limit: number; remaining: number }> {
    const used = await this.repository.sampleUsageThisMonth(owner);
    return { used, limit: MAX_MONTHLY_SAMPLES, remaining: Math.max(0, MAX_MONTHLY_SAMPLES - used) };
  }

  // ---- Favorites ----
  async addFavorite(owner: AgriTechOwner, productId: string): Promise<{ productId: string }> {
    return unwrap(await this.repository.addFavorite(owner, productId), 'favorite');
  }

  async removeFavorite(owner: AgriTechOwner, productId: string): Promise<{ productId: string }> {
    return unwrap(await this.repository.removeFavorite(owner, productId), 'favorite');
  }

  async listFavorites(owner: AgriTechOwner) {
    return this.repository.listFavorites(owner);
  }

  // ---- Reviews ----
  async addReview(owner: AgriTechOwner, productId: string, rating: number, comment?: string) {
    return unwrap(await this.repository.addReview(owner, productId, rating, comment), 'review');
  }

  async listProductReviews(tenantId: string, productId: string) {
    return this.repository.listProductReviews(tenantId, productId);
  }

  // ---- Requests (reverse auction) ----
  async createRequest(
    owner: AgriTechOwner,
    input: Omit<BuyerRequest, 'id' | 'tenantId' | 'buyerUserId' | 'status' | 'createdAt' | 'updatedAt'>,
  ) {
    await this.requireVerified(owner);
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
    deliveryNote?: string,
    deliveryDays?: number,
  ) {
    return unwrap(await this.repository.makeOffer(owner, requestId, priceUzs, deliveryNote, deliveryDays), 'offer');
  }

  async listOffers(tenantId: string, requestId: string) {
    return this.repository.listOffers(tenantId, requestId);
  }

  async chooseOffer(owner: AgriTechOwner, requestId: string, offerId: string) {
    return unwrap(await this.repository.chooseOffer(owner, requestId, offerId), 'offer');
  }

  // ---- Contracts ----
  async createContract(
    owner: AgriTechOwner,
    input: {
      buyerUserId: string;
      sellerUserId: string;
      subject: string;
      amountUzs: number;
      deliveryTerms: 'pickup' | 'seller_delivery' | 'by_agreement';
      deliveryPriceUzs?: number;
      factoringEnabled: boolean;
    },
  ) {
    await this.requireVerified(owner);
    return unwrap(await this.repository.createContract(owner, input), 'contract');
  }

  async signContract(owner: AgriTechOwner, contractId: string): Promise<Contract> {
    return unwrap(await this.repository.signContract(owner, contractId), 'contract');
  }

  listContracts(owner: AgriTechOwner) {
    return this.repository.listContracts(owner);
  }

  listTenantContracts(tenantId: string) {
    return this.repository.listTenantContracts(tenantId);
  }

  // ---- AI ----
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
