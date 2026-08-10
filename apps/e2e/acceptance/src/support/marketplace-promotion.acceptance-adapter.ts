// @requirements REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { MarketplacePromotionDomainService } from '@app/backend-feature-agritech-main-marketplace-promotion-domain-service';
import type {
  ActivateMarketplacePromotionCommand,
  AgriTechOwner,
  MarketplaceListingPromotion,
  MarketplacePromotionRepository,
  OperationResult,
} from '@app/backend-feature-agritech-shared';
import * as agriTechSharedSource from '@app/backend-feature-agritech-shared';

const agriTechShared =
  (
    agriTechSharedSource as unknown as {
      default?: typeof agriTechSharedSource;
    }
  ).default ?? agriTechSharedSource;
const { marketplacePromotionActivationFingerprint, marketplacePromotionPlans } = agriTechShared;

const now = new Date('2030-01-01T00:00:00.000Z');
const seller = { tenantId: 'tenant-promotion-acceptance', userId: 'seller-promotion-acceptance' };
const promotedListingId = '11111111-1111-4111-8111-111111111111';
const plainListingId = '22222222-2222-4222-8222-222222222222';
const sellerPartnerId = '33333333-3333-4333-8333-333333333333';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });
const ownerKey = (owner: AgriTechOwner): string => `${owner.tenantId}:${owner.userId}`;

export interface MarketplacePromotionAcceptanceResult {
  catalog: Array<{ ad: boolean; id: string }>;
  persistedCount: number;
  promotion: MarketplaceListingPromotion;
  replayId: string;
}

class AcceptancePromotionRepository implements MarketplacePromotionRepository {
  private readonly promotions = new Map<string, MarketplaceListingPromotion>();
  private readonly commandIndex = new Map<string, { fingerprint: string; promotionId: string }>();

  activatePromotion(
    owner: AgriTechOwner,
    input: ActivateMarketplacePromotionCommand,
  ): Promise<OperationResult<MarketplaceListingPromotion>> {
    if (
      ownerKey(owner) !== ownerKey(seller) ||
      input.actingPartnerId !== sellerPartnerId ||
      input.listingPublicId !== promotedListingId
    ) {
      return Promise.resolve({ status: 'not_found', field: 'listingPublicId' });
    }
    if (marketplacePromotionActivationFingerprint(input) !== input.requestFingerprint) {
      return Promise.resolve({ status: 'invalid_state', field: 'requestFingerprint' });
    }
    const commandKey = `${ownerKey(owner)}:${input.idempotencyKey}`;
    const existingCommand = this.commandIndex.get(commandKey);
    if (existingCommand) {
      if (existingCommand.fingerprint !== input.requestFingerprint) {
        return Promise.resolve({ status: 'conflict', field: 'idempotencyKey' });
      }
      const replay = this.promotions.get(existingCommand.promotionId);
      return Promise.resolve(replay ? ok(structuredClone(replay)) : { status: 'invalid_state' });
    }
    if (
      [...this.promotions.values()].some(
        ({ listingPublicId, status }) => listingPublicId === input.listingPublicId && status !== 'expired',
      )
    ) {
      return Promise.resolve({ status: 'conflict', field: 'listingPublicId' });
    }
    const plan = marketplacePromotionPlans[input.planCode];
    const startsAt = input.startsAt ?? now;
    const id = randomUUID();
    const promotion: MarketplaceListingPromotion = {
      activatedAt: now,
      activationReference: `promotion:${id}`,
      createdAt: now,
      currency: 'UZS',
      endsAt: new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60_000),
      id,
      listingPublicId: input.listingPublicId,
      planCode: input.planCode,
      priceUzs: plan.priceUzs,
      revision: 0,
      sellerPartnerId,
      startsAt,
      status: startsAt > now ? 'scheduled' : 'active',
      updatedAt: now,
    };
    this.promotions.set(id, promotion);
    this.commandIndex.set(commandKey, { fingerprint: input.requestFingerprint, promotionId: id });
    return Promise.resolve(ok(structuredClone(promotion)));
  }

  findPromotion(owner: AgriTechOwner, promotionId: string): Promise<MarketplaceListingPromotion | undefined> {
    const promotion = ownerKey(owner) === ownerKey(seller) ? this.promotions.get(promotionId) : undefined;
    return Promise.resolve(promotion ? structuredClone(promotion) : undefined);
  }

  listPromotions(owner: AgriTechOwner): Promise<MarketplaceListingPromotion[]> {
    return Promise.resolve(ownerKey(owner) === ownerKey(seller) ? structuredClone([...this.promotions.values()]) : []);
  }
}

export class MarketplacePromotionAcceptanceAdapter {
  private readonly repository = new AcceptancePromotionRepository();
  private readonly service = new MarketplacePromotionDomainService(this.repository, () => now);

  seller(): AgriTechOwner {
    return structuredClone(seller);
  }

  async exerciseCatalogOnlyActivation(owner: AgriTechOwner): Promise<MarketplacePromotionAcceptanceResult> {
    const promotion = await this.service.activatePromotion(owner, 'promotion-acceptance-0001', {
      actingPartnerId: sellerPartnerId,
      listingPublicId: promotedListingId,
      planCode: 'catalog_7d',
    });
    const replay = await this.service.activatePromotion(owner, 'promotion-acceptance-0001', {
      actingPartnerId: sellerPartnerId,
      listingPublicId: promotedListingId,
      planCode: 'catalog_7d',
    });
    const promoted = new Set(
      (await this.repository.listPromotions(owner))
        .filter(({ startsAt, endsAt, status }) => status !== 'expired' && startsAt <= now && endsAt > now)
        .map(({ listingPublicId }) => listingPublicId),
    );
    const catalog = [plainListingId, promotedListingId]
      .map((id) => ({ ad: promoted.has(id), id }))
      .sort((left, right) => Number(right.ad) - Number(left.ad));
    return {
      catalog,
      persistedCount: (await this.repository.listPromotions(owner)).length,
      promotion,
      replayId: replay.id,
    };
  }
}
