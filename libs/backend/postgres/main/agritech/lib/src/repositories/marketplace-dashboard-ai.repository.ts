// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { createHash, randomUUID } from 'node:crypto';
import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AgriTechOwner,
  AiConsultationKind,
  MarketplaceAiConsultation,
  MarketplaceAiGroundedResponse,
  MarketplaceAiRecommendation,
  MarketplaceAiStarterCartInput,
  MarketplaceAiStarterCartPartition,
  MarketplaceAiStarterCartResult,
  MarketplaceBuyerDashboardMetrics,
  MarketplaceDashboardAiRepository,
  MarketplaceDashboardMonthlyActivity,
  MarketplaceDashboardRecentDeal,
  MarketplaceDashboardTopListing,
  MarketplaceRoleDashboard,
  MarketplaceSellerDashboardMetrics,
  OperationResult,
  VerificationRole,
} from '@app/backend-feature-agritech-shared';
import {
  marketplaceBuyerRoleFilter,
  marketplaceSellerRoleFilter,
  marketplaceSellerRolesSql,
} from './marketplace-role-predicates';
import {
  MarketplaceAiConsultationEntity,
  MarketplaceAiConsultationOperationEntity,
  MarketplaceAiStarterCartOperationEntity,
} from '../entities/marketplace-dashboard-ai.entity';
import { MarketplacePartnerMembershipEntity } from '../entities/marketplace-commerce.entity';
import {
  BuyerRequestEntity,
  CartEntity,
  ContractEntity,
  RequestOfferEntity,
  VerificationEntity,
} from '../entities/marketplace.entity';
import {
  MarketplaceListingPublicationEntity,
  MarketplacePublicSellerEntity,
  MarketplacePublicSellerRevisionEntity,
} from '../entities/marketplace-public.entity';
import { MarketplaceProduceOrganizationBindingEntity } from '../entities/marketplace-source-binding.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';

const maximumAiQuestionLength = 2_000;
const maximumStarterCartListings = 3;
const unsafeQuestionFormatPattern = /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]+/gu;
const dashboardRecentDealLimit = 10;
const dashboardTopListingLimit = 5;
const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const compareStableText = (left: string, right: string): number => left.localeCompare(right, 'en');

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });
const canonicalFingerprint = (value: Record<string, unknown>): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const ignoredAiSearchTerms = new Set([
  'advisor',
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
  'season',
  'tavsiya',
  'товар',
  'дешевле',
  'дешёвый',
  'дешевый',
  'найди',
  'нужен',
  'пожалуйста',
  'порекомендуй',
  'сезон',
  'цена',
]);

interface GroundedListingRow {
  listing_publication_id: string;
  seller_public_id: string;
  public_title: string;
  public_title_ru: string;
  public_title_uz: string;
  public_title_uz_cyrl: string;
  public_unit: string;
  price_uzs: number | string;
  available_quantity: number | string;
}

interface AuthorizedDashboardScope {
  role: VerificationRole;
  buyerPartnerIds: string[];
  sellerPartnerIds: string[];
}

interface ResolvedStarterListing {
  publication: MarketplaceListingPublicationEntity;
  sellerPublic: MarketplacePublicSellerEntity;
  sellerPartner: AgriTechPartnerEntity;
  source: ProductEntity | ProduceListingEntity;
  availableQuantity: number;
}

const toConsultation = (entity: MarketplaceAiConsultationEntity): MarketplaceAiConsultation => ({
  answer: entity.answer,
  ...(entity.confirmedAt ? { confirmedAt: entity.confirmedAt } : {}),
  createdAt: entity.createdAt,
  id: entity.id,
  kind: entity.kind,
  listingPublicationIds: [...entity.listingPublicationIds],
  question: entity.question,
  response: structuredClone(entity.response),
  updatedAt: entity.updatedAt,
});

const consultationSnapshot = (value: MarketplaceAiConsultation): Record<string, unknown> => ({
  answer: value.answer,
  createdAt: value.createdAt.toISOString(),
  id: value.id,
  kind: value.kind,
  listingPublicationIds: [...value.listingPublicationIds],
  question: value.question,
  response: structuredClone(value.response),
  updatedAt: value.updatedAt.toISOString(),
});

const consultationFromSnapshot = (snapshot: Record<string, unknown>): MarketplaceAiConsultation => ({
  answer: snapshot['answer'] === 'catalog_match' ? 'catalog_match' : 'no_catalog_match',
  createdAt: new Date(String(snapshot['createdAt'])),
  id: String(snapshot['id']),
  kind:
    snapshot['kind'] === 'find_cheaper' || snapshot['kind'] === 'season_advice' || snapshot['kind'] === 'generic'
      ? snapshot['kind']
      : 'recommendation',
  listingPublicationIds: Array.isArray(snapshot['listingPublicationIds'])
    ? snapshot['listingPublicationIds'].filter((value): value is string => typeof value === 'string')
    : [],
  question: String(snapshot['question']),
  response: structuredClone(snapshot['response']) as MarketplaceAiGroundedResponse,
  updatedAt: new Date(String(snapshot['updatedAt'])),
});

