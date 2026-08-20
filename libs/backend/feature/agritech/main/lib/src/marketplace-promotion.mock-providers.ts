// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import type {
  MarketplacePromotionBillingProvider,
  MarketplacePromotionBillingProviderResult,
} from '@app/backend-feature-agritech-shared';
import type { MarketplaceProviderConfig } from './marketplace-provider.config';

type Clock = () => Date;

/**
 * The simulation watermark a mock charge carries. It is the promotion-billing
 * counterpart of the mock contract artifact watermark: whatever reads the
 * receipt can tell at a glance that no money moved.
 */
export const marketplacePromotionBillingSimulationWatermark = 'MOCK PROVIDER — NO PAYMENT WAS TAKEN';

class DisabledPromotionBillingProvider implements MarketplacePromotionBillingProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';
  billListingPromotion(): Promise<MarketplacePromotionBillingProviderResult> {
    return Promise.reject(new Error('Marketplace promotion billing provider is disabled.'));
  }
}

export class MockPromotionBillingProvider implements MarketplacePromotionBillingProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-promotion-billing';

  constructor(private readonly clock: Clock = () => new Date()) {}

  billListingPromotion(
    input: Parameters<MarketplacePromotionBillingProvider['billListingPromotion']>[0],
  ): Promise<MarketplacePromotionBillingProviderResult> {
    return Promise.resolve({
      chargedAmountUzs: input.amountUzs,
      completedAt: this.clock(),
      currency: 'UZS',
      providerEventId: `mock-promotion-billing-event:${input.promotionId}`,
      providerMode: 'mock',
      providerName: this.name,
      providerReference: `mock-promotion-billing:${input.operationId}`,
      safeReceipt: {
        amountUzs: input.amountUzs,
        currency: 'UZS',
        moneyMoved: false,
        planCode: input.planCode,
        simulated: true,
        watermark: marketplacePromotionBillingSimulationWatermark,
      },
    });
  }
}

export function createPromotionBillingProvider(config: MarketplaceProviderConfig): MarketplacePromotionBillingProvider {
  if (config.promotionBilling.mode === 'mock') {
    return new MockPromotionBillingProvider();
  }
  if (config.promotionBilling.mode === 'live') {
    throw new Error('MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE=live requires a configured billing adapter.');
  }
  return new DisabledPromotionBillingProvider();
}
