// @requirements REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import type { AgriTechOwner, OperationResult } from './agritech.types';

export const MarketplacePromotionRepositoryInjectToken = Symbol('MarketplacePromotionRepositoryInjectToken');

export const marketplacePromotionPlans = {
  catalog_7d: { durationDays: 7, priceUzs: 150_000 },
  catalog_14d: { durationDays: 14, priceUzs: 270_000 },
  catalog_30d: { durationDays: 30, priceUzs: 500_000 },
} as const;

export const marketplacePromotionPlanCodes = Object.keys(marketplacePromotionPlans) as MarketplacePromotionPlanCode[];

export type MarketplacePromotionPlanCode = keyof typeof marketplacePromotionPlans;
export type MarketplacePromotionStatus = 'scheduled' | 'active' | 'expired';

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

export interface MarketplacePromotionRepository {
  activatePromotion(
    owner: AgriTechOwner,
    input: ActivateMarketplacePromotionCommand,
  ): Promise<OperationResult<MarketplaceListingPromotion>>;
  findPromotion(owner: AgriTechOwner, promotionId: string): Promise<MarketplaceListingPromotion | undefined>;
  listPromotions(owner: AgriTechOwner): Promise<MarketplaceListingPromotion[]>;
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