const starterCartSnapshot = (value: MarketplaceAiStarterCartResult): Record<string, unknown> => ({
  carts: value.carts.map((cart) => ({
    cartId: cart.cartId,
    listingPublicationIds: [...cart.listingPublicationIds],
    sellerPublicId: cart.sellerPublicId,
  })),
  confirmedAt: value.confirmedAt.toISOString(),
  consultationId: value.consultationId,
  status: value.status,
});

const starterCartFromSnapshot = (snapshot: Record<string, unknown>): MarketplaceAiStarterCartResult => ({
  carts: Array.isArray(snapshot['carts'])
    ? snapshot['carts'].flatMap((value): MarketplaceAiStarterCartPartition[] => {
        if (!value || typeof value !== 'object') {
          return [];
        }
        const cart = value as Record<string, unknown>;
        if (
          typeof cart['cartId'] !== 'string' ||
          typeof cart['sellerPublicId'] !== 'string' ||
          !Array.isArray(cart['listingPublicationIds'])
        ) {
          return [];
        }
        return [
          {
            cartId: cart['cartId'],
            listingPublicationIds: cart['listingPublicationIds'].filter(
              (listingId): listingId is string => typeof listingId === 'string',
            ),
            sellerPublicId: cart['sellerPublicId'],
          },
        ];
      })
    : [],
  confirmedAt: new Date(String(snapshot['confirmedAt'])),
  consultationId: String(snapshot['consultationId']),
  status: 'confirmed',
});

const aiSearchTokens = (question: string): string[] =>
  [
    ...new Set(
      question
        .normalize('NFKC')
        .toLocaleLowerCase('en')
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !ignoredAiSearchTerms.has(token)),
    ),
  ].slice(0, 6);

const normalizeQuestion = (question: string): string =>
  question
    .normalize('NFC')
    .replaceAll(unsafeQuestionFormatPattern, '')
    .replaceAll(/\p{Cc}+/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();

const redactQuestion = (question: string): string =>
  question
    .replaceAll(/\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}\b/giu, '[redacted-email]')
    .replaceAll(/\+?998[\s()-]*\d{2}[\s()-]*\d{3}[\s()-]*\d{2}[\s()-]*\d{2}/gu, '[redacted-phone]')
    .replaceAll(/\b\d{12,}\b/gu, '[redacted-number]');

const groundedResponse = (kind: AiConsultationKind, listings: GroundedListingRow[]): MarketplaceAiGroundedResponse => {
  const recommendations: MarketplaceAiRecommendation[] = listings.map((listing, index) => ({
    availability: {
      quantity: safeIntegerAmount(listing.available_quantity),
      status: 'in_stock_at_consultation',
      unit: listing.public_unit,
      warningCode: 'stock_may_change',
    },
    listingPublicationId: listing.listing_publication_id,
    priceUzs: safeIntegerAmount(listing.price_uzs),
    reasonCodes: [
      'query_terms_match',
      'current_public_stock',
      ...(kind === 'find_cheaper' && index === 0 ? (['lowest_current_price'] as const) : []),
    ],
    sellerPublicId: listing.seller_public_id,
    titles: {
      en: listing.public_title,
      ru: listing.public_title_ru,
      uz: listing.public_title_uz,
      uzCyrl: listing.public_title_uz_cyrl,
    },
  }));
  const sellerPartitions = new Map<string, string[]>();
  for (const listing of recommendations) {
    const partition = sellerPartitions.get(listing.sellerPublicId) ?? [];
    partition.push(listing.listingPublicationId);
    sellerPartitions.set(listing.sellerPublicId, partition);
  }
  return {
    explanationCodes:
      recommendations.length > 0
        ? [
            'grounded_at_consultation_time',
            ...(kind === 'find_cheaper' ? (['lowest_current_price_first'] as const) : []),
            ...(kind === 'season_advice' ? (['seasonal_calendar_unavailable'] as const) : []),
            'stock_revalidated_on_confirmation',
          ]
        : [
            'no_grounded_catalog_match',
            ...(kind === 'season_advice' ? (['seasonal_calendar_unavailable'] as const) : []),
          ],
    recommendations,
    starterCartPreview: {
      sellerPartitions: [...sellerPartitions.entries()]
        .sort(([left], [right]) => compareStableText(left, right))
        .map(([sellerPublicId, listingPublicationIds]) => ({
          listingPublicationIds: [...listingPublicationIds].sort(compareStableText),
          sellerPublicId,
        })),
      status: recommendations.length > 0 ? 'requires_confirmation' : 'unavailable',
    },
  };
};

const escapedLike = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

const isActiveDeal = (status: ContractEntity['status']): boolean =>
  status !== 'completed' && status !== 'cancelled' && status !== 'legacy_review_required';

const safeIntegerAmount = (value: unknown): number => {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
};

