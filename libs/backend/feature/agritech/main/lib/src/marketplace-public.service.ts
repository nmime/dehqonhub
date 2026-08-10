// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplacePublicRepositoryInjectToken,
  type MarketplacePublicRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePublicDomainService } from './marketplace-public.domain-service';

@Injectable()
export class MarketplacePublicService extends MarketplacePublicDomainService {
  constructor(
    @Inject(MarketplacePublicRepositoryInjectToken)
    repository: MarketplacePublicRepository,
  ) {
    super(repository);
  }
}
