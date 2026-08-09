// @requirements REQ-AGRITECH-ORDER-003
import { EntityManager, LockMode, type FilterQuery } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AiConsultation,
  AiConsultationAnswer,
  AiConsultationKind,
  BuyerRequest,
  Cart,
  CartItem,
  CheckoutCartInput,
  CheckoutCartResult,
  Contract,
  ContractLine,
  Favorite,
  MarketplaceRepository,
  OperationResult,
  OfferSelectionResult,
  RequestOffer,
  Review,
  SampleRequest,
  Verification,
  VerificationRole,
  VerificationRejectionReason,
} from '@app/backend-feature-agritech-shared';
import {
  isVerificationReviewReasonValid,
  maxMonthlySamples,
  type AgriTechOwner,
} from '@app/backend-feature-agritech-shared';
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
import { AgriTechPartnerEntity } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });
const maximumMarketplaceUzs = 9_999_999_999_999;
const maximumDeliveryDays = 365;

const currentMonthStart = (): Date => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
};

const hasApprovedOrganization = async (
  em: EntityManager,
  owner: AgriTechOwner,
  kind: 'buyer' | 'supplier',
  lock = false,
): Promise<boolean> =>
  Boolean(
    await em.findOne(
      AgriTechPartnerEntity,
      {
        tenantId: owner.tenantId,
        ownerUserId: owner.userId,
        kind,
        status: 'approved',
      },
      lock ? { lockMode: LockMode.PESSIMISTIC_READ } : undefined,
    ),
  );

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
  budgetUzs: e.budgetUzs === null ? undefined : Number(e.budgetUzs),
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
  deliveryTerms: e.deliveryTerms,
  deliveryPriceUzs: e.deliveryPriceUzs === null ? undefined : Number(e.deliveryPriceUzs),
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
  sourceType: e.sourceType ?? undefined,
  sourceId: e.sourceId ?? undefined,
  subject: e.subject,
  amountUzs: Number(e.amountUzs),
  lines: e.lines,
  deliveryTerms: e.deliveryTerms,
  deliveryPriceUzs: e.deliveryPriceUzs === null ? undefined : Number(e.deliveryPriceUzs),
  deliveryNote: e.deliveryNote ?? undefined,
  deliveryDays: e.deliveryDays ?? undefined,
  factoringEnabled: false,
  status: e.status,
  buyerSignedAt: e.buyerSignedAt ?? undefined,
  sellerSignedAt: e.sellerSignedAt ?? undefined,
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

interface ContractDraftInput {
  tenantId: string;
  buyerUserId: string;
  sellerUserId: string;
  sourceType: 'cart_checkout' | 'offer_selection';
  sourceId: string;
  subject: string;
  amountUzs: number;
  lines?: ContractLine[];
  deliveryTerms: 'pickup' | 'seller_delivery' | 'by_agreement';
  deliveryPriceUzs?: number;
  deliveryNote?: string;
  deliveryDays?: number;
}

const createDraftContract = (input: ContractDraftInput): ContractEntity => {
  const entity = new ContractEntity();
  entity.id = randomUUID();
  entity.tenantId = input.tenantId;
  entity.buyerUserId = input.buyerUserId;
  entity.sellerUserId = input.sellerUserId;
  entity.sourceType = input.sourceType;
  entity.sourceId = input.sourceId;
  entity.subject = input.subject;
  entity.amountUzs = input.amountUzs;
  entity.lines = input.lines ?? [];
  entity.deliveryTerms = input.deliveryTerms;
  entity.deliveryPriceUzs = input.deliveryPriceUzs ?? null;
  entity.deliveryNote = input.deliveryNote ?? null;
  entity.deliveryDays = input.deliveryDays ?? null;
  entity.factoringEnabled = false;
  entity.status = 'draft';
  return entity;
};

type ContractParty = 'buyer' | 'seller' | 'self';

