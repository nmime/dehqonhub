// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { describe, expect, it } from 'vitest';
import type { MarketplaceExternalProviderMode } from '@app/backend-feature-agritech-shared';
import {
  createPromotionBillingProvider,
  marketplacePromotionBillingSimulationWatermark,
  MockPromotionBillingProvider,
} from './marketplace-promotion.mock-providers';
import {
  resolveMarketplaceProviderConfig,
  type MarketplaceProviderConfig,
  type MarketplaceProviderConfigCapability,
} from './marketplace-provider.config';

const capabilities = [
  'oneId',
  'verificationDocuments',
  'contractArtifactStorage',
  'disputeEvidenceStorage',
  'qualifiedSignature',
  'promotionBilling',
  'directPayment',
  'factoring',
  'notificationDelivery',
] as const satisfies readonly MarketplaceProviderConfigCapability[];

const completedAt = new Date('2030-05-01T10:00:00.000Z');
const promotionId = '22222222-2222-4222-8222-222222222222';
const operationId = '44444444-4444-4444-8444-444444444444';

const charge = {
  amountUzs: 150_000,
  currency: 'UZS' as const,
  listingPublicId: '11111111-1111-4111-8111-111111111111',
  operationAttempt: 1,
  operationId,
  planCode: 'catalog_7d' as const,
  promotionId,
  sellerPartnerId: '33333333-3333-4333-8333-333333333333',
};

function configWithPromotionBilling(mode: MarketplaceExternalProviderMode): MarketplaceProviderConfig {
  return Object.fromEntries(
    capabilities.map((capability) => [capability, { mode, providerName: null, timeoutMs: 10_000 }]),
  ) as MarketplaceProviderConfig;
}

describe('marketplace promotion billing providers', () => {
  it('selects the deterministic mock adapter only when the capability is explicitly mocked', () => {
    const provider = createPromotionBillingProvider(
      resolveMarketplaceProviderConfig({
        MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE: 'mock',
        NODE_ENV: 'test',
      }),
    );

    expect(provider).toBeInstanceOf(MockPromotionBillingProvider);
    expect(provider).toMatchObject({ mode: 'mock', name: 'mock-promotion-billing' });
  });

  it('fails closed with a disabled adapter that refuses to charge', async () => {
    const provider = createPromotionBillingProvider(resolveMarketplaceProviderConfig({ NODE_ENV: 'test' }));

    expect(provider).toMatchObject({ mode: 'disabled', name: 'disabled' });
    await expect(provider.billListingPromotion(charge)).rejects.toThrow(
      /Marketplace promotion billing provider is disabled/u,
    );
  });

  it('refuses to boot a live capability with no configured adapter behind it', () => {
    expect(() => createPromotionBillingProvider(configWithPromotionBilling('live'))).toThrow(
      /MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE=live requires a configured billing adapter/u,
    );
  });

  it('discloses the simulation and never claims money moved', async () => {
    const provider = new MockPromotionBillingProvider(() => completedAt);

    await expect(provider.billListingPromotion(charge)).resolves.toEqual({
      chargedAmountUzs: 150_000,
      completedAt,
      currency: 'UZS',
      providerEventId: `mock-promotion-billing-event:${promotionId}`,
      providerMode: 'mock',
      providerName: 'mock-promotion-billing',
      providerReference: `mock-promotion-billing:${operationId}`,
      safeReceipt: {
        amountUzs: 150_000,
        currency: 'UZS',
        moneyMoved: false,
        planCode: 'catalog_7d',
        simulated: true,
        watermark: marketplacePromotionBillingSimulationWatermark,
      },
    });
  });

  it('reads the real clock when no clock is injected', async () => {
    const before = Date.now();

    const result = await new MockPromotionBillingProvider().billListingPromotion(charge);

    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
