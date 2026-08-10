// @requirements REQ-AGRITECH-STAGE2-017
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplacePromotionRepositoryInjectToken,
  type MarketplacePromotionRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePromotionDomainService } from './marketplace-promotion.domain-service';

@Injectable()
export class MarketplacePromotionService extends MarketplacePromotionDomainService {
  constructor(@Inject(MarketplacePromotionRepositoryInjectToken) repository: MarketplacePromotionRepository) {
    super(repository);
  }
}
