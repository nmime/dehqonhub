// @requirements REQ-AGRITECH-STAGE2-017
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type {
  ActivateMarketplacePromotionInput,
  AgriTechOwner,
  MarketplaceListingPromotion,
  MarketplacePromotionRepository,
  OperationResult,
} from '@app/backend-feature-agritech-shared';
import {
  marketplacePromotionActivationFingerprint,
  marketplacePromotionPlanCatalog,
  marketplacePromotionPlans,
} from '@app/backend-feature-agritech-shared';

const maximumScheduledStartMilliseconds = 30 * 24 * 60 * 60_000;
const maximumPastClockSkewMilliseconds = 5 * 60_000;

type Clock = () => Date;

function unwrap<T>(result: OperationResult<T>, label: string): T {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(label);
  }
  if (result.status === 'forbidden' || result.status === 'partner_unapproved') {
    throw new ForbiddenException(label);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(label);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType: label } });
}

/** Framework-independent internal promotion activation orchestration. */
export class MarketplacePromotionDomainService {
  constructor(
    protected readonly repository: MarketplacePromotionRepository,
    protected readonly clock: Clock = () => new Date(),
  ) {}

  async activatePromotion(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: ActivateMarketplacePromotionInput,
  ): Promise<MarketplaceListingPromotion> {
    this.validateInput(input);
    return unwrap(
      await this.repository.activatePromotion(owner, {
        ...input,
        idempotencyKey,
        requestFingerprint: marketplacePromotionActivationFingerprint(input),
      }),
      'promotion',
    );
  }

  findPromotion(owner: AgriTechOwner, promotionId: string): Promise<MarketplaceListingPromotion | undefined> {
    return this.repository.findPromotion(owner, promotionId);
  }

  listPromotions(owner: AgriTechOwner): Promise<MarketplaceListingPromotion[]> {
    return this.repository.listPromotions(owner);
  }

  listPlans() {
    return marketplacePromotionPlanCatalog;
  }

  private validateInput(input: ActivateMarketplacePromotionInput): void {
    if (!Object.hasOwn(marketplacePromotionPlans, input.planCode)) {
      throw new BadRequestException({ meta: { field: 'planCode', resourceType: 'promotion' } });
    }
    if (!input.startsAt) {
      return;
    }
    const startsAt = input.startsAt.getTime();
    const now = this.clock().getTime();
    if (
      !Number.isFinite(startsAt) ||
      startsAt < now - maximumPastClockSkewMilliseconds ||
      startsAt > now + maximumScheduledStartMilliseconds
    ) {
      throw new BadRequestException({ meta: { field: 'startsAt', resourceType: 'promotion' } });
    }
  }
}
