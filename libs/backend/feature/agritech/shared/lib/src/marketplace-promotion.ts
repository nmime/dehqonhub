// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import type { AgriTechOwner, OperationResult } from './agritech.types';
import type { MarketplaceProviderIdentity } from './marketplace-contract-lifecycle';
import type { MarketplaceProviderSafeReceipt } from './marketplace-provider-operation';

export const MarketplacePromotionRepositoryInjectToken = Symbol('MarketplacePromotionRepositoryInjectToken');
export const MarketplacePromotionBillingProviderInjectToken = Symbol('MarketplacePromotionBillingProviderInjectToken');

export const marketplacePromotionPlans = {
  catalog_7d: { durationDays: 7, priceUzs: 150_000 },
  catalog_14d: { durationDays: 14, priceUzs: 270_000 },
  catalog_30d: { durationDays: 30, priceUzs: 500_000 },
} as const;

export const marketplacePromotionPlanCodes = Object.keys(marketplacePromotionPlans) as MarketplacePromotionPlanCode[];

export type MarketplacePromotionPlanCode = keyof typeof marketplacePromotionPlans;
export type MarketplacePromotionStatus = 'scheduled' | 'active' | 'expired';

/**
 * A promotion slot is reserved before it is charged and only leaves
 * `pending_billing` once a succeeded `promotion_billing` provider operation
 * backs it, so a reserved row never reaches catalog placement for free.
 */
export type MarketplacePromotionLifecycleStatus = MarketplacePromotionStatus | 'pending_billing';

export interface MarketplacePromotionPlan {
  code: MarketplacePromotionPlanCode;
  currency: 'UZS';
  durationDays: number;
  priceUzs: number;
}

export const marketplacePromotionPlanCatalog: readonly MarketplacePromotionPlan[] = marketplacePromotionPlanCodes.map(
  (code) => ({
    code,
    currency: 'UZS',
    durationDays: marketplacePromotionPlans[code].durationDays,
    priceUzs: marketplacePromotionPlans[code].priceUzs,
  }),
);

export interface MarketplaceListingPromotion {
  id: string;
  listingPublicId: string;
  sellerPartnerId: string;
  planCode: MarketplacePromotionPlanCode;
  status: MarketplacePromotionStatus;
  startsAt: Date;
  endsAt: Date;
  priceUzs: number;
  currency: 'UZS';
  activationReference: string;
  activatedAt: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivateMarketplacePromotionInput {
  actingPartnerId: string;
  listingPublicId: string;
  planCode: MarketplacePromotionPlanCode;
  startsAt?: Date;
}

export interface ActivateMarketplacePromotionCommand extends ActivateMarketplacePromotionInput {
  idempotencyKey: string;
  requestFingerprint: string;
}

/**
 * The persisted reservation a billing attempt is anchored to. `settledPromotion`
 * is present only when this exact command already paid, which makes an exact
 * replay return the original record without charging a second time.
 */
export interface MarketplacePromotionReservation {
  id: string;
  listingPublicId: string;
  planCode: MarketplacePromotionPlanCode;
  priceUzs: number;
  revision: number;
  sellerPartnerId: string;
  settledPromotion?: MarketplaceListingPromotion;
}

export interface MarketplacePromotionRepository {
  reservePromotion(
    owner: AgriTechOwner,
    input: ActivateMarketplacePromotionCommand,
  ): Promise<OperationResult<MarketplacePromotionReservation>>;
  settlePromotion(
    owner: AgriTechOwner,
    promotionId: string,
    billingOperationId: string,
  ): Promise<OperationResult<MarketplaceListingPromotion>>;
  findPromotion(owner: AgriTechOwner, promotionId: string): Promise<MarketplaceListingPromotion | undefined>;
  listPromotions(owner: AgriTechOwner): Promise<MarketplaceListingPromotion[]>;
}

export interface MarketplacePromotionBillingProviderResult {
  chargedAmountUzs: number;
  completedAt: Date;
  currency: 'UZS';
  providerEventId?: string;
  providerMode: 'mock' | 'live';
  providerName: string;
  providerReference: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
}

export interface MarketplacePromotionBillingProvider extends MarketplaceProviderIdentity {
  billListingPromotion(input: {
    amountUzs: number;
    currency: 'UZS';
    listingPublicId: string;
    operationAttempt: number;
    operationId: string;
    planCode: MarketplacePromotionPlanCode;
    promotionId: string;
    sellerPartnerId: string;
    signal?: AbortSignal;
  }): Promise<MarketplacePromotionBillingProviderResult>;
}

export function marketplacePromotionActivationFingerprint(input: ActivateMarketplacePromotionInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        actingPartnerId: input.actingPartnerId,
        listingPublicId: input.listingPublicId,
        planCode: input.planCode,
        startsAt: input.startsAt?.toISOString() ?? null,
      }),
    )
    .digest('hex');
}