const contractPartyFor = (entity: ContractEntity, userId: string): ContractParty | undefined => {
  const isBuyer = entity.buyerUserId === userId;
  const isSeller = entity.sellerUserId === userId;
  if (isBuyer && isSeller) {
    return 'self';
  }
  if (isBuyer) {
    return 'buyer';
  }
  return isSeller ? 'seller' : undefined;
};

const hasPartySigned = (entity: ContractEntity, party: Exclude<ContractParty, 'self'>): boolean =>
  Boolean(party === 'buyer' ? entity.buyerSignedAt : entity.sellerSignedAt);

type ContractSigningDecision = { party: Exclude<ContractParty, 'self'> } | { result: OperationResult<Contract> };

const contractSigningDecision = (entity: ContractEntity, userId: string): ContractSigningDecision => {
  const party = contractPartyFor(entity, userId);
  if (!party) {
    return { result: { status: 'forbidden' } };
  }
  if (party === 'self') {
    return { result: { status: 'invalid_state', field: 'parties' } };
  }
  if (['cancelled', 'completed', 'legacy_review_required'].includes(entity.status)) {
    return { result: { status: 'invalid_state' } };
  }
  if (entity.status === 'active' || hasPartySigned(entity, party)) {
    return { result: ok(toContract(entity)) };
  }
  if (entity.deliveryTerms === 'seller_delivery' && Number(entity.deliveryPriceUzs) <= 0) {
    return { result: { status: 'invalid_state', field: 'deliveryPriceUzs' } };
  }
  return { party };
};

const recordPartySignature = (entity: ContractEntity, party: Exclude<ContractParty, 'self'>, signedAt: Date): void => {
  if (party === 'buyer') {
    entity.buyerSignedAt = signedAt;
  } else {
    entity.sellerSignedAt = signedAt;
  }
};

