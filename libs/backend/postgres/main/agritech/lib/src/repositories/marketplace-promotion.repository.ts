// @requirements REQ-AGRITECH-STAGE2-017
import { Inject, Injectable } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  ActivateMarketplacePromotionCommand,
  AgriTechOwner,
  MarketplaceListingPromotion,
  MarketplacePromotionRepository,
  MarketplacePromotionReservation,
  OperationResult,
} from '@app/backend-feature-agritech-shared';
import {
  marketplacePromotionActivationFingerprint,
  marketplacePromotionPlans,
} from '@app/backend-feature-agritech-shared';
import { marketplaceSellerRoleFilter } from './marketplace-role-predicates';
import { MarketplacePartnerMembershipEntity } from '../entities/marketplace-commerce.entity';
import { VerificationEntity } from '../entities/marketplace.entity';
import { MarketplaceListingPromotionEntity } from '../entities/marketplace-promotion.entity';
import {
  MarketplaceListingPublicationEntity,
  MarketplacePublicSellerEntity,
} from '../entities/marketplace-public.entity';
import { AgriTechPartnerEntity } from '../entities/operations.entity';

const maximumScheduledStartMilliseconds = 30 * 24 * 60 * 60_000;
const maximumPastClockSkewMilliseconds = 5 * 60_000;
const safeIdempotencyKey = /^[A-Za-z0-9:_-]{8,100}$/u;

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });

const effectiveStatus = (
  entity: MarketplaceListingPromotionEntity,
  now: Date,
): MarketplaceListingPromotion['status'] => {
  if (entity.status === 'expired') {
    return 'expired';
  }
  if (entity.endsAt <= now) {
    return 'expired';
  }
  // A reservation whose charge never succeeded never served a catalog slot, so
  // it is never reported as a placement the seller paid for.
  if (entity.status === 'pending_billing') {
    return 'expired';
  }
  if (entity.startsAt <= now) {
    return 'active';
  }
  return 'scheduled';
};

const openPromotionStatuses = ['pending_billing', 'scheduled', 'active'] as const;

const toReservation = (entity: MarketplaceListingPromotionEntity): MarketplacePromotionReservation => ({
  id: entity.id,
  listingPublicId: entity.listingPublicationId,
  planCode: entity.planCode,
  priceUzs: Number(entity.priceUzs),
  revision: entity.revision,
  sellerPartnerId: entity.sellerPartnerId,
});

const toPromotion = (entity: MarketplaceListingPromotionEntity, now = new Date()): MarketplaceListingPromotion => ({
  activatedAt: entity.activatedAt,
  activationReference: entity.activationReference,
  createdAt: entity.createdAt,
  currency: 'UZS',
  endsAt: entity.endsAt,
  id: entity.id,
  listingPublicId: entity.listingPublicationId,
  planCode: entity.planCode,
  priceUzs: Number(entity.priceUzs),
  revision: entity.revision,
  sellerPartnerId: entity.sellerPartnerId,
  startsAt: entity.startsAt,
  status: effectiveStatus(entity, now),
  updatedAt: entity.updatedAt,
});

const isValidStart = (startsAt: Date | undefined, now: Date): boolean => {
  if (!startsAt) {
    return true;
  }
  const value = startsAt.getTime();
  return (
    Number.isFinite(value) &&
    value >= now.getTime() - maximumPastClockSkewMilliseconds &&
    value <= now.getTime() + maximumScheduledStartMilliseconds
  );
};

