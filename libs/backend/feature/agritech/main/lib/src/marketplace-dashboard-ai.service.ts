// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplaceDashboardAiRepositoryInjectToken,
  type MarketplaceDashboardAiRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceDashboardAiDomainService } from './marketplace-dashboard-ai.domain-service';

export * from './marketplace-dashboard-ai.domain-service';

@Injectable()
export class MarketplaceDashboardAiService extends MarketplaceDashboardAiDomainService {
  constructor(
    @Inject(MarketplaceDashboardAiRepositoryInjectToken)
    repository: MarketplaceDashboardAiRepository,
  ) {
    super(repository);
  }
}