const commitCartContractInventory = async (
  em: EntityManager,
  entity: ContractEntity,
): Promise<OperationResult<void>> => {
  if (entity.sourceType !== 'cart_checkout') {
    return ok(undefined);
  }

  const requiredByProduct = new Map<string, number>();
  for (const line of entity.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return { status: 'invalid_state', field: 'lines' };
    }
    requiredByProduct.set(line.productId, (requiredByProduct.get(line.productId) ?? 0) + line.quantity);
  }
  if (requiredByProduct.size === 0) {
    return { status: 'invalid_state', field: 'lines' };
  }

  const sellerPartners = await em.find(
    AgriTechPartnerEntity,
    {
      tenantId: entity.tenantId,
      ownerUserId: entity.sellerUserId,
      kind: 'supplier',
      status: 'approved',
    },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (sellerPartners.length === 0) {
    return { status: 'forbidden', field: 'sellerUserId' };
  }

  const products = await em.find(
    ProductEntity,
    {
      tenantId: entity.tenantId,
      id: { $in: [...requiredByProduct.keys()] },
      supplierId: { $in: sellerPartners.map(({ id }) => id) },
    },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  );
  const productsById = new Map(products.map((product) => [product.id, product]));
  for (const [productId, quantity] of requiredByProduct) {
    const product = productsById.get(productId);
    if (!product || product.status !== 'active' || quantity > product.stockQuantity) {
      return { status: 'conflict', field: 'stockQuantity' };
    }
  }

  for (const [productId, quantity] of requiredByProduct) {
    const product = productsById.get(productId);
    if (!product) {
      return { status: 'conflict', field: 'stockQuantity' };
    }
    product.stockQuantity -= quantity;
    if (product.stockQuantity === 0) {
      product.status = 'out_of_stock';
    }
    product.updatedAt = new Date();
  }
  return ok(undefined);
};

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

  async reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    reason?: VerificationRejectionReason,
  ): Promise<OperationResult<Verification>> {
    if (!isVerificationReviewReasonValid(decision, reason)) {
      return { status: 'invalid_state', field: 'reason' };
    }
    return this.em.transactional(async (em) => {
      const entity = await em.findOne(
        VerificationEntity,
        {
          tenantId,
          id: verificationId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!entity) {
        return { status: 'not_found' };
      }
      if (entity.status !== 'pending') {
        return { status: 'conflict', field: 'status' };
      }
      entity.status = decision === 'verified' ? 'verified' : 'rejected';
      entity.reviewedBy = reviewedBy;
      entity.reviewedAt = new Date();
      entity.rejectionReason = decision === 'rejected' ? (reason as VerificationRejectionReason) : null;
      entity.updatedAt = new Date();
      await em.flush();
      return ok(toVerification(entity));
    });
  }

  listVerifications(tenantId: string): Promise<Verification[]> {
    return this.em
      .find(VerificationEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } })
      .then((rows) => rows.map(toVerification));
  }

  isApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): Promise<boolean> {
    return hasApprovedOrganization(this.em, owner, kind);
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

  async addToCart(owner: AgriTechOwner, item: CartItem): Promise<OperationResult<Cart>> {
    if (item.quantity <= 0) {
      return { status: 'invalid_state', field: 'quantity' };
    }
    return this.em.transactional(async (em) => {
      const product = await em.findOne(ProductEntity, {
        tenantId: owner.tenantId,
        id: item.productId,
        status: 'active',
      });
      if (!product) {
        return { status: 'not_found', field: 'productId' };
      }
      const sellerId = product.supplierId;
      await em
        .getConnection()
        .execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-cart:${owner.tenantId}:${owner.userId}:${sellerId}`,
        ]);
      let cart = await em.findOne(
        CartEntity,
        {
          tenantId: owner.tenantId,
          userId: owner.userId,
          sellerId,
          status: 'open',
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const existing = cart?.items.find((cartItem) => cartItem.productId === item.productId);
      const nextQuantity = (existing?.quantity ?? 0) + item.quantity;
      if (nextQuantity > product.stockQuantity) {
        return { status: 'conflict', field: 'stockQuantity' };
      }
      if (!cart) {
        cart = new CartEntity();
        cart.id = randomUUID();
        cart.tenantId = owner.tenantId;
        cart.userId = owner.userId;
        cart.sellerId = sellerId;
        cart.items = [];
        em.persist(cart);
      }
      if (existing) {
        existing.quantity = nextQuantity;
      } else {
        cart.items.push(item);
      }
      cart.updatedAt = new Date();
      await em.flush();
      return ok(toCart(cart));
    });
  }

  async updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<OperationResult<Cart>> {
    return this.em.transactional(async (em) => {
      const cart = await em.findOne(
        CartEntity,
        {
          tenantId: owner.tenantId,
          userId: owner.userId,
          id: cartId,
          status: 'open',
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!cart) {
        return { status: 'not_found' };
      }
      const existing = cart.items.find((cartItem) => cartItem.productId === productId);
      if (!existing) {
        return { status: 'not_found', field: 'productId' };
      }
      if (quantity <= 0) {
        cart.items = cart.items.filter((cartItem) => cartItem.productId !== productId);
      } else {
        const product = await em.findOne(ProductEntity, {
          tenantId: owner.tenantId,
          id: productId,
          supplierId: cart.sellerId,
          status: 'active',
        });
        if (!product) {
          return { status: 'not_found', field: 'productId' };
        }
        if (quantity > product.stockQuantity) {
          return { status: 'conflict', field: 'stockQuantity' };
        }
        existing.quantity = quantity;
      }
      cart.updatedAt = new Date();
      await em.flush();
      return ok(toCart(cart));
    });
  }

  async removeCartItem(owner: AgriTechOwner, cartId: string, productId: string): Promise<OperationResult<Cart>> {
    return this.updateCartItem(owner, cartId, productId, 0);
  }

  async checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
  ): Promise<OperationResult<CheckoutCartResult>> {
    return this.em.transactional(async (em) => {
      const cart = await em.findOne(
        CartEntity,
        {
          tenantId: owner.tenantId,
          userId: owner.userId,
          id: cartId,
          status: 'open',
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!cart) {
        return { status: 'not_found' };
      }
      if (cart.items.length === 0) {
        return { status: 'invalid_state', field: 'items' };
      }

      if (!(await hasApprovedOrganization(em, owner, 'buyer', true))) {
        return { status: 'forbidden', field: 'organization' };
      }

      const sellerPartner = await em.findOne(AgriTechPartnerEntity, {
        tenantId: owner.tenantId,
        id: cart.sellerId,
        kind: 'supplier',
        status: 'approved',
      });
      if (!sellerPartner || sellerPartner.ownerUserId === owner.userId) {
        return { status: 'forbidden', field: 'sellerId' };
      }

      const sellerVerification = await em.findOne(VerificationEntity, {
        tenantId: owner.tenantId,
        userId: sellerPartner.ownerUserId,
        status: 'verified',
        role: { $in: ['farmer', 'seller'] },
      });
      if (!sellerVerification) {
        return { status: 'forbidden', field: 'sellerId' };
      }

      const products = await em.find(
        ProductEntity,
        {
          tenantId: owner.tenantId,
          id: { $in: cart.items.map(({ productId }) => productId) },
          supplierId: cart.sellerId,
          status: 'active',
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      const productsById = new Map(products.map((product) => [product.id, product]));
      const lines: ContractLine[] = [];
      for (const item of cart.items) {
        const product = productsById.get(item.productId);
        if (!product) {
          return { status: 'not_found', field: 'productId' };
        }
        if (item.quantity <= 0 || item.quantity > product.stockQuantity) {
          return { status: 'conflict', field: 'stockQuantity' };
        }
        const unitPriceUzs = Number(product.priceUzs);
        if (!Number.isSafeInteger(unitPriceUzs) || unitPriceUzs <= 0 || unitPriceUzs > maximumMarketplaceUzs) {
          return { status: 'invalid_state', field: 'priceUzs' };
        }
        lines.push({
          productId: product.id,
          name: product.name,
          unit: product.unit,
          unitPriceUzs,
          quantity: item.quantity,
          lineTotalUzs: unitPriceUzs * item.quantity,
        });
      }

      const amountUzs = lines.reduce((sum, line) => sum + line.lineTotalUzs, 0);
      if (!Number.isSafeInteger(amountUzs) || amountUzs <= 0 || amountUzs > maximumMarketplaceUzs) {
        return { status: 'invalid_state', field: 'amountUzs' };
      }

      const contract = createDraftContract({
        tenantId: owner.tenantId,
        buyerUserId: owner.userId,
        sellerUserId: sellerPartner.ownerUserId,
        sourceType: 'cart_checkout',
        sourceId: cart.id,
        subject: lines
          .map((line) => line.name)
          .join(', ')
          .slice(0, 300),
        amountUzs,
        lines,
        deliveryTerms: input.deliveryTerms,
        deliveryPriceUzs: input.deliveryTerms === 'pickup' ? 0 : undefined,
      });
      cart.status = 'ordered';
      cart.updatedAt = new Date();
      em.persist(contract);
      await em.flush();
      return ok({ cartId: cart.id, contractId: contract.id });
    });
  }

  // ---- Samples ----
  async requestSample(owner: AgriTechOwner, productId: string): Promise<OperationResult<SampleRequest>> {
    return this.em.transactional(async (em) => {
      if (!(await hasApprovedOrganization(em, owner, 'buyer', true))) {
        return { status: 'forbidden', field: 'organization' };
      }
      const verification = await em.findOne(
        VerificationEntity,
        { tenantId: owner.tenantId, userId: owner.userId, status: 'verified' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!verification) {
        return { status: 'forbidden', field: 'verification' };
      }
      const used = await em.count(SampleRequestEntity, {
        tenantId: owner.tenantId,
        userId: owner.userId,
        createdAt: { $gte: currentMonthStart() },
      });
      if (used >= maxMonthlySamples) {
        return { status: 'invalid_state', field: 'samples' };
      }
      const product = await em.findOne(ProductEntity, {
        tenantId: owner.tenantId,
        id: productId,
        status: 'active',
      });
      if (!product) {
        return { status: 'not_found', field: 'productId' };
      }
      const sellerPartner = await em.findOne(AgriTechPartnerEntity, {
        tenantId: owner.tenantId,
        id: product.supplierId,
        kind: 'supplier',
        status: 'approved',
      });
      if (!sellerPartner || sellerPartner.ownerUserId === owner.userId) {
        return { status: 'forbidden', field: 'sellerId' };
      }
      const entity = new SampleRequestEntity();
      entity.id = randomUUID();
      entity.tenantId = owner.tenantId;
      entity.userId = owner.userId;
      entity.productId = productId;
      entity.sellerId = product.supplierId;
      entity.status = 'pending';
      em.persist(entity);
      await em.flush();
      return ok(toSample(entity));
    });
  }

  listSamples(owner: AgriTechOwner): Promise<SampleRequest[]> {
    return this.em
      .find(SampleRequestEntity, { tenantId: owner.tenantId, userId: owner.userId }, { orderBy: { createdAt: 'DESC' } })
      .then((rows) => rows.map(toSample));
  }

  async sampleUsageThisMonth(owner: AgriTechOwner): Promise<number> {
    const count = await this.em.count(SampleRequestEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
      createdAt: { $gte: currentMonthStart() },
    });
    return count;
  }

  // ---- Favorites ----
  async addFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>> {
    return this.em.transactional(async (em) => {
      const product = await em.findOne(ProductEntity, {
        tenantId: owner.tenantId,
        id: productId,
        status: 'active',
      });
      if (!product) {
        return { status: 'not_found', field: 'productId' };
      }
      await em.getConnection().execute(
        `insert into marketplace_favorites (tenant_id, user_id, product_id, created_at)
         values (?, ?, ?, now())
         on conflict (tenant_id, user_id, product_id) do nothing`,
        [owner.tenantId, owner.userId, productId],
      );
      return ok({ productId });
    });
  }

  async removeFavorite(owner: AgriTechOwner, productId: string): Promise<OperationResult<{ productId: string }>> {
    const product = await this.em.findOne(ProductEntity, {
      tenantId: owner.tenantId,
      id: productId,
    });
    if (!product) {
      return { status: 'not_found', field: 'productId' };
    }
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
    return this.em.transactional(async (em) => {
      if (!(await hasApprovedOrganization(em, owner, 'buyer', true))) {
        return { status: 'forbidden', field: 'organization' };
      }
      await em
        .getConnection()
        .execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-review:${owner.tenantId}:${owner.userId}:${productId}`,
        ]);
      const product = await em.findOne(ProductEntity, {
        tenantId: owner.tenantId,
        id: productId,
      });
      if (!product) {
        return { status: 'not_found', field: 'productId' };
      }
      const eligibleContracts = await em.find(ContractEntity, {
        tenantId: owner.tenantId,
        buyerUserId: owner.userId,
        status: { $in: ['active', 'completed'] },
      });
      if (!eligibleContracts.some(({ lines }) => lines.some((line) => line.productId === productId))) {
        return { status: 'forbidden', field: 'purchase' };
      }
      const existing = await em.findOne(ReviewEntity, {
        tenantId: owner.tenantId,
        productId,
        userId: owner.userId,
      });
      if (existing) {
        return { status: 'conflict', field: 'review' };
      }
      const entity = new ReviewEntity();
      entity.id = randomUUID();
      entity.tenantId = owner.tenantId;
      entity.productId = productId;
      entity.userId = owner.userId;
      entity.rating = rating;
      entity.comment = comment ?? null;
      em.persist(entity);
      await em.flush();
      return ok(toReview(entity));
    });
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
    if (
      input.budgetUzs !== undefined &&
      (!Number.isSafeInteger(input.budgetUzs) || input.budgetUzs <= 0 || input.budgetUzs > maximumMarketplaceUzs)
    ) {
      return { status: 'invalid_state', field: 'budgetUzs' };
    }
    return this.em.transactional(async (em) => {
      if (!(await hasApprovedOrganization(em, owner, 'buyer', true))) {
        return { status: 'forbidden', field: 'organization' };
      }
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
      em.persist(entity);
      await em.flush();
      return ok(toRequest(entity));
    });
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
    deliveryTerms: 'pickup' | 'seller_delivery' | 'by_agreement',
    deliveryPriceUzs?: number,
    deliveryNote?: string,
    deliveryDays?: number,
  ): Promise<OperationResult<RequestOffer>> {
    return this.em.transactional(async (em) => {
      if (!(await hasApprovedOrganization(em, owner, 'supplier', true))) {
        return { status: 'forbidden', field: 'organization' };
      }
      const request = await em.findOne(
        BuyerRequestEntity,
        {
          tenantId: owner.tenantId,
          id: requestId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!request) {
        return { status: 'not_found' };
      }
      if (request.status !== 'open' && request.status !== 'offering') {
        return { status: 'invalid_state' };
      }
      if (request.buyerUserId === owner.userId) {
        return { status: 'forbidden', field: 'buyerUserId' };
      }
      if (!Number.isSafeInteger(priceUzs) || priceUzs <= 0 || priceUzs > maximumMarketplaceUzs) {
        return { status: 'invalid_state', field: 'priceUzs' };
      }
      const validDeliveryPrice =
        (deliveryTerms === 'pickup' && deliveryPriceUzs === undefined) ||
        (deliveryTerms === 'seller_delivery' &&
          deliveryPriceUzs !== undefined &&
          Number.isSafeInteger(deliveryPriceUzs) &&
          deliveryPriceUzs > 0 &&
          deliveryPriceUzs <= maximumMarketplaceUzs) ||
        (deliveryTerms === 'by_agreement' && deliveryPriceUzs === undefined);
      if (!validDeliveryPrice) {
        return { status: 'invalid_state', field: 'deliveryPriceUzs' };
      }
      if (
        deliveryDays !== undefined &&
        (!Number.isInteger(deliveryDays) || deliveryDays <= 0 || deliveryDays > maximumDeliveryDays)
      ) {
        return { status: 'invalid_state', field: 'deliveryDays' };
      }
      const entity = new RequestOfferEntity();
      entity.id = randomUUID();
      entity.requestId = requestId;
      entity.tenantId = owner.tenantId;
      entity.sellerUserId = owner.userId;
      entity.priceUzs = priceUzs;
      entity.deliveryTerms = deliveryTerms;
      entity.deliveryPriceUzs = deliveryTerms === 'pickup' ? 0 : (deliveryPriceUzs ?? null);
      entity.deliveryNote = deliveryNote ?? null;
      entity.deliveryDays = deliveryDays ?? null;
      entity.status = 'pending';
      if (request.status === 'open') {
        request.status = 'offering';
        request.updatedAt = new Date();
      }
      em.persist(entity);
      await em.flush();
      return ok(toOffer(entity));
    });
  }

  async listOffers(owner: AgriTechOwner, requestId: string): Promise<OperationResult<RequestOffer[]>> {
    const request = await this.em.findOne(BuyerRequestEntity, {
      tenantId: owner.tenantId,
      id: requestId,
      buyerUserId: owner.userId,
    });
    if (!request) {
      return { status: 'not_found' };
    }
    const rows = await this.em.find(
      RequestOfferEntity,
      { tenantId: owner.tenantId, requestId },
      { orderBy: { createdAt: 'ASC' } },
    );
    return ok(rows.map(toOffer));
  }

  async chooseOffer(
    owner: AgriTechOwner,
    requestId: string,
    offerId: string,
  ): Promise<OperationResult<OfferSelectionResult>> {
    return this.em.transactional(async (em) => {
      if (!(await hasApprovedOrganization(em, owner, 'buyer', true))) {
        return { status: 'forbidden', field: 'organization' };
      }
      const request = await em.findOne(
        BuyerRequestEntity,
        {
          tenantId: owner.tenantId,
          id: requestId,
          buyerUserId: owner.userId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!request) {
        return { status: 'not_found' };
      }
      if (request.status !== 'offering' && request.status !== 'open') {
        return { status: 'conflict', field: 'status' };
      }
      const offer = await em.findOne(
        RequestOfferEntity,
        {
          tenantId: owner.tenantId,
          id: offerId,
          requestId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!offer) {
        return { status: 'not_found', field: 'offerId' };
      }
      if (offer.status !== 'pending') {
        return { status: 'conflict', field: 'status' };
      }
      if (offer.sellerUserId === owner.userId) {
        return { status: 'forbidden', field: 'sellerUserId' };
      }
      const sellerVerification = await em.findOne(VerificationEntity, {
        tenantId: owner.tenantId,
        userId: offer.sellerUserId,
        status: 'verified',
        role: { $in: ['farmer', 'seller'] },
      });
      if (!sellerVerification) {
        return { status: 'forbidden', field: 'sellerUserId' };
      }
      if (
        !(await hasApprovedOrganization(em, { tenantId: owner.tenantId, userId: offer.sellerUserId }, 'supplier', true))
      ) {
        return { status: 'forbidden', field: 'sellerUserId' };
      }

      const pendingOffers = await em.find(
        RequestOfferEntity,
        {
          tenantId: owner.tenantId,
          requestId,
          status: 'pending',
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      for (const pendingOffer of pendingOffers) {
        pendingOffer.status = pendingOffer.id === offer.id ? 'accepted' : 'declined';
      }
      offer.status = 'accepted';
      request.status = 'selected';
      request.updatedAt = new Date();

      const contract = createDraftContract({
        tenantId: owner.tenantId,
        buyerUserId: owner.userId,
        sellerUserId: offer.sellerUserId,
        sourceType: 'offer_selection',
        sourceId: offer.id,
        subject: [request.title, request.volume].filter(Boolean).join(' — ').slice(0, 300),
        amountUzs: Number(offer.priceUzs),
        deliveryTerms: offer.deliveryTerms,
        deliveryPriceUzs: offer.deliveryPriceUzs ?? undefined,
        deliveryNote: offer.deliveryNote ?? undefined,
        deliveryDays: offer.deliveryDays ?? undefined,
      });
      em.persist(contract);
      await em.flush();
      return ok({
        requestId,
        offerId,
        sellerUserId: offer.sellerUserId,
        contractId: contract.id,
      });
    });
  }

  // ---- Contracts ----
  async updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: { deliveryPriceUzs: number; deliveryNote?: string; deliveryDays?: number },
  ): Promise<OperationResult<Contract>> {
    return this.em.transactional(async (em) => {
      const entity = await em.findOne(
        ContractEntity,
        { id: contractId, tenantId: owner.tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!entity) {
        return { status: 'not_found' };
      }
      if (entity.sellerUserId !== owner.userId) {
        return { status: 'forbidden', field: 'sellerUserId' };
      }
      if (!(await hasApprovedOrganization(em, owner, 'supplier', true))) {
        return { status: 'forbidden', field: 'organization' };
      }
      if (
        entity.deliveryTerms !== 'seller_delivery' ||
        entity.sourceType !== 'cart_checkout' ||
        entity.deliveryPriceUzs !== null ||
        entity.status !== 'draft' ||
        entity.buyerSignedAt !== null ||
        entity.sellerSignedAt !== null ||
        !Number.isSafeInteger(input.deliveryPriceUzs) ||
        input.deliveryPriceUzs <= 0 ||
        input.deliveryPriceUzs > maximumMarketplaceUzs ||
        (input.deliveryDays !== undefined &&
          (!Number.isInteger(input.deliveryDays) ||
            input.deliveryDays <= 0 ||
            input.deliveryDays > maximumDeliveryDays))
      ) {
        return { status: 'invalid_state', field: 'deliveryPriceUzs' };
      }
      entity.deliveryPriceUzs = input.deliveryPriceUzs;
      entity.deliveryNote = input.deliveryNote ?? null;
      entity.deliveryDays = input.deliveryDays ?? null;
      entity.updatedAt = new Date();
      await em.flush();
      return ok(toContract(entity));
    });
  }

  async signContract(owner: AgriTechOwner, contractId: string): Promise<OperationResult<Contract>> {
    return this.em.transactional(async (em) => {
      const entity = await em.findOne(
        ContractEntity,
        {
          tenantId: owner.tenantId,
          id: contractId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!entity) {
        return { status: 'not_found' };
      }

      const signing = contractSigningDecision(entity, owner.userId);
      if ('result' in signing) {
        return signing.result;
      }
      const { party } = signing;

      if (!(await hasApprovedOrganization(em, owner, party === 'buyer' ? 'buyer' : 'supplier', true))) {
        return { status: 'forbidden', field: 'organization' };
      }

      const now = new Date();
      const willActivate = Boolean(party === 'buyer' ? entity.sellerSignedAt : entity.buyerSignedAt);
      if (willActivate) {
        const inventory = await commitCartContractInventory(em, entity);
        if (inventory.status !== 'ok') {
          return inventory;
        }
      }
      recordPartySignature(entity, party, now);
      const fullySigned = Boolean(entity.buyerSignedAt && entity.sellerSignedAt);
      entity.status = fullySigned ? 'active' : 'signed';
      if (fullySigned && !entity.signedAt) {
        entity.signedAt = now;
      }
      entity.updatedAt = now;
      await em.flush();
      return ok(toContract(entity));
    });
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
    const search = kind === 'season_advice' ? undefined : catalogSearch(owner.tenantId, question);
    const catalog = search
      ? await this.em.find(ProductEntity, search, {
          limit: 50,
          orderBy: { priceUzs: 'ASC', id: 'ASC' },
        })
      : [];
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
): { answer: AiConsultationAnswer; productIds: string[] } {
  const matches = kind === 'season_advice' ? [] : catalog.slice(0, 3);
  return {
    answer: matches.length > 0 ? 'catalog_match' : 'no_catalog_match',
    productIds: matches.map((product) => product.id),
  };
}

const ignoredCatalogSearchTerms = new Set([
  'arzon',
  'arzonroq',
  'cheaper',
  'cheapest',
  'find',
  'kerak',
  'looking',
  'mahsulot',
  'menga',
  'narx',
  'need',
  'please',
  'price',
  'product',
  'recommend',
  'recommendation',
  'tavsiya',
  'товар',
  'дешевле',
  'дешёвый',
  'дешевый',
  'найди',
  'нужен',
  'пожалуйста',
  'порекомендуй',
  'цена',
]);

function catalogSearch(tenantId: string, question: string): FilterQuery<ProductEntity> | undefined {
  const tokens = [
    ...new Set(
      question
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length >= 3 && !ignoredCatalogSearchTerms.has(token)),
    ),
  ].slice(0, 6);
  if (tokens.length === 0) {
    return undefined;
  }

  return {
    tenantId,
    status: 'active',
    $and: tokens.map((token): FilterQuery<ProductEntity> => ({
      $or: [
        { name: { $ilike: `%${token}%` } },
        { nameRu: { $ilike: `%${token}%` } },
        { nameUz: { $ilike: `%${token}%` } },
        { description: { $ilike: `%${token}%` } },
        { category: { $ilike: `%${token}%` } },
      ],
    })),
  };
}