@Injectable()
export class PostgresMarketplacePromotionRepository implements MarketplacePromotionRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  /**
   * Reserves the paid slot without granting it. The row is inserted as
   * `pending_billing`, which holds the listing's single promotion slot but is
   * invisible to the catalog until a succeeded `promotion_billing` operation
   * settles it.
   */
  reservePromotion(
    owner: AgriTechOwner,
    input: ActivateMarketplacePromotionCommand,
  ): Promise<OperationResult<MarketplacePromotionReservation>> {
    const now = new Date();
    if (
      !Object.hasOwn(marketplacePromotionPlans, input.planCode) ||
      !safeIdempotencyKey.test(input.idempotencyKey) ||
      !isValidStart(input.startsAt, now) ||
      marketplacePromotionActivationFingerprint(input) !== input.requestFingerprint
    ) {
      return Promise.resolve({ status: 'invalid_state', field: 'promotionCommand' });
    }
    const plan = marketplacePromotionPlans[input.planCode];
    return this.em.transactional(async (em) => {
      const transactionTime = new Date();
      await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
        `marketplace-promotion-command:${owner.tenantId}:${owner.userId}:${input.idempotencyKey}`,
      ]);

      const existing = await em.findOne(
        MarketplaceListingPromotionEntity,
        {
          actorUserId: owner.userId,
          idempotencyKey: input.idempotencyKey,
          tenantId: owner.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (existing && existing.requestFingerprint !== input.requestFingerprint) {
        return { status: 'conflict', field: 'idempotencyKey' };
      }

      await em.execute('select pg_advisory_xact_lock(hashtext(?))', [`marketplace-promotion:${input.listingPublicId}`]);
      await this.expireEndedPromotion(em, input.listingPublicId, transactionTime);

      const authority = await this.findPromotionAuthority(em, owner, input.actingPartnerId, input.listingPublicId);
      if (authority.status !== 'ok') {
        return authority;
      }
      if (existing) {
        return ok(
          existing.status === 'pending_billing'
            ? toReservation(existing)
            : { ...toReservation(existing), settledPromotion: toPromotion(existing, transactionTime) },
        );
      }

      const current = await em.findOne(
        MarketplaceListingPromotionEntity,
        {
          listingPublicationId: input.listingPublicId,
          status: { $in: [...openPromotionStatuses] },
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (current) {
        return { status: 'conflict', field: 'listingPublicId' };
      }

      const startsAt = input.startsAt && input.startsAt > transactionTime ? input.startsAt : transactionTime;
      const promotion = new MarketplaceListingPromotionEntity();
      Object.assign(promotion, {
        activatedAt: transactionTime,
        activationReference: `promotion:${promotion.id}`,
        billingOperationId: null,
        endsAt: new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60_000),
        idempotencyKey: input.idempotencyKey,
        listingPublicationId: authority.value.publication.id,
        actorUserId: owner.userId,
        planCode: input.planCode,
        priceUzs: plan.priceUzs,
        requestFingerprint: input.requestFingerprint,
        sellerPartnerId: authority.value.partner.id,
        sellerPublicId: authority.value.seller.id,
        startsAt,
        status: 'pending_billing' as const,
        tenantId: owner.tenantId,
      });
      em.persist(promotion);
      await em.flush();
      return ok(toReservation(promotion));
    });
  }

  /**
   * Grants the reserved slot, but only against a succeeded charge for this exact
   * promotion. Re-settling the same operation returns the persisted record, so a
   * retry after a crash between the charge and this write is stable.
   */
  settlePromotion(
    owner: AgriTechOwner,
    promotionId: string,
    billingOperationId: string,
  ): Promise<OperationResult<MarketplaceListingPromotion>> {
    return this.em.transactional(async (em) => {
      const transactionTime = new Date();
      const promotion = await em.findOne(
        MarketplaceListingPromotionEntity,
        { actorUserId: owner.userId, id: promotionId, tenantId: owner.tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!promotion) {
        return { status: 'not_found', field: 'promotionId' };
      }
      if (promotion.status !== 'pending_billing') {
        return promotion.billingOperationId === billingOperationId
          ? ok(toPromotion(promotion, transactionTime))
          : { status: 'conflict', field: 'status' };
      }
      const charges = await em.execute<Array<{ id: string }>>(
        `select id
           from marketplace_provider_operations
          where id = ? and tenant_id = ? and user_id = ?
            and capability = 'promotion_billing' and actor_type = 'promotion_owner'
            and resource_type = 'promotion' and resource_id = ?
            and status = 'succeeded'
          for update`,
        [billingOperationId, owner.tenantId, owner.userId, promotionId],
      );
      if (charges.length !== 1) {
        return { status: 'conflict', field: 'billingOperation' };
      }
      promotion.status = promotion.startsAt > promotion.activatedAt ? 'scheduled' : 'active';
      promotion.billingOperationId = billingOperationId;
      promotion.revision += 1;
      promotion.updatedAt = transactionTime;
      await em.flush();
      return ok(toPromotion(promotion, transactionTime));
    });
  }

  async findPromotion(owner: AgriTechOwner, promotionId: string): Promise<MarketplaceListingPromotion | undefined> {
    const promotion = await this.em.findOne(MarketplaceListingPromotionEntity, {
      id: promotionId,
      status: { $ne: 'pending_billing' },
      tenantId: owner.tenantId,
    });
    if (!promotion || !(await this.hasActiveSellerMembership(owner, promotion.sellerPartnerId))) {
      return undefined;
    }
    return toPromotion(promotion);
  }

  async listPromotions(owner: AgriTechOwner): Promise<MarketplaceListingPromotion[]> {
    const memberships = await this.em.find(MarketplacePartnerMembershipEntity, {
      capability: 'seller',
      status: 'active',
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    const partnerIds = memberships.map(({ partnerId }) => partnerId);
    if (partnerIds.length === 0) {
      return [];
    }
    const promotions = await this.em.find(
      MarketplaceListingPromotionEntity,
      {
        sellerPartnerId: { $in: partnerIds },
        status: { $ne: 'pending_billing' },
        tenantId: owner.tenantId,
      },
      { orderBy: { createdAt: 'DESC' } },
    );
    return promotions.map((row) => toPromotion(row));
  }

  private async expireEndedPromotion(em: EntityManager, listingPublicId: string, now: Date): Promise<void> {
    const promotion = await em.findOne(
      MarketplaceListingPromotionEntity,
      {
        endsAt: { $lte: now },
        listingPublicationId: listingPublicId,
        status: { $in: [...openPromotionStatuses] },
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!promotion) {
      return;
    }
    promotion.status = 'expired';
    promotion.revision += 1;
    promotion.updatedAt = now;
    await em.flush();
  }

  private async findPromotionAuthority(
    em: EntityManager,
    owner: AgriTechOwner,
    actingPartnerId: string,
    listingPublicId: string,
  ): Promise<
    OperationResult<{
      partner: AgriTechPartnerEntity;
      publication: MarketplaceListingPublicationEntity;
      seller: MarketplacePublicSellerEntity;
    }>
  > {
    const verification = await em.findOne(
      VerificationEntity,
      {
        role: marketplaceSellerRoleFilter(),
        status: 'verified',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!verification) {
      return { status: 'forbidden', field: 'verification' };
    }
    const membership = await em.findOne(
      MarketplacePartnerMembershipEntity,
      {
        capability: 'seller',
        partnerId: actingPartnerId,
        status: 'active',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!membership) {
      return { status: 'forbidden', field: 'organizationMembership' };
    }
    const publication = await em.findOne(
      MarketplaceListingPublicationEntity,
      {
        id: listingPublicId,
        moderationStatus: 'approved',
        status: 'published',
        tenantId: owner.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!publication) {
      return { status: 'not_found', field: 'listingPublicId' };
    }
    const seller = await em.findOne(
      MarketplacePublicSellerEntity,
      {
        id: publication.sellerPublicId,
        partnerId: actingPartnerId,
        status: 'published',
        tenantId: owner.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!seller) {
      return { status: 'not_found', field: 'seller' };
    }
    const partner = await em.findOne(
      AgriTechPartnerEntity,
      {
        id: actingPartnerId,
        kind: 'supplier',
        status: 'approved',
        tenantId: owner.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    return partner ? ok({ partner, publication, seller }) : { status: 'forbidden', field: 'organization' };
  }

  private async hasActiveSellerMembership(owner: AgriTechOwner, partnerId: string): Promise<boolean> {
    return Boolean(
      await this.em.findOne(MarketplacePartnerMembershipEntity, {
        capability: 'seller',
        partnerId,
        status: 'active',
        tenantId: owner.tenantId,
        userId: owner.userId,
      }),
    );
  }
}
