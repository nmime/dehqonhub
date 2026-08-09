// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AiConsultation,
  AiConsultationKind,
  BuyerRequest,
  Cart,
  CartItem,
  Contract,
  Favorite,
  MarketplaceRepository,
  OperationResult,
  RequestOffer,
  Review,
  SampleRequest,
  SubmitVerificationInput,
  Verification,
  VerificationRole,
} from '@app/backend-feature-agritech-shared';
import { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import { randomUUID } from 'node:crypto';
import {
  AiConsultationEntity,
  BuyerRequestEntity,
  CartEntity,
  ContractEntity,
  FavoriteEntity,
  RequestOfferEntity,
  ReviewEntity,
  SampleRequestEntity,
  VerificationEntity,
} from '../entities/marketplace.entity';
import { ProductEntity } from '../entities/product.entity';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });

const toVerification = (e: VerificationEntity): Verification => ({
  id: e.id,
  tenantId: e.tenantId,
  userId: e.userId,
  role: e.role,
  level: e.level,
  status: e.status,
  oneIdLinked: e.oneIdLinked,
  documents: e.documents,
  reviewedBy: e.reviewedBy ?? undefined,
  reviewedAt: e.reviewedAt ?? undefined,
  rejectionReason: e.rejectionReason ?? undefined,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toCart = (e: CartEntity): Cart => ({
  id: e.id,
  tenantId: e.tenantId,
  userId: e.userId,
  sellerId: e.sellerId,
  items: e.items,
  status: e.status,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toSample = (e: SampleRequestEntity): SampleRequest => ({
  id: e.id,
  tenantId: e.tenantId,
  userId: e.userId,
  productId: e.productId,
  sellerId: e.sellerId,
  status: e.status,
  createdAt: e.createdAt,
});

const toFavorite = (e: FavoriteEntity): Favorite => ({
  tenantId: e.tenantId,
  userId: e.userId,
  productId: e.productId,
  createdAt: e.createdAt,
});

const toReview = (e: ReviewEntity): Review => ({
  id: e.id,
  tenantId: e.tenantId,
  productId: e.productId,
  userId: e.userId,
  rating: e.rating,
  comment: e.comment ?? undefined,
  createdAt: e.createdAt,
});

const toRequest = (e: BuyerRequestEntity): BuyerRequest => ({
  id: e.id,
  tenantId: e.tenantId,
  buyerUserId: e.buyerUserId,
  title: e.title,
  product: e.product ?? undefined,
  volume: e.volume ?? undefined,
  region: e.region,
  deadline: e.deadline ?? undefined,
  budgetUzs: e.budgetUzs != null ? Number(e.budgetUzs) : undefined,
  requirements: e.requirements ?? undefined,
  status: e.status,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toOffer = (e: RequestOfferEntity): RequestOffer => ({
  id: e.id,
  requestId: e.requestId,
  tenantId: e.tenantId,
  sellerUserId: e.sellerUserId,
  priceUzs: Number(e.priceUzs),
  deliveryNote: e.deliveryNote ?? undefined,
  deliveryDays: e.deliveryDays ?? undefined,
  status: e.status,
  createdAt: e.createdAt,
});

const toContract = (e: ContractEntity): Contract => ({
  id: e.id,
  tenantId: e.tenantId,
  buyerUserId: e.buyerUserId,
  sellerUserId: e.sellerUserId,
  subject: e.subject,
  amountUzs: Number(e.amountUzs),
  deliveryTerms: e.deliveryTerms,
  deliveryPriceUzs: e.deliveryPriceUzs != null ? Number(e.deliveryPriceUzs) : undefined,
  factoringEnabled: e.factoringEnabled,
  status: e.status,
  signedAt: e.signedAt ?? undefined,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toAi = (e: AiConsultationEntity): AiConsultation => ({
  id: e.id,
  tenantId: e.tenantId,
  userId: e.userId,
  kind: e.kind,
  question: e.question,
  answer: e.answer,
  productIds: e.productIds,
  createdAt: e.createdAt,
});

@Injectable()
export class PostgresMarketplaceRepository implements MarketplaceRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  // ---- Verification ----
  async getVerification(owner: AgriTechOwner): Promise<Verification | undefined> {
    const entity = await this.em.findOne(VerificationEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    return entity ? toVerification(entity) : undefined;
  }

  async submitVerification(
    owner: AgriTechOwner,
    input: SubmitVerificationInput,
  ): Promise<OperationResult<Verification>> {
    let entity = await this.em.findOne(VerificationEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    if (entity && entity.status === 'verified') {
      return { status: 'conflict', field: 'status' };
    }
    if (!entity) {
      entity = new VerificationEntity();
      entity.id = randomUUID();
      entity.tenantId = owner.tenantId;
      entity.userId = owner.userId;
      this.em.persist(entity);
    }
    entity.role = input.role;
    entity.level = input.level;
    entity.oneIdLinked = input.oneIdLinked;
    entity.documents = input.documents;
    entity.status = 'pending';
    entity.reviewedBy = null;
    entity.reviewedAt = null;
    entity.rejectionReason = null;
    entity.updatedAt = new Date();
    await this.em.flush();
    return ok(toVerification(entity));
  }

  async reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    reason?: string,
  ): Promise<OperationResult<Verification>> {
    const entity = await this.em.findOne(VerificationEntity, {
      tenantId,
      id: verificationId,
    });
    if (!entity) {
      return { status: 'not_found' };
    }
    if (entity.status !== 'pending') {
      return { status: 'invalid_state' };
    }
    entity.status = decision === 'verified' ? 'verified' : 'rejected';
    entity.reviewedBy = reviewedBy;
    entity.reviewedAt = new Date();
    entity.rejectionReason = decision === 'rejected' ? (reason ?? 'Documents did not meet verification criteria') : null;
    entity.updatedAt = new Date();
    await this.em.flush();
    return ok(toVerification(entity));
  }

  listVerifications(tenantId: string): Promise<Verification[]> {
    return this.em.find(VerificationEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } }).then((rows) =>
      rows.map(toVerification),
    );
  }

  async isVerified(owner: AgriTechOwner): Promise<boolean> {
    const entity = await this.em.findOne(VerificationEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    return entity?.status === 'verified';
  }

  // ---- Cart ----
  async getCart(owner: AgriTechOwner, cartId: string): Promise<Cart | undefined> {
    const entity = await this.em.findOne(CartEntity, {
      tenantId: owner.tenantId,
      id: cartId,
      userId: owner.userId,
    });
    return entity ? toCart(entity) : undefined;
  }

  listCarts(owner: AgriTechOwner): Promise<Cart[]> {
    return this.em
      .find(
        CartEntity,
        { tenantId: owner.tenantId, userId: owner.userId, status: 'open' },
        { orderBy: { updatedAt: 'DESC' } },
      )
      .then((rows) => rows.map(toCart));
  }

  async addToCart(owner: AgriTechOwner, sellerId: string, item: CartItem): Promise<OperationResult<Cart>> {
    const product = await this.em.findOne(ProductEntity, { id: item.productId });
    if (!product) {
      return { status: 'not_found', field: 'productId' };
    }
    let cart = await this.em.findOne(CartEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
      sellerId,
      status: 'open',
    });
    if (!cart) {
      cart = new CartEntity();
      cart.id = randomUUID();
      cart.tenantId = owner.tenantId;
      cart.userId = owner.userId;
      cart.sellerId = sellerId;
      cart.items = [];
      this.em.persist(cart);
    }
    const existing = cart.items.find((i) => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    cart.updatedAt = new Date();
    await this.em.flush();
    return ok(toCart(cart));
  }

  async updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<OperationResult<Cart>> {
    const cart = await this.em.findOne(CartEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
      id: cartId,
      status: 'open',
    });
    if (!cart) {
      return { status: 'not_found' };
    }
    const existing = cart.items.find((i) => i.productId === productId);
    if (!existing) {
      return { status: 'not_found', field: 'productId' };
    }
    if (quantity <= 0) {
      cart.items = cart.items.filter((i) => i.productId !== productId);
    } else {
      existing.quantity = quantity;
    }
    cart.updatedAt = new Date();
    await this.em.flush();
    return ok(toCart(cart));
  }

  async removeCartItem(owner: AgriTechOwner, cartId: string, productId: string): Promise<OperationResult<Cart>> {
    return this.updateCartItem(owner, cartId, productId, 0);
  }

  async checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
  ): Promise<OperationResult<{ cartId: string; orderId: string }>> {
    const cart = await this.em.findOne(CartEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
      id: cartId,
      status: 'open',
    });
    if (!cart) {
      return { status: 'not_found' };
    }
    if (cart.items.length === 0) {
      return { status: 'invalid_state', field: 'items' };
    }
    cart.status = 'ordered';
    cart.updatedAt = new Date();
    await this.em.flush();
    return ok({ cartId: cart.id, orderId: randomUUID() });
  }

  // ---- Samples ----
  async requestSample(
    owner: AgriTechOwner,
    productId: string,
    sellerId: string,
  ): Promise<OperationResult<SampleRequest>> {
    const product = await this.em.findOne(ProductEntity, { id: productId });
    if (!product) {
      return { status: 'not_found', field: 'productId' };
    }
    const entity = new SampleRequestEntity();
    entity.id = randomUUID();
    entity.tenantId = owner.tenantId;
    entity.userId = owner.userId;
    entity.productId = productId;
    entity.sellerId = sellerId;
    entity.status = 'pending';
    this.em.persist(entity);
    await this.em.flush();
    return ok(toSample(entity));
  }

  listSamples(owner: AgriTechOwner): Promise<SampleRequest[]> {
    return this.em
      .find(
        SampleRequestEntity,
        { tenantId: owner.tenantId, userId: owner.userId },
        { orderBy: { createdAt: 'DESC' } },
      )
      .then((rows) => rows.map(toSample));
  }

  async sampleUsageThisMonth(owner: AgriTechOwner): Promise<number> {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const count = await this.em.count(SampleRequestEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
      createdAt: { $gte: start },
    });
    return count;
  }

  // ---- Favorites ----
  async addFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>> {
    const product = await this.em.findOne(ProductEntity, { id: productId });
    if (!product) {
      return { status: 'not_found', field: 'productId' };
    }
    const existing = await this.em.findOne(FavoriteEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
      productId,
    });
    if (!existing) {
      const entity = new FavoriteEntity();
      entity.tenantId = owner.tenantId;
      entity.userId = owner.userId;
      entity.productId = productId;
      this.em.persist(entity);
      await this.em.flush();
    }
    return ok({ productId });
  }

  async removeFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>> {
    await this.em.nativeDelete(FavoriteEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
      productId,
    });
    return ok({ productId });
  }

  listFavorites(owner: AgriTechOwner): Promise<Favorite[]> {
    return this.em
      .find(FavoriteEntity, { tenantId: owner.tenantId, userId: owner.userId }, { orderBy: { createdAt: 'DESC' } })
      .then((rows) => rows.map(toFavorite));
  }

  // ---- Reviews ----
  async addReview(
    owner: AgriTechOwner,
    productId: string,
    rating: number,
    comment?: string,
  ): Promise<OperationResult<Review>> {
    if (rating < 1 || rating > 5) {
      return { status: 'invalid_state', field: 'rating' };
    }
    const product = await this.em.findOne(ProductEntity, { id: productId });
    if (!product) {
      return { status: 'not_found', field: 'productId' };
    }
    const entity = new ReviewEntity();
    entity.id = randomUUID();
    entity.tenantId = owner.tenantId;
    entity.productId = productId;
    entity.userId = owner.userId;
    entity.rating = rating;
    entity.comment = comment ?? null;
    this.em.persist(entity);
    await this.em.flush();
    return ok(toReview(entity));
  }

  listProductReviews(tenantId: string, productId: string): Promise<Review[]> {
    return this.em
      .find(ReviewEntity, { tenantId, productId }, { orderBy: { createdAt: 'DESC' } })
      .then((rows) => rows.map(toReview));
  }

  // ---- Requests (reverse auction) ----
  async createRequest(
    owner: AgriTechOwner,
    input: Omit<BuyerRequest, 'id' | 'tenantId' | 'buyerUserId' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<OperationResult<BuyerRequest>> {
    const entity = new BuyerRequestEntity();
    entity.id = randomUUID();
    entity.tenantId = owner.tenantId;
    entity.buyerUserId = owner.userId;
    entity.title = input.title;
    entity.product = input.product ?? null;
    entity.volume = input.volume ?? null;
    entity.region = input.region;
    entity.deadline = input.deadline ?? null;
    entity.budgetUzs = input.budgetUzs ?? null;
    entity.requirements = input.requirements ?? null;
    entity.status = 'open';
    this.em.persist(entity);
    await this.em.flush();
    return ok(toRequest(entity));
  }

  listRequests(tenantId: string, status?: string): Promise<BuyerRequest[]> {
    const where: Record<string, unknown> = { tenantId };
    if (status && status !== 'all') {
      where.status = status;
    }
    return this.em
      .find(BuyerRequestEntity, where, { orderBy: { createdAt: 'DESC' } })
      .then((rows) => rows.map(toRequest));
  }

  listMyRequests(owner: AgriTechOwner): Promise<BuyerRequest[]> {
    return this.em
      .find(
        BuyerRequestEntity,
        { tenantId: owner.tenantId, buyerUserId: owner.userId },
        { orderBy: { createdAt: 'DESC' } },
      )
      .then((rows) => rows.map(toRequest));
  }

  async makeOffer(
    owner: AgriTechOwner,
    requestId: string,
    priceUzs: number,
    deliveryNote?: string,
    deliveryDays?: number,
  ): Promise<OperationResult<RequestOffer>> {
    const request = await this.em.findOne(BuyerRequestEntity, {
      tenantId: owner.tenantId,
      id: requestId,
    });
    if (!request) {
      return { status: 'not_found' };
    }
    if (request.status !== 'open' && request.status !== 'offering') {
      return { status: 'invalid_state' };
    }
    if (priceUzs <= 0) {
      return { status: 'invalid_state', field: 'priceUzs' };
    }
    const entity = new RequestOfferEntity();
    entity.id = randomUUID();
    entity.requestId = requestId;
    entity.tenantId = owner.tenantId;
    entity.sellerUserId = owner.userId;
    entity.priceUzs = priceUzs;
    entity.deliveryNote = deliveryNote ?? null;
    entity.deliveryDays = deliveryDays ?? null;
    entity.status = 'pending';
    if (request.status === 'open') {
      request.status = 'offering';
      request.updatedAt = new Date();
    }
    this.em.persist(entity);
    await this.em.flush();
    return ok(toOffer(entity));
  }

  listOffers(tenantId: string, requestId: string): Promise<RequestOffer[]> {
    return this.em
      .find(RequestOfferEntity, { tenantId, requestId }, { orderBy: { createdAt: 'ASC' } })
      .then((rows) => rows.map(toOffer));
  }

  async chooseOffer(
    owner: AgriTechOwner,
    requestId: string,
    offerId: string,
  ): Promise<OperationResult<{ requestId: string; offerId: string; sellerUserId: string }>> {
    const request = await this.em.findOne(BuyerRequestEntity, {
      tenantId: owner.tenantId,
      id: requestId,
      buyerUserId: owner.userId,
    });
    if (!request) {
      return { status: 'not_found' };
    }
    if (request.status !== 'offering' && request.status !== 'open') {
      return { status: 'invalid_state' };
    }
    const offer = await this.em.findOne(RequestOfferEntity, {
      tenantId: owner.tenantId,
      id: offerId,
      requestId,
    });
    if (!offer) {
      return { status: 'not_found', field: 'offerId' };
    }
    if (offer.status !== 'pending') {
      return { status: 'invalid_state' };
    }
    offer.status = 'accepted';
    request.status = 'selected';
    request.updatedAt = new Date();
    await this.em.flush();
    return ok({ requestId, offerId, sellerUserId: offer.sellerUserId });
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
  ): Promise<OperationResult<Contract>> {
    if (input.amountUzs <= 0) {
      return { status: 'invalid_state', field: 'amountUzs' };
    }
    const entity = new ContractEntity();
    entity.id = randomUUID();
    entity.tenantId = owner.tenantId;
    entity.buyerUserId = input.buyerUserId;
    entity.sellerUserId = input.sellerUserId;
    entity.subject = input.subject;
    entity.amountUzs = input.amountUzs;
    entity.deliveryTerms = input.deliveryTerms;
    entity.deliveryPriceUzs = input.deliveryPriceUzs ?? null;
    entity.factoringEnabled = input.factoringEnabled;
    entity.status = 'draft';
    this.em.persist(entity);
    await this.em.flush();
    return ok(toContract(entity));
  }

  async signContract(owner: AgriTechOwner, contractId: string): Promise<OperationResult<Contract>> {
    const entity = await this.em.findOne(ContractEntity, {
      tenantId: owner.tenantId,
      id: contractId,
    });
    if (!entity) {
      return { status: 'not_found' };
    }
    if (entity.status !== 'draft') {
      return { status: 'invalid_state' };
    }
    entity.status = 'signed';
    entity.signedAt = new Date();
    entity.updatedAt = new Date();
    await this.em.flush();
    return ok(toContract(entity));
  }

  listContracts(owner: AgriTechOwner): Promise<Contract[]> {
    return this.em
      .find(
        ContractEntity,
        {
          tenantId: owner.tenantId,
          $or: [{ buyerUserId: owner.userId }, { sellerUserId: owner.userId }],
        },
        { orderBy: { updatedAt: 'DESC' } },
      )
      .then((rows) => rows.map(toContract));
  }

  listTenantContracts(tenantId: string): Promise<Contract[]> {
    return this.em
      .find(ContractEntity, { tenantId }, { orderBy: { updatedAt: 'DESC' } })
      .then((rows) => rows.map(toContract));
  }

  // ---- AI consultant ----
  async askAi(
    owner: AgriTechOwner,
    kind: AiConsultationKind,
    question: string,
  ): Promise<OperationResult<AiConsultation>> {
    const catalog = await this.em.find(ProductEntity, { status: 'active' }, { limit: 50 });
    const answer = buildAiAnswer(kind, question, catalog);
    const entity = new AiConsultationEntity();
    entity.id = randomUUID();
    entity.tenantId = owner.tenantId;
    entity.userId = owner.userId;
    entity.kind = kind;
    entity.question = question;
    entity.answer = answer.answer;
    entity.productIds = answer.productIds;
    this.em.persist(entity);
    await this.em.flush();
    return ok(toAi(entity));
  }

  listAiConsultations(owner: AgriTechOwner): Promise<AiConsultation[]> {
    return this.em
      .find(
        AiConsultationEntity,
        { tenantId: owner.tenantId, userId: owner.userId },
        { orderBy: { createdAt: 'DESC' } },
      )
      .then((rows) => rows.map(toAi));
  }

  async roleOf(owner: AgriTechOwner): Promise<VerificationRole | undefined> {
    const entity = await this.em.findOne(VerificationEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    return entity?.status === 'verified' ? entity.role : undefined;
  }
}

function buildAiAnswer(
  kind: AiConsultationKind,
  question: string,
  catalog: ProductEntity[],
): { answer: string; productIds: string[] } {
  const normalized = question.toLowerCase();
  if (kind === 'find_cheaper' || normalized.includes('cheap') || normalized.includes('cheaper')) {
    const sorted = [...catalog].sort((a, b) => a.priceUzs - b.priceUzs);
    if (sorted.length === 0) {
      return { answer: 'There are no products in the catalog yet. Check back soon.', productIds: [] };
    }
    const top = sorted.slice(0, 3);
    const cheapest = top[0] as ProductEntity;
    const priciest = top[top.length - 1] as ProductEntity;
    return {
      answer: `Here are the ${top.length} most affordable options currently listed in your region's catalog. Prices range from ${formatUzs(
        cheapest.priceUzs,
      )} to ${formatUzs(priciest.priceUzs)}.`,
      productIds: top.map((p) => p.id),
    };
  }
  if (kind === 'season_advice' || normalized.includes('season') || normalized.includes('sow') || normalized.includes('plant')) {
    return {
      answer:
        'For a beginner farmer in Uzbekistan: spring (Feb–Apr) sow cotton, wheat, and vegetables; autumn (Aug–Oct) is for winter wheat and fruit-tree planting. Match each crop to a certified seed and confirm the sowing season on the product card before buying.',
      productIds: [],
    };
  }
  if (kind === 'recommendation' || normalized.includes('need') || normalized.includes('recommend')) {
    const seeds = catalog.filter((p) => p.category === 'seed');
    if (seeds.length === 0) {
      return {
        answer: 'To start, look for certified seeds matched to your region and season, plus fertilizer and irrigation equipment. No seed listings are published yet.',
        productIds: [],
      };
    }
    const top = seeds.slice(0, 3);
    return {
      answer: `Based on your question, these certified seed products are a strong starting point for a small farm. Always request a sample first to verify quality before committing to a full order.`,
      productIds: top.map((p) => p.id),
    };
  }
  return {
    answer:
      'I can help you pick seeds for your region, understand what a beginner farmer needs, and find cheaper offers. Ask me a specific question about crops, equipment, or seasonal planning.',
    productIds: [],
  };
}

const formatUzs = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ');
