// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplacePromotionBillingProviderInjectToken,
  MarketplacePromotionRepositoryInjectToken,
  MarketplaceProviderOperationRepositoryInjectToken,
  type MarketplacePromotionBillingProvider,
  type MarketplacePromotionRepository,
  type MarketplaceProviderOperationRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePromotionDomainService } from './marketplace-promotion.domain-service';
import { MarketplaceProviderConfigInjectToken, type MarketplaceProviderConfig } from './marketplace-provider.config';

@Injectable()
export class MarketplacePromotionService extends MarketplacePromotionDomainService {
  constructor(
    @Inject(MarketplacePromotionRepositoryInjectToken) repository: MarketplacePromotionRepository,
    @Inject(MarketplaceProviderOperationRepositoryInjectToken)
    providerOperations: MarketplaceProviderOperationRepository,
    @Inject(MarketplacePromotionBillingProviderInjectToken) billing: MarketplacePromotionBillingProvider,
    @Inject(MarketplaceProviderConfigInjectToken) config: MarketplaceProviderConfig,
  ) {
    super(repository, providerOperations, billing, config.promotionBilling.timeoutMs);
  }
}
