// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplaceEngagementRepositoryInjectToken,
  type MarketplaceEngagementRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceEngagementDomainService } from './marketplace-engagement.domain-service';

@Injectable()
export class MarketplaceEngagementService extends MarketplaceEngagementDomainService {
  constructor(
    @Inject(MarketplaceEngagementRepositoryInjectToken)
    repository: MarketplaceEngagementRepository,
  ) {
    super(repository);
  }
}