const partyName = (snapshot: Record<string, unknown> | null): string | undefined => {
  const value = snapshot?.['legalName'];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const monthKey = (date: Date): string => date.toISOString().slice(0, 7);

const emptyMonthlyActivity = (now: Date): MarketplaceDashboardMonthlyActivity[] => {
  const months: MarketplaceDashboardMonthlyActivity[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({
      completedPurchases: 0,
      completedSales: 0,
      month: monthKey(date),
      purchaseSpendUzs: 0,
      salesRevenueUzs: 0,
    });
  }
  return months;
};

@Injectable()
export class PostgresMarketplaceDashboardAiRepository implements MarketplaceDashboardAiRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async getRoleDashboard(owner: AgriTechOwner): Promise<OperationResult<MarketplaceRoleDashboard>> {
    const scope = await this.authorizedDashboardScope(owner);
    if (!scope) {
      return { status: 'forbidden', field: 'organization' };
    }

    const contracts = await this.authorizedContracts(owner, scope);
    const now = new Date();
    const recentDeals = this.recentDeals(owner, scope, contracts);
    const monthlyActivity = this.monthlyActivity(scope, contracts, now);

    if (scope.role === 'seller') {
      return ok({
        generatedAt: now,
        monthlyActivity,
        recentDeals,
        role: 'seller',
        seller: await this.sellerMetrics(scope.sellerPartnerIds, contracts),
      });
    }
    if (scope.role === 'buyer') {
      return ok({
        buyer: await this.buyerMetrics(owner, scope.buyerPartnerIds, contracts),
        generatedAt: now,
        monthlyActivity,
        recentDeals,
        role: 'buyer',
      });
    }
    return ok({
      buyer: await this.buyerMetrics(owner, scope.buyerPartnerIds, contracts),
      generatedAt: now,
      monthlyActivity,
      recentDeals,
      role: 'farmer',
      seller: await this.sellerMetrics(scope.sellerPartnerIds, contracts),
    });
  }

  async createAiConsultation(
    owner: AgriTechOwner,
    kind: AiConsultationKind,
    question: string,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceAiConsultation>> {
    const normalizedQuestion = normalizeQuestion(question);
    if (!normalizedQuestion || normalizedQuestion.length > maximumAiQuestionLength) {
      return { status: 'invalid_state', field: 'question' };
    }
    if (!idempotencyKeyPattern.test(idempotencyKey)) {
      return { status: 'invalid_state', field: 'idempotencyKey' };
    }
    const requestFingerprint = canonicalFingerprint({ kind, question: normalizedQuestion });
    return this.em.transactional(async (em) => {
      await em
        .getConnection()
        .execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-ai-consultation:${owner.tenantId}:${owner.userId}:${idempotencyKey}`,
        ]);
      const replay = await em.findOne(MarketplaceAiConsultationOperationEntity, {
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        idempotencyKey,
      });
      if (replay) {
        return replay.requestFingerprint === requestFingerprint
          ? ok(consultationFromSnapshot(replay.resultSnapshot))
          : { status: 'conflict', field: 'idempotencyKey' };
      }

      const tokens = aiSearchTokens(normalizedQuestion);
      const listings = tokens.length > 0 ? await this.findGroundedListings(em, kind, tokens) : [];
      const response = groundedResponse(kind, listings);
      const listingPublicationIds = listings.map((listing) => listing.listing_publication_id);
      const now = new Date();
      const entity = new MarketplaceAiConsultationEntity();
      Object.assign(entity, {
        answer: listingPublicationIds.length > 0 ? ('catalog_match' as const) : ('no_catalog_match' as const),
        createdAt: now,
        id: randomUUID(),
        kind,
        listingPublicationIds,
        question: redactQuestion(normalizedQuestion),
        response,
        tenantId: owner.tenantId,
        updatedAt: now,
        userId: owner.userId,
      });
      em.persist(entity);
      await em.flush();
      const consultation = toConsultation(entity);
      const operation = new MarketplaceAiConsultationOperationEntity();
      Object.assign(operation, {
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        consultationId: entity.id,
        id: randomUUID(),
        idempotencyKey,
        requestFingerprint,
        resultSnapshot: consultationSnapshot(consultation),
      });
      em.persist(operation);
      await em.flush();
      return ok(consultation);
    });
  }

  listAiConsultations(owner: AgriTechOwner): Promise<MarketplaceAiConsultation[]> {
    return this.em
      .find(
        MarketplaceAiConsultationEntity,
        { tenantId: owner.tenantId, userId: owner.userId },
        { limit: 50, orderBy: { createdAt: 'DESC' } },
      )
      .then((rows) => rows.map(toConsultation));
  }

  confirmAiStarterCart(
    owner: AgriTechOwner,
    consultationId: string,
    input: MarketplaceAiStarterCartInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceAiStarterCartResult>> {
    if (!input.confirmed) {
      return Promise.resolve({ status: 'invalid_state', field: 'confirmed' });
    }
    return this.em.transactional(async (em) => {
      await em
        .getConnection()
        .execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-ai-starter-cart:${owner.tenantId}:${owner.userId}:${idempotencyKey}`,
        ]);
      const requestFingerprint = canonicalFingerprint({
        actingPartnerId: input.actingPartnerId,
        confirmed: true,
        consultationId,
      });
      const replay = await em.findOne(MarketplaceAiStarterCartOperationEntity, {
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        idempotencyKey,
      });
      if (replay) {
        return replay.requestFingerprint === requestFingerprint
          ? ok(starterCartFromSnapshot(replay.resultSnapshot))
          : { status: 'conflict', field: 'idempotencyKey' };
      }

      const consultation = await em.findOne(
        MarketplaceAiConsultationEntity,
        { id: consultationId, tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!consultation) {
        return { status: 'not_found', field: 'consultationId' };
      }
      if (consultation.confirmedAt || consultation.revision !== 0) {
        return { status: 'conflict', field: 'consultation' };
      }
      if (
        consultation.answer !== 'catalog_match' ||
        consultation.listingPublicationIds.length === 0 ||
        consultation.listingPublicationIds.length > maximumStarterCartListings
      ) {
        return { status: 'invalid_state', field: 'consultation' };
      }

      const buyer = await this.lockAuthorizedBuyer(em, owner, input.actingPartnerId);
      if (!buyer) {
        return { status: 'forbidden', field: 'organization' };
      }

      const listingResolution = await this.resolveStarterListings(em, consultation.listingPublicationIds, buyer);
      if (listingResolution.status !== 'ok') {
        return listingResolution;
      }
      const cartResolution = await this.upsertStarterCarts(em, owner, buyer, listingResolution.value);
      if (cartResolution.status !== 'ok') {
        return cartResolution;
      }
      const carts = cartResolution.value;

      const confirmedAt = new Date();
      consultation.confirmedAt = confirmedAt;
      consultation.revision = 1;
      consultation.updatedAt = confirmedAt;
      const result: MarketplaceAiStarterCartResult = {
        carts,
        confirmedAt,
        consultationId,
        status: 'confirmed',
      };
      // The immutable receipt trigger requires the consultation's confirmed
      // revision to be visible first. Both flushes remain inside this one
      // transaction, so a receipt failure rolls back carts and confirmation.
      await em.flush();
      const operation = new MarketplaceAiStarterCartOperationEntity();
      Object.assign(operation, {
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        buyerPartnerId: buyer.id,
        consultationId,
        id: randomUUID(),
        idempotencyKey,
        requestFingerprint,
        resultSnapshot: starterCartSnapshot(result),
      });
      em.persist(operation);
      await em.flush();
      return ok(result);
    });
  }

  private async resolveStarterListings(
    em: EntityManager,
    listingPublicationIds: string[],
    buyer: AgriTechPartnerEntity,
  ): Promise<OperationResult<ResolvedStarterListing[]>> {
    const resolvedListings: ResolvedStarterListing[] = [];
    for (const listingId of [...listingPublicationIds].sort(compareStableText)) {
      // The stable sequential lock order prevents cross-listing deadlocks.
      // eslint-disable-next-line no-await-in-loop
      const resolution = await this.lockStarterListing(em, listingId);
      if (resolution.status !== 'ok') {
        return resolution;
      }
      const resolved = resolution.value;
      if (resolved.sellerPartner.id === buyer.id && resolved.sellerPartner.tenantId === buyer.tenantId) {
        return { status: 'forbidden', field: 'organization' };
      }
      if (resolved.availableQuantity < 1) {
        return { status: 'conflict', field: 'stockQuantity' };
      }
      resolvedListings.push(resolved);
    }
    return ok(resolvedListings);
  }

  private async upsertStarterCarts(
    em: EntityManager,
    owner: AgriTechOwner,
    buyer: AgriTechPartnerEntity,
    resolvedListings: ResolvedStarterListing[],
  ): Promise<OperationResult<MarketplaceAiStarterCartPartition[]>> {
    const listingsBySeller = this.groupStarterListingsBySeller(resolvedListings);
    const carts: MarketplaceAiStarterCartPartition[] = [];
    for (const sellerKey of [...listingsBySeller.keys()].sort(compareStableText)) {
      const listings = listingsBySeller.get(sellerKey) ?? [];
      const first = listings[0];
      if (!first) {
        continue;
      }
      // Seller carts use the same stable lock order as listing revalidation.
      // eslint-disable-next-line no-await-in-loop
      await em
        .getConnection()
        .execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-cart:${owner.tenantId}:${owner.userId}:${buyer.id}:${sellerKey}`,
        ]);
      // eslint-disable-next-line no-await-in-loop
      let cart = await em.findOne(
        CartEntity,
        {
          bindingStatus: 'resolved',
          buyerPartnerId: buyer.id,
          sellerPartnerId: first.sellerPartner.id,
          sellerTenantId: first.sellerPartner.tenantId,
          status: 'open',
          tenantId: owner.tenantId,
          userId: owner.userId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!cart) {
        cart = this.newStarterCart(owner, buyer, first);
        em.persist(cart);
      }
      const mutation = this.appendStarterCartListings(cart, listings);
      if (mutation.status !== 'ok') {
        return mutation;
      }
      cart.updatedAt = new Date();
      carts.push({
        cartId: cart.id,
        listingPublicationIds: listings.map((listing) => listing.publication.id).sort(compareStableText),
        sellerPublicId: first.sellerPublic.id,
      });
    }
    return ok(carts);
  }

  private groupStarterListingsBySeller(listings: ResolvedStarterListing[]): Map<string, ResolvedStarterListing[]> {
    const listingsBySeller = new Map<string, ResolvedStarterListing[]>();
    for (const listing of listings) {
      const sellerKey = `${listing.sellerPartner.tenantId}:${listing.sellerPartner.id}`;
      const group = listingsBySeller.get(sellerKey) ?? [];
      group.push(listing);
      listingsBySeller.set(sellerKey, group);
    }
    return listingsBySeller;
  }

  private newStarterCart(
    owner: AgriTechOwner,
    buyer: AgriTechPartnerEntity,
    first: ResolvedStarterListing,
  ): CartEntity {
    const cart = new CartEntity();
    Object.assign(cart, {
      bindingStatus: 'resolved',
      buyerPartnerId: buyer.id,
      id: randomUUID(),
      items: [],
      sellerId: first.sellerPartner.id,
      sellerPartnerId: first.sellerPartner.id,
      sellerTenantId: first.sellerPartner.tenantId,
      sellerUserId: first.sellerPublic.ownerUserId,
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    return cart;
  }

  private appendStarterCartListings(cart: CartEntity, listings: ResolvedStarterListing[]): OperationResult<undefined> {
    for (const listing of listings) {
      const existing = cart.items.find((item) => item.listingPublicationId === listing.publication.id);
      if (existing) {
        if (existing.sourceId !== listing.source.id || existing.sourceKind !== listing.publication.sourceKind) {
          return { status: 'conflict', field: 'cart' };
        }
        if (existing.quantity > listing.availableQuantity) {
          return { status: 'conflict', field: 'stockQuantity' };
        }
        continue;
      }
      cart.items.push({
        listingPublicationId: listing.publication.id,
        quantity: 1,
        sourceId: listing.source.id,
        sourceKind: listing.publication.sourceKind,
      });
    }
    return ok(undefined);
  }

  private async authorizedDashboardScope(owner: AgriTechOwner): Promise<AuthorizedDashboardScope | undefined> {
    const verification = await this.em.findOne(VerificationEntity, {
      status: 'verified',
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    if (!verification) {
      return undefined;
    }
    const memberships = await this.em.find(MarketplacePartnerMembershipEntity, {
      status: 'active',
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    if (memberships.length === 0) {
      return undefined;
    }
    const partners = await this.em.find(AgriTechPartnerEntity, {
      id: { $in: memberships.map((membership) => membership.partnerId) },
      status: 'approved',
      tenantId: owner.tenantId,
    });
    const partnerById = new Map(partners.map((partner) => [partner.id, partner]));
    const buyerPartnerIds = memberships
      .filter(
        (membership) => membership.capability === 'buyer' && partnerById.get(membership.partnerId)?.kind === 'buyer',
      )
      .map((membership) => membership.partnerId);
    const sellerPartnerIds = memberships
      .filter(
        (membership) =>
          membership.capability === 'seller' && partnerById.get(membership.partnerId)?.kind === 'supplier',
      )
      .map((membership) => membership.partnerId);
    if (
      (verification.role === 'seller' && sellerPartnerIds.length === 0) ||
      (verification.role === 'buyer' && buyerPartnerIds.length === 0) ||
      (verification.role === 'farmer' && buyerPartnerIds.length === 0 && sellerPartnerIds.length === 0)
    ) {
      return undefined;
    }
    return { buyerPartnerIds, role: verification.role, sellerPartnerIds };
  }

  private async authorizedContracts(owner: AgriTechOwner, scope: AuthorizedDashboardScope): Promise<ContractEntity[]> {
    const filters: Record<string, unknown>[] = [];
    if (scope.buyerPartnerIds.length > 0) {
      filters.push({
        buyerPartnerId: { $in: scope.buyerPartnerIds },
        buyerUserId: owner.userId,
        tenantId: owner.tenantId,
      });
    }
    if (scope.sellerPartnerIds.length > 0) {
      filters.push({
        sellerPartnerId: { $in: scope.sellerPartnerIds },
        sellerTenantId: owner.tenantId,
      });
    }
    if (filters.length === 0) {
      return [];
    }
    return this.em.find(
      ContractEntity,
      { $or: filters, bindingStatus: 'resolved' },
      { orderBy: { updatedAt: 'DESC' } },
    );
  }

  private recentDeals(
    owner: AgriTechOwner,
    scope: AuthorizedDashboardScope,
    contracts: ContractEntity[],
  ): MarketplaceDashboardRecentDeal[] {
    const buyerIds = new Set(scope.buyerPartnerIds);
    const sellerIds = new Set(scope.sellerPartnerIds);
    return contracts
      .slice(0, dashboardRecentDealLimit)
      .map((contract) => {
        const isBuyer =
          contract.tenantId === owner.tenantId &&
          contract.buyerUserId === owner.userId &&
          Boolean(contract.buyerPartnerId && buyerIds.has(contract.buyerPartnerId));
        const counterpartyName = partyName(isBuyer ? contract.sellerPartySnapshot : contract.buyerPartySnapshot);
        return {
          amountUzs: safeIntegerAmount(contract.amountUzs),
          contractId: contract.id,
          ...(counterpartyName ? { counterpartyName } : {}),
          side: isBuyer ? ('buyer' as const) : ('seller' as const),
          status: contract.status,
          updatedAt: contract.updatedAt,
        };
      })
      .filter((deal) => deal.side === 'buyer' || sellerIds.size > 0);
  }

  private monthlyActivity(
    scope: AuthorizedDashboardScope,
    contracts: ContractEntity[],
    now: Date,
  ): MarketplaceDashboardMonthlyActivity[] {
    const months = emptyMonthlyActivity(now);
    const byMonth = new Map(months.map((month) => [month.month, month]));
    const buyerIds = new Set(scope.buyerPartnerIds);
    const sellerIds = new Set(scope.sellerPartnerIds);
    for (const contract of contracts) {
      if (contract.status !== 'completed') {
        continue;
      }
      const month = byMonth.get(monthKey(contract.updatedAt));
      if (!month) {
        continue;
      }
      const amount = safeIntegerAmount(contract.amountUzs);
      if (contract.buyerPartnerId && buyerIds.has(contract.buyerPartnerId)) {
        month.completedPurchases += 1;
        month.purchaseSpendUzs += amount;
      }
      if (contract.sellerPartnerId && sellerIds.has(contract.sellerPartnerId)) {
        month.completedSales += 1;
        month.salesRevenueUzs += amount;
      }
    }
    return months;
  }

  private async sellerMetrics(
    sellerPartnerIds: string[],
    contracts: ContractEntity[],
  ): Promise<MarketplaceSellerDashboardMetrics> {
    if (sellerPartnerIds.length === 0) {
      return {
        activeDeals: 0,
        activeListings: 0,
        completedDeals: 0,
        completedRevenueUzs: 0,
        offerConversionBps: 0,
        pendingOffers: 0,
        topListings: [],
      };
    }
    const sellers = await this.em.find(MarketplacePublicSellerEntity, {
      partnerId: { $in: sellerPartnerIds },
      status: 'published',
    });
    const [activeListings, offers] = await Promise.all([
      sellers.length === 0
        ? Promise.resolve([])
        : this.em.find(MarketplaceListingPublicationEntity, {
            moderationStatus: 'approved',
            sellerPublicId: { $in: sellers.map((seller) => seller.id) },
            status: 'published',
          }),
      this.em.find(RequestOfferEntity, {
        bindingStatus: 'resolved',
        sellerPartnerId: { $in: sellerPartnerIds },
      }),
    ]);
    const sellerIdSet = new Set(sellerPartnerIds);
    const sellerContracts = contracts.filter(
      (contract) => contract.sellerPartnerId && sellerIdSet.has(contract.sellerPartnerId),
    );
    const completedContracts = sellerContracts.filter((contract) => contract.status === 'completed');
    const acceptedOffers = offers.filter((offer) => offer.status === 'accepted').length;
    return {
      activeDeals: sellerContracts.filter((contract) => isActiveDeal(contract.status)).length,
      activeListings: activeListings.length,
      completedDeals: completedContracts.length,
      completedRevenueUzs: completedContracts.reduce((sum, contract) => sum + safeIntegerAmount(contract.amountUzs), 0),
      offerConversionBps: offers.length > 0 ? Math.round((acceptedOffers * 10_000) / offers.length) : 0,
      pendingOffers: offers.filter((offer) => offer.status === 'pending').length,
      topListings: this.topListings(completedContracts),
    };
  }

  private async buyerMetrics(
    owner: AgriTechOwner,
    buyerPartnerIds: string[],
    contracts: ContractEntity[],
  ): Promise<MarketplaceBuyerDashboardMetrics> {
    if (buyerPartnerIds.length === 0) {
      return {
        activeDeals: 0,
        completedDeals: 0,
        completedSpendUzs: 0,
        openCarts: 0,
        openPurchaseRequests: 0,
      };
    }
    const [carts, requests] = await Promise.all([
      this.em.find(CartEntity, {
        bindingStatus: 'resolved',
        buyerPartnerId: { $in: buyerPartnerIds },
        status: 'open',
        tenantId: owner.tenantId,
        userId: owner.userId,
      }),
      this.em.find(BuyerRequestEntity, {
        bindingStatus: 'resolved',
        buyerPartnerId: { $in: buyerPartnerIds },
        buyerUserId: owner.userId,
        status: { $in: ['open', 'offering'] },
        tenantId: owner.tenantId,
      }),
    ]);
    const buyerIdSet = new Set(buyerPartnerIds);
    const buyerContracts = contracts.filter(
      (contract) => contract.buyerPartnerId && buyerIdSet.has(contract.buyerPartnerId),
    );
    const completedContracts = buyerContracts.filter((contract) => contract.status === 'completed');
    return {
      activeDeals: buyerContracts.filter((contract) => isActiveDeal(contract.status)).length,
      completedDeals: completedContracts.length,
      completedSpendUzs: completedContracts.reduce((sum, contract) => sum + safeIntegerAmount(contract.amountUzs), 0),
      openCarts: carts.length,
      openPurchaseRequests: requests.length,
    };
  }

  private topListings(contracts: ContractEntity[]): MarketplaceDashboardTopListing[] {
    const listings = new Map<string, MarketplaceDashboardTopListing>();
    for (const contract of contracts) {
      for (const line of contract.lines) {
        if (!line.sourcePublicationId || line.sourceKind === 'request') {
          continue;
        }
        const existing = listings.get(line.sourcePublicationId) ?? {
          completedQuantity: 0,
          listingPublicationId: line.sourcePublicationId,
          revenueUzs: 0,
          title: line.name,
        };
        existing.completedQuantity += Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0;
        existing.revenueUzs += safeIntegerAmount(line.lineTotalUzs);
        listings.set(line.sourcePublicationId, existing);
      }
    }
    return [...listings.values()]
      .sort(
        (left, right) =>
          right.revenueUzs - left.revenueUzs ||
          compareStableText(left.listingPublicationId, right.listingPublicationId),
      )
      .slice(0, dashboardTopListingLimit);
  }

  private async findGroundedListings(
    em: EntityManager,
    kind: AiConsultationKind,
    tokens: string[],
  ): Promise<GroundedListingRow[]> {
    const tokenClauses = tokens.map(
      () => `(publication."public_title" ilike ? escape '\\'
        or coalesce(publication."public_title_ru", '') ilike ? escape '\\'
        or coalesce(publication."public_title_uz", '') ilike ? escape '\\'
        or coalesce(publication."public_title_uz_cyrl", '') ilike ? escape '\\'
        or coalesce(publication."public_description", '') ilike ? escape '\\'
        or coalesce(publication."public_category", '') ilike ? escape '\\'
        or coalesce(publication."public_crop", '') ilike ? escape '\\'
        or seller_revision."display_name" ilike ? escape '\\')`,
    );
    const parameters: unknown[] = tokens.flatMap((token) => Array<string>(8).fill(`%${escapedLike(token)}%`));
    const order =
      kind === 'find_cheaper'
        ? `coalesce(product."price_uzs", produce."price_per_kg_uzs") asc, publication."id" asc`
        : `publication."published_at" desc, publication."id" asc`;
    parameters.push(maximumStarterCartListings);
    return (await em.getConnection().execute(
      `
        select publication."id" as "listing_publication_id",
               seller."id" as "seller_public_id",
               publication."public_title",
               coalesce(publication."public_title_ru", publication."public_title") as "public_title_ru",
               coalesce(publication."public_title_uz", publication."public_title") as "public_title_uz",
               coalesce(publication."public_title_uz_cyrl", publication."public_title") as "public_title_uz_cyrl",
               publication."public_unit",
               coalesce(product."price_uzs", produce."price_per_kg_uzs") as "price_uzs",
               coalesce(product."stock_quantity", produce."available_quantity_kg") as "available_quantity"
          from "marketplace_listing_publications" publication
          join "marketplace_public_sellers" seller
            on seller."id" = publication."seller_public_id"
           and seller."tenant_id" = publication."tenant_id"
           and seller."owner_user_id" = publication."owner_user_id"
           and seller."status" = 'published'
          join "marketplace_public_seller_revisions" seller_revision
            on seller_revision."id" = publication."seller_revision_id"
           and seller_revision."seller_public_id" = seller."id"
           and seller_revision."tenant_id" = seller."tenant_id"
           and seller_revision."content_revision" = publication."seller_content_revision"
           and seller_revision."moderation_status" = 'approved'
          join "agritech_partners" partner
            on partner."id" = seller."partner_id"
           and partner."tenant_id" = seller."tenant_id"
           and partner."owner_user_id" = seller."owner_user_id"
           and partner."kind" = 'supplier'
           and partner."status" = 'approved'
          join "marketplace_partner_memberships" seller_membership
            on seller_membership."partner_id" = partner."id"
           and seller_membership."tenant_id" = partner."tenant_id"
           and seller_membership."user_id" = seller."owner_user_id"
           and seller_membership."capability" = 'seller'
           and seller_membership."status" = 'active'
          join "marketplace_verifications" seller_verification
            on seller_verification."tenant_id" = partner."tenant_id"
           and seller_verification."user_id" = seller."owner_user_id"
           and seller_verification."status" = 'verified'
           and seller_verification."role" in (${marketplaceSellerRolesSql})
          left join "products" product
            on product."id" = publication."product_id"
           and product."tenant_id" = publication."tenant_id"
           and product."supplier_id" = partner."id"::text
           and product."status" = 'active'
           and product."stock_quantity" > 0
          left join "produce_listings" produce
            on produce."id" = publication."produce_listing_id"
           and produce."tenant_id" = publication."tenant_id"
           and produce."status" = 'active'
           and produce."available_quantity_kg" > 0
          left join "marketplace_produce_organization_bindings" produce_binding
            on produce_binding."produce_listing_id" = produce."id"
           and produce_binding."tenant_id" = publication."tenant_id"
           and produce_binding."owner_user_id" = seller."owner_user_id"
           and produce_binding."supplier_partner_id" = partner."id"
         where publication."status" = 'published'
           and publication."moderation_status" = 'approved'
           and (${tokenClauses.join(' or ')})
           and ((publication."source_kind" = 'product' and product."id" is not null)
             or (publication."source_kind" = 'produce' and produce."id" is not null
               and produce_binding."produce_listing_id" is not null))
         order by ${order}
         limit ?
      `,
      parameters,
    )) as GroundedListingRow[];
  }

  private async lockAuthorizedBuyer(
    em: EntityManager,
    owner: AgriTechOwner,
    actingPartnerId: string,
  ): Promise<AgriTechPartnerEntity | undefined> {
    const verification = await em.findOne(
      VerificationEntity,
      {
        role: marketplaceBuyerRoleFilter(),
        status: 'verified',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    const membership = await em.findOne(
      MarketplacePartnerMembershipEntity,
      {
        capability: 'buyer',
        partnerId: actingPartnerId,
        status: 'active',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!verification || !membership) {
      return undefined;
    }
    return (
      (await em.findOne(
        AgriTechPartnerEntity,
        { id: actingPartnerId, kind: 'buyer', status: 'approved', tenantId: owner.tenantId },
        { lockMode: LockMode.PESSIMISTIC_READ },
      )) ?? undefined
    );
  }

  private async lockStarterListing(
    em: EntityManager,
    listingPublicationId: string,
  ): Promise<OperationResult<ResolvedStarterListing>> {
    const publication = await em.findOne(
      MarketplaceListingPublicationEntity,
      { id: listingPublicationId, moderationStatus: 'approved', status: 'published' },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!publication) {
      return { status: 'conflict', field: 'listingPublicationId' };
    }
    const sellerPublic = await em.findOne(
      MarketplacePublicSellerEntity,
      {
        id: publication.sellerPublicId,
        ownerUserId: publication.ownerUserId,
        status: 'published',
        tenantId: publication.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!sellerPublic) {
      return { status: 'conflict', field: 'listingPublicationId' };
    }
    const [sellerRevision, sellerPartner, sellerMembership, sellerVerification] = await Promise.all([
      em.findOne(
        MarketplacePublicSellerRevisionEntity,
        {
          contentRevision: publication.sellerContentRevision,
          id: publication.sellerRevisionId,
          moderationStatus: 'approved',
          sellerPublicId: sellerPublic.id,
          tenantId: publication.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      ),
      em.findOne(
        AgriTechPartnerEntity,
        {
          id: sellerPublic.partnerId,
          kind: 'supplier',
          ownerUserId: sellerPublic.ownerUserId,
          status: 'approved',
          tenantId: publication.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      ),
      em.findOne(
        MarketplacePartnerMembershipEntity,
        {
          capability: 'seller',
          partnerId: sellerPublic.partnerId,
          status: 'active',
          tenantId: publication.tenantId,
          userId: sellerPublic.ownerUserId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      ),
      em.findOne(
        VerificationEntity,
        {
          role: marketplaceSellerRoleFilter(),
          status: 'verified',
          tenantId: publication.tenantId,
          userId: sellerPublic.ownerUserId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      ),
    ]);
    if (!sellerRevision || !sellerPartner || !sellerMembership || !sellerVerification) {
      return { status: 'conflict', field: 'listingPublicationId' };
    }
    if (publication.sourceKind === 'product' && publication.productId) {
      const product = await em.findOne(
        ProductEntity,
        {
          id: publication.productId,
          status: 'active',
          supplierId: sellerPartner.id,
          tenantId: publication.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!product) {
        return { status: 'conflict', field: 'listingPublicationId' };
      }
      if (!Number.isInteger(product.stockQuantity) || product.stockQuantity < 1) {
        return { status: 'conflict', field: 'stockQuantity' };
      }
      return ok({
        availableQuantity: product.stockQuantity,
        publication,
        sellerPartner,
        sellerPublic,
        source: product,
      });
    }
    if (publication.sourceKind !== 'produce' || !publication.produceListingId) {
      return { status: 'conflict', field: 'listingPublicationId' };
    }
    const binding = await em.findOne(
      MarketplaceProduceOrganizationBindingEntity,
      {
        ownerUserId: sellerPublic.ownerUserId,
        produceListingId: publication.produceListingId,
        supplierPartnerId: sellerPartner.id,
        tenantId: publication.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    const produce = await em.findOne(
      ProduceListingEntity,
      { id: publication.produceListingId, status: 'active', tenantId: publication.tenantId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!binding || !produce) {
      return { status: 'conflict', field: 'listingPublicationId' };
    }
    if (!Number.isInteger(produce.availableQuantityKg) || produce.availableQuantityKg < 1) {
      return { status: 'conflict', field: 'stockQuantity' };
    }
    return ok({
      availableQuantity: produce.availableQuantityKg,
      publication,
      sellerPartner,
      sellerPublic,
      source: produce,
    });
  }
}
